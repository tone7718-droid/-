import test from "node:test";
import assert from "node:assert/strict";
import {EXERCISES, RepCounter, AutoDetector, exSignals, exTarget} from "../js/exercises.js";
import {makeBody, bendKnee} from "./helpers.js";

// 175° ↔ bottom° 왕복 각도 시퀀스 생성 (10° 스텝)
function wave(bottom, cycles, rest=175){
  const seq=[];
  for(let c=0;c<cycles;c++){
    for(let a=rest;a>bottom;a-=10) seq.push(a);
    for(let a=bottom;a<=rest;a+=10) seq.push(a);
  }
  return seq;
}

test("RepCounter: 스쿼트 3회 → 3 reps, rep ROM ≈ 80°", ()=>{
  const rc=new RepCounter(EXERCISES.squat);
  for(const a of wave(95,3)) rc.push(a);
  assert.equal(rc.reps, 3);
  for(const rom of rc.repRoms) assert.ok(Math.abs(rom-80)<=5, `rom=${rom}`);
});

test("RepCounter: enter 임계값을 안 넘으면 rep 없음", ()=>{
  const rc=new RepCounter(EXERCISES.squat);
  for(const a of wave(155,3)) rc.push(a);   // 155°까지만 (enter=150 미달)
  assert.equal(rc.reps, 0);
});

test("RepCounter: minRom 미만 얕은 동작은 rep 아님", ()=>{
  const rc=new RepCounter(EXERCISES.squat);  // minRom=40
  for(const a of wave(145,2)) rc.push(a);    // excursion ≈30°
  assert.equal(rc.reps, 0);
});

test("RepCounter: 히스테리시스 — 임계값 근처 노이즈로 이중 카운트 안 함", ()=>{
  const rc=new RepCounter(EXERCISES.squat);  // enter=150, exit=160
  for(const a of [175,174,148,152,148,153,110,95,120,152,148,155,165,172]) rc.push(a);
  assert.equal(rc.reps, 1);
});

test("RepCounter: 각도가 커지는 운동(dir=+1, 어깨)도 카운트", ()=>{
  const rc=new RepCounter(EXERCISES.shoulderAbdR);
  const seq=[];
  for(let c=0;c<2;c++){
    for(let a=10;a<170;a+=10) seq.push(a);
    for(let a=170;a>=10;a-=10) seq.push(a);
  }
  for(const a of seq) rc.push(a);
  assert.equal(rc.reps, 2);
  assert.ok(rc.repRoms[0]>=150);
});

test("exSignals: 스쿼트 시그널 = 양 무릎 평균", ()=>{
  let w=makeBody();
  w=bendKnee(w,"R",100);
  w=bendKnee(w,"L",120);
  const sig=exSignals(w);
  assert.ok(Math.abs(sig.squat.angle-110)<=3, `squat=${sig.squat.angle}`);
});

test("exTarget: 스쿼트 목표 = 무릎 target", ()=>{
  assert.equal(exTarget("squat"), 135);
});

// ── 자동 인식 ────────────────────────────────────────────────

function staticSig(){
  // 모든 운동이 정지 상태인 시그널
  const s={};
  for(const [id,ex] of Object.entries(EXERCISES))
    s[id]={angle:ex.dir<0?175:10, vis:1, oop:0};
  return s;
}

function feed(det, frames){
  let out=null, t=0;
  for(const f of frames){ out=det.push(f, t); t+=100; }  // 10fps
  return out;
}

test("AutoDetector: 아무도 안 움직이면 null", ()=>{
  const det=new AutoDetector();
  assert.equal(feed(det, Array.from({length:40}, staticSig)), null);
});

test("AutoDetector: 양 무릎이 함께 굽으면 스쿼트 (한쪽 무릎 아님)", ()=>{
  const det=new AutoDetector();
  const seq=wave(95,3);
  const frames=seq.map(a=>{
    const s=staticSig();
    s.kneeR={angle:a,vis:1,oop:0};
    s.kneeL={angle:a,vis:1,oop:0};
    s.squat={angle:a,vis:1,oop:0};
    // 스쿼트는 고관절도 함께 굽는다
    s.hipR={angle:a+5,vis:1,oop:0};
    s.hipL={angle:a+5,vis:1,oop:0};
    return s;
  });
  assert.equal(feed(det, frames), "squat");
});

test("AutoDetector: 오른 무릎만 움직이면 kneeR", ()=>{
  const det=new AutoDetector();
  const frames=wave(95,3).map(a=>{
    const s=staticSig();
    s.kneeR={angle:a,vis:1,oop:0};
    s.squat={angle:(a+175)/2,vis:1,oop:0};   // 평균이라 진폭 절반
    return s;
  });
  assert.equal(feed(det, frames), "kneeR");
});

test("AutoDetector: 가시성 낮은 시그널은 무시", ()=>{
  const det=new AutoDetector();
  const frames=wave(95,3).map(a=>{
    const s=staticSig();
    s.kneeR={angle:a, vis:0.2, oop:0};   // 가려진 상태의 요동
    return s;
  });
  assert.equal(feed(det, frames), null);
});
