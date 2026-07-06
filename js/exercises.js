// exercises.js — 정의된 운동 목록, rep 상태기계, 자동 동작 인식
// 오픈월드 동작 인식 대신: 각 운동마다 주 관절각 시그널과 진입/복귀 임계값을
// 정의하고, 모든 운동의 시그널을 병렬 평가해 활성 운동을 판별한다.
// 학습 모델 없이 완전 온디바이스로 동작한다.

import {JOINTS, jointAngle} from "./joints.js";

/*
 * dir: 노력 방향. -1 = 각도가 줄어드는 운동(굴곡: 스쿼트·컬 등),
 *                +1 = 각도가 커지는 운동(팔 올리기)
 * enter/exit: rep 진입/복귀 임계각(°). 히스테리시스로 채터링 방지 (enter를
 *             지나야 rep 시작, exit를 되돌아와야 rep 완료)
 * minRom: 유효 rep 최소 가동범위(°)
 * quiet: 자동 인식 시 "조용해야 하는" 운동 id — 함께 움직이면 감점
 *        (예: 양쪽 무릎이 같이 굽으면 한쪽 무릎 운동이 아니라 스쿼트)
 */
export const EXERCISES = {
  squat: {name:"스쿼트", joints:["kneeR","kneeL"], dir:-1, enter:150, exit:160, minRom:40,
    guide:"카메라에 전신이 보이게 서서 천천히 앉았다 일어나세요. 3D 측정이라 비스듬히 서도 됩니다."},
  kneeR: {name:"무릎 굴곡(우)", joints:["kneeR"], dir:-1, enter:150, exit:160, minRom:30, quiet:["kneeL"],
    guide:"오른쪽 무릎을 천천히 끝까지 굽혔다 펴세요. 다리 전체가 화면에 보여야 합니다."},
  kneeL: {name:"무릎 굴곡(좌)", joints:["kneeL"], dir:-1, enter:150, exit:160, minRom:30, quiet:["kneeR"],
    guide:"왼쪽 무릎을 천천히 끝까지 굽혔다 펴세요. 다리 전체가 화면에 보여야 합니다."},
  elbowR: {name:"팔꿈치 굴곡(우)", joints:["elbowR"], dir:-1, enter:140, exit:155, minRom:40, quiet:["elbowL"],
    guide:"오른팔 전체가 화면에 보이게 하고 팔꿈치를 굽혔다 펴세요."},
  elbowL: {name:"팔꿈치 굴곡(좌)", joints:["elbowL"], dir:-1, enter:140, exit:155, minRom:40, quiet:["elbowR"],
    guide:"왼팔 전체가 화면에 보이게 하고 팔꿈치를 굽혔다 펴세요."},
  shoulderAbdR: {name:"어깨 외전(우) · 옆으로", joints:["shoulderAbdR"], dir:1, enter:55, exit:40, minRom:45,
    planeWarn:"팔을 '옆으로' 드는 동작을 측정 중입니다 — 앞이 아닌 옆으로 올리세요",
    guide:"오른팔을 몸 '옆으로' 천천히 끝까지 들어 올렸다 내리세요."},
  shoulderAbdL: {name:"어깨 외전(좌) · 옆으로", joints:["shoulderAbdL"], dir:1, enter:55, exit:40, minRom:45,
    planeWarn:"팔을 '옆으로' 드는 동작을 측정 중입니다 — 앞이 아닌 옆으로 올리세요",
    guide:"왼팔을 몸 '옆으로' 천천히 끝까지 들어 올렸다 내리세요."},
  shoulderFlexR: {name:"어깨 굴곡(우) · 앞으로", joints:["shoulderFlexR"], dir:1, enter:55, exit:40, minRom:45,
    planeWarn:"팔을 '앞으로' 드는 동작을 측정 중입니다 — 옆이 아닌 앞으로 올리세요",
    guide:"오른팔을 몸 '앞으로' 천천히 끝까지 들어 올렸다 내리세요."},
  shoulderFlexL: {name:"어깨 굴곡(좌) · 앞으로", joints:["shoulderFlexL"], dir:1, enter:55, exit:40, minRom:45,
    planeWarn:"팔을 '앞으로' 드는 동작을 측정 중입니다 — 옆이 아닌 앞으로 올리세요",
    guide:"왼팔을 몸 '앞으로' 천천히 끝까지 들어 올렸다 내리세요."},
  hipR: {name:"고관절 굴곡(우)", joints:["hipR"], dir:-1, enter:150, exit:160, minRom:30, quiet:["hipL"],
    guide:"상체를 세운 채 오른쪽 무릎을 가슴 쪽으로 들어 올렸다 내리세요."},
  hipL: {name:"고관절 굴곡(좌)", joints:["hipL"], dir:-1, enter:150, exit:160, minRom:30, quiet:["hipR"],
    guide:"상체를 세운 채 왼쪽 무릎을 가슴 쪽으로 들어 올렸다 내리세요."},
};

/** 운동의 목표 ROM(°) = 구성 관절 target 평균 */
export function exTarget(id){
  const ex=EXERCISES[id];
  return Math.round(ex.joints.reduce((s,j)=>s+JOINTS[j].target,0)/ex.joints.length);
}

/**
 * 모든 운동의 시그널을 한 프레임에서 계산.
 * @returns {{[id]: {angle:number|null, vis:number, oop:number}}}
 */
export function exSignals(w){
  const cache={};
  const ja=k=>cache[k] ?? (cache[k]=jointAngle(k, w));
  const out={};
  for(const [id, ex] of Object.entries(EXERCISES)){
    const parts=ex.joints.map(ja);
    if(parts.some(p=>p.angle===null)){
      // 각도 계산 불가여도 vis/oop는 보존 — 호출부가 원인(가림 vs 평면 이탈)을 구분
      out[id]={angle:null,
               vis:Math.min(...parts.map(p=>p.vis)),
               oop:Math.max(...parts.map(p=>p.oop))};
      continue;
    }
    out[id]={
      angle: parts.reduce((s,p)=>s+p.angle,0)/parts.length,
      vis: Math.min(...parts.map(p=>p.vis)),
      oop: Math.max(...parts.map(p=>p.oop)),
    };
  }
  return out;
}

/**
 * rep 상태기계: 대기(rest) → 동작(active) → 복귀 시 rep 완료.
 * rep ROM = (대기 기준각 포함) 해당 rep 동안의 각도 excursion.
 * 세션 전체 min/max와 달리 이상치 1프레임에 오염되지 않는 rep 단위 측정이 목적.
 */
export class RepCounter {
  constructor(ex){ this.ex=ex; this.reset(); }
  reset(){ this.state="rest"; this.repRoms=[]; this.rest=null; this.curMin=null; this.curMax=null; }

  /** @returns {number|null} 이번 프레임에 rep이 완료됐으면 그 rep의 ROM(°) */
  push(angle){
    const {dir, enter, exit, minRom}=this.ex;
    const engaged  = dir>0 ? angle>enter : angle<enter;
    const released = dir>0 ? angle<exit  : angle>exit;
    if(this.state==="rest"){
      // 대기 중 도달한 극값(펴진 각)을 기준각으로 삼아
      // rep ROM에 대기~진입 구간을 포함시킨다
      this.rest = this.rest===null ? angle
        : (dir>0 ? Math.min(this.rest, angle) : Math.max(this.rest, angle));
      if(engaged){
        this.state="active";
        this.curMin=Math.min(angle, this.rest);
        this.curMax=Math.max(angle, this.rest);
      }
      return null;
    }
    this.curMin=Math.min(this.curMin, angle);
    this.curMax=Math.max(this.curMax, angle);
    if(released){
      this.state="rest";
      this.rest=angle;
      const rom=this.curMax-this.curMin;
      if(rom>=minRom){ this.repRoms.push(Math.round(rom)); return rom; }
    }
    return null;
  }
  get reps(){ return this.repRoms.length; }
}

/**
 * 자동 동작 인식: 최근 windowMs 동안 각 운동 시그널의 진폭을 minRom 대비
 * 점수화해 가장 활발한 운동을 고른다. quiet 규칙으로 겹치는 운동(스쿼트 vs
 * 한쪽 무릎)을 구분하고, 1.3배 히스테리시스로 감지 결과가 튀는 것을 막는다.
 */
export class AutoDetector {
  constructor(exIds=Object.keys(EXERCISES), windowMs=4000){
    this.windowMs=windowMs;
    this.buf=new Map(exIds.map(id=>[id, []]));
    this.current=null;
  }

  /**
   * @param {{[id]:{angle:number|null,vis:number}}} sig exSignals() 결과
   * @param {number} t 밀리초 타임스탬프
   * @returns {string|null} 감지된 운동 id
   */
  push(sig, t){
    const amp={};
    for(const [id, arr] of this.buf){
      const s=sig[id];
      if(s && s.angle!==null && s.vis>0.5) arr.push({t, a:s.angle});
      while(arr.length && t-arr[0].t>this.windowMs) arr.shift();
      if(arr.length>=8){
        let mn=Infinity, mx=-Infinity;
        for(const p of arr){ if(p.a<mn)mn=p.a; if(p.a>mx)mx=p.a; }
        amp[id]=mx-mn;
      }
    }
    let best=null, bestScore=0, curScore=0;
    for(const id in amp){
      const ex=EXERCISES[id];
      let score=amp[id]/ex.minRom;
      if(ex.joints.length>1) score*=1.25;           // 복합 운동(스쿼트) 우선
      if(ex.quiet) for(const q of ex.quiet){
        if((amp[q]??0) > 0.6*amp[id]) score*=0.3;   // 짝 관절이 같이 움직이면 감점
      }
      if(id===this.current) curScore=score;
      if(score>bestScore){ bestScore=score; best=id; }
    }
    if(best && bestScore>=1 && best!==this.current
       && (this.current===null || bestScore>curScore*1.3)){
      this.current=best;
    }else if(this.current && curScore<0.5 && bestScore<1){
      this.current=null;
    }
    return this.current;
  }
  reset(){ for(const arr of this.buf.values()) arr.length=0; this.current=null; }
}
