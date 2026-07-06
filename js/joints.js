// joints.js — 관절 정의와 3D 월드 랜드마크 기반 각도 계산
// MediaPipe worldLandmarks(미터 단위, 골반 중심 원점)를 사용하므로
// 2D와 달리 카메라 시점이 바뀌어도 내각이 거의 불변이다.

import {angle3D, angleInPlane, sub, cross, dot, normalize, scale} from "./geometry.js";

// MediaPipe Pose 랜드마크 인덱스
export const LM = {
  LS:11, RS:12,   // 어깨
  LE:13, RE:14,   // 팔꿈치
  LW:15, RW:16,   // 손목
  LH:23, RH:24,   // 고관절
  LK:25, RK:26,   // 무릎
  LA:27, RA:28,   // 발목
};

export function mid(a, b){
  return {x:(a.x+b.x)/2, y:(a.y+b.y)/2, z:((a.z??0)+(b.z??0))/2};
}

/**
 * 몸통 기준 좌표계. 절대 축(카메라 축)이 아니라 랜드마크끼리의 상대 벡터만
 * 사용하므로 좌표 규약·카메라 기울기에 안전하다.
 */
export function trunkFrame(w){
  const ms=mid(w[LM.LS], w[LM.RS]), mh=mid(w[LM.LH], w[LM.RH]);
  const up=normalize(sub(ms, mh));            // 몸통 상방
  const right=normalize(sub(w[LM.LS], w[LM.RS])); // 어깨선
  if(!up || !right) return null;
  return {up, right, midShoulder:ms, midHip:mh};
}

/*
 * kind:
 *  - interior : 3점 내각 (무릎·팔꿈치·고관절). pts=[A, 꼭짓점, B]
 *  - elevation: 팔 올림각. 몸통 하방 벡터 대비 상완 벡터를 해부학적 평면
 *               (frontal=관상면/외전, sagittal=시상면/굴곡)에 사영해 측정.
 * target: 세션 ROM 목표(°) — AAOS 등 일반 임상 기준 근사(프로토타입용)
 * drawPts: 화면 강조용 2D 랜드마크 3점 [A, 꼭짓점, B]
 */
export const JOINTS = {
  kneeR:  {name:"무릎(우)",   kind:"interior", pts:[LM.RH, LM.RK, LM.RA], target:135},
  kneeL:  {name:"무릎(좌)",   kind:"interior", pts:[LM.LH, LM.LK, LM.LA], target:135},
  elbowR: {name:"팔꿈치(우)", kind:"interior", pts:[LM.RS, LM.RE, LM.RW], target:145},
  elbowL: {name:"팔꿈치(좌)", kind:"interior", pts:[LM.LS, LM.LE, LM.LW], target:145},
  hipR:   {name:"고관절(우)", kind:"interior", pts:[LM.RS, LM.RH, LM.RK], target:115},
  hipL:   {name:"고관절(좌)", kind:"interior", pts:[LM.LS, LM.LH, LM.LK], target:115},
  shoulderAbdR: {name:"어깨 외전(우)", kind:"elevation", side:"R", plane:"frontal",  target:165},
  shoulderAbdL: {name:"어깨 외전(좌)", kind:"elevation", side:"L", plane:"frontal",  target:165},
  shoulderFlexR:{name:"어깨 굴곡(우)", kind:"elevation", side:"R", plane:"sagittal", target:165},
  shoulderFlexL:{name:"어깨 굴곡(좌)", kind:"elevation", side:"L", plane:"sagittal", target:165},
};
for(const J of Object.values(JOINTS)){
  if(!J.drawPts) J.drawPts = J.kind==="interior"
    ? J.pts
    : (J.side==="R" ? [LM.RH, LM.RS, LM.RE] : [LM.LH, LM.LS, LM.LE]);
}

const vis = p => p.visibility ?? 1;

/**
 * 관절 각도 측정.
 * @param {string} key JOINTS 키
 * @param {Array} w   worldLandmarks[0] (33개 3D 포인트)
 * @returns {{angle:number|null, vis:number, oop:number}}
 *   oop(out-of-plane, 0~1): elevation 관절에서 팔이 측정 평면을 벗어난 정도.
 *   1에 가까우면 해당 평면의 각도로는 무의미(예: 외전 측정 중 팔을 앞으로 듦).
 */
export function jointAngle(key, w){
  const J=JOINTS[key];
  if(J.kind==="interior"){
    const [a,b,c]=J.pts.map(i=>w[i]);
    return {angle:angle3D(a,b,c), vis:Math.min(vis(a),vis(b),vis(c)), oop:0};
  }
  // elevation
  const f=trunkFrame(w);
  if(!f) return {angle:null, vis:0, oop:1};
  const S=w[J.side==="R"?LM.RS:LM.LS], E=w[J.side==="R"?LM.RE:LM.LE];
  const arm=sub(E,S), down=scale(f.up,-1);
  const normal = J.plane==="frontal" ? cross(f.up, f.right) : f.right;
  const nU=normalize(normal), armU=normalize(arm);
  if(!nU || !armU) return {angle:null, vis:0, oop:1};
  const oop=Math.abs(dot(armU, nU));
  const angle=angleInPlane(arm, down, normal);
  const trunkVis=Math.min(...[LM.LS,LM.RS,LM.LH,LM.RH].map(i=>vis(w[i])));
  return {angle, vis:Math.min(vis(S), vis(E), trunkVis), oop};
}
