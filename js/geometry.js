// geometry.js — 벡터/각도/통계 순수 수학. DOM·MediaPipe 의존 없음 (단위 테스트 대상)

export function sub(a, b){ return {x:a.x-b.x, y:a.y-b.y, z:(a.z??0)-(b.z??0)}; }
export function dot(a, b){ return a.x*b.x + a.y*b.y + (a.z??0)*(b.z??0); }
export function cross(a, b){
  const az=a.z??0, bz=b.z??0;
  return {x:a.y*bz-az*b.y, y:az*b.x-a.x*bz, z:a.x*b.y-a.y*b.x};
}
export function scale(v, s){ return {x:v.x*s, y:v.y*s, z:(v.z??0)*s}; }
export function norm(v){ return Math.hypot(v.x, v.y, v.z??0); }
export function normalize(v){
  const n=norm(v);
  return n<1e-9 ? null : {x:v.x/n, y:v.y/n, z:(v.z??0)/n};
}

/** 두 벡터 사이 각도(°, 0~180). 영벡터면 null */
export function angleBetween(v1, v2){
  const m=norm(v1)*norm(v2);
  if(m<1e-9) return null;
  const c=Math.min(1, Math.max(-1, dot(v1,v2)/m));
  return Math.acos(c)*180/Math.PI;
}

/** 꼭짓점 b의 내각(°). 3D 월드 좌표 기준 — 카메라 시점에 불변 */
export function angle3D(a, b, c){ return angleBetween(sub(a,b), sub(c,b)); }

/** v를 법선 n(단위벡터)에 수직인 평면으로 사영 */
export function projectOntoPlane(v, n){
  const d=dot(v, n);
  return {x:v.x-n.x*d, y:v.y-n.y*d, z:(v.z??0)-(n.z??0)*d};
}

/** 평면(법선 normal) 위로 사영한 두 벡터 사이 각도(°). 사영이 퇴화하면 null */
export function angleInPlane(v1, v2, normal){
  const n=normalize(normal);
  if(!n) return null;
  const p1=projectOntoPlane(v1, n), p2=projectOntoPlane(v2, n);
  if(norm(p1)<1e-6 || norm(p2)<1e-6) return null;
  return angleBetween(p1, p2);
}

export function median(arr){
  if(!arr.length) return null;
  const s=[...arr].sort((a,b)=>a-b);
  const m=s.length>>1;
  return s.length%2 ? s[m] : (s[m-1]+s[m])/2;
}

/** 지수이동평균 스무딩 */
export class Ema {
  constructor(alpha=0.3){ this.alpha=alpha; this.v=null; }
  push(x){ this.v = this.v===null ? x : this.v*(1-this.alpha)+x*this.alpha; return this.v; }
  reset(){ this.v=null; }
  get value(){ return this.v; }
}

/**
 * 최근 3프레임 중앙값 필터 — 단일 프레임 스파이크를 제거하면서
 * EMA와 달리 지연·편향이 없어 min/max(ROM) 측정 경로에 적합하다.
 */
export class Median3 {
  constructor(){ this.buf=[]; }
  push(x){
    this.buf.push(x);
    if(this.buf.length>3) this.buf.shift();
    return median(this.buf);
  }
  reset(){ this.buf=[]; }
}

/** 프레임 간 각도 변화의 RMS(°) — 측정 흔들림 지표 */
export class JitterMeter {
  constructor(size=15){ this.size=size; this.buf=[]; this.last=null; }
  push(a){
    if(this.last!==null){
      this.buf.push(a-this.last);
      if(this.buf.length>this.size) this.buf.shift();
    }
    this.last=a;
    return this.value;
  }
  get value(){
    if(!this.buf.length) return 0;
    return Math.sqrt(this.buf.reduce((s,d)=>s+d*d,0)/this.buf.length);
  }
  reset(){ this.buf=[]; this.last=null; }
}

/**
 * 프레임 측정 품질(0~100).
 * vis: 측정 관절 3점의 최소 visibility(0~1), jitter: 각도 RMS(°/frame)
 * visibility 0.85↑ 및 지터 1.5°↓ 에서 100, 그 아래로 선형 감쇠
 */
export function frameQuality(vis, jitter){
  const visF = Math.min(1, Math.max(0, (vis-0.4)/0.45));
  const jitF = Math.min(1, Math.max(0, 1-(jitter-1.5)/6));
  return Math.round(100*visF*jitF);
}
