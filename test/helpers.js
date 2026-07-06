// 테스트용 합성 랜드마크 생성기.
// MediaPipe world 좌표 규약(원점=골반 중심, y는 화면 아래 방향)을 따르는
// "차렷 자세" 33점 신체를 만든다. 각 테스트가 필요한 관절만 움직여 사용한다.

export function p(x, y, z=0, visibility=1){ return {x, y, z, visibility}; }

export function makeBody(){
  const w=Array.from({length:33}, ()=>p(0,0,0));
  w[11]=p( 0.15, -0.50, 0);  // 왼어깨
  w[12]=p(-0.15, -0.50, 0);  // 오른어깨
  w[13]=p( 0.18, -0.25, 0);  // 왼팔꿈치 (팔 내림)
  w[14]=p(-0.18, -0.25, 0);  // 오른팔꿈치
  w[15]=p( 0.20,  0.00, 0);  // 왼손목
  w[16]=p(-0.20,  0.00, 0);  // 오른손목
  w[23]=p( 0.10,  0.00, 0);  // 왼골반
  w[24]=p(-0.10,  0.00, 0);  // 오른골반
  w[25]=p( 0.10,  0.45, 0);  // 왼무릎
  w[26]=p(-0.10,  0.45, 0);  // 오른무릎
  w[27]=p( 0.10,  0.90, 0);  // 왼발목
  w[28]=p(-0.10,  0.90, 0);  // 오른발목
  return w;
}

/**
 * 무릎 굽힘각 적용: theta = 무릎 내각(°). 180=곧게 섬.
 * 정강이를 시상면에서 회전시켜 발목 위치를 이동한다.
 */
export function bendKnee(w, side, theta){
  const knee=side==="R"?26:25, ankle=side==="R"?28:27;
  const phi=(180-theta)*Math.PI/180;
  w[ankle]=p(w[knee].x, w[knee].y+0.45*Math.cos(phi), 0.45*Math.sin(phi));
  return w;
}

/** 오른팔 올림: elev=올림각(°, 0=차렷), azimuth "side"|"front" */
export function raiseArmR(w, elev, azimuth="side"){
  const S=w[12];
  const r=0.3, a=elev*Math.PI/180;
  const drop=r*Math.cos(a);   // 아래 방향(y+) 성분
  const out=r*Math.sin(a);    // 평면 내 성분
  if(azimuth==="side") w[14]=p(S.x-out, S.y+drop, 0);
  else                 w[14]=p(S.x, S.y+drop, -out);
  return w;
}
