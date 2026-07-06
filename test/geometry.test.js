import test from "node:test";
import assert from "node:assert/strict";
import {angle3D, angleBetween, angleInPlane, median,
        Ema, Median3, JitterMeter, frameQuality} from "../js/geometry.js";

const near=(a,b,tol=0.5)=>assert.ok(Math.abs(a-b)<=tol, `${a} ≉ ${b}`);

test("angle3D: 직각", ()=>{
  near(angle3D({x:1,y:0,z:0},{x:0,y:0,z:0},{x:0,y:1,z:0}), 90);
});

test("angle3D: 일직선 = 180°", ()=>{
  near(angle3D({x:-1,y:0,z:0},{x:0,y:0,z:0},{x:1,y:0,z:0}), 180);
});

test("angle3D: z축 성분 반영 (3D)", ()=>{
  near(angle3D({x:0,y:-1,z:0},{x:0,y:0,z:0},{x:0,y:0.7,z:0.7}), 135);
});

test("angle3D: 시점 회전에 불변", ()=>{
  // 같은 팔 모양을 y축 기준 60° 회전 — 내각은 동일해야 함
  const rot=v=>{
    const t=Math.PI/3;
    return {x:v.x*Math.cos(t)+v.z*Math.sin(t), y:v.y, z:-v.x*Math.sin(t)+v.z*Math.cos(t)};
  };
  const a={x:0.3,y:-0.1,z:0.05}, b={x:0,y:0,z:0}, c={x:0.1,y:0.25,z:-0.1};
  near(angle3D(a,b,c), angle3D(rot(a),rot(b),rot(c)), 1e-6);
});

test("angle3D: 퇴화(겹친 점) = null", ()=>{
  assert.equal(angle3D({x:0,y:0,z:0},{x:0,y:0,z:0},{x:1,y:0,z:0}), null);
});

test("angleInPlane: 평면 사영 각도", ()=>{
  // xy평면(법선 z)에서 x축 vs y축 = 90°, z성분은 무시
  near(angleInPlane({x:1,y:0,z:5},{x:0,y:1,z:-3},{x:0,y:0,z:1}), 90);
});

test("angleInPlane: 법선과 평행한 벡터는 null", ()=>{
  assert.equal(angleInPlane({x:0,y:0,z:1},{x:1,y:0,z:0},{x:0,y:0,z:1}), null);
});

test("median", ()=>{
  assert.equal(median([3,1,2]), 2);
  assert.equal(median([4,1,2,3]), 2.5);
  assert.equal(median([]), null);
});

test("Ema: 첫 값은 그대로, 이후 수렴", ()=>{
  const e=new Ema(0.5);
  assert.equal(e.push(10), 10);
  assert.equal(e.push(20), 15);
});

test("Median3: 단일 프레임 스파이크 제거, 추세는 지연 없이 따라감", ()=>{
  const m=new Median3();
  m.push(90); m.push(91);
  assert.equal(m.push(400), 91);   // 스파이크 무시
  assert.equal(m.push(92), 92);    // 정상 추세 복귀
  const ramp=new Median3();
  ramp.push(100); ramp.push(110);
  assert.equal(ramp.push(120), 110);  // 단조 램프에서 1프레임 지연뿐, 편향 없음
});

test("JitterMeter: 일정한 신호는 0, 진동 신호는 큼", ()=>{
  const flat=new JitterMeter();
  for(const v of [90,90,90,90]) flat.push(v);
  assert.equal(flat.value, 0);
  const noisy=new JitterMeter();
  for(const v of [90,100,90,100,90]) noisy.push(v);
  assert.ok(noisy.value>=9);
});

test("frameQuality: 좋은 조건=100, 나쁜 조건=0, 범위 준수", ()=>{
  assert.equal(frameQuality(1, 0), 100);
  assert.equal(frameQuality(0.3, 0), 0);
  assert.equal(frameQuality(1, 10), 0);
  const q=frameQuality(0.7, 3);
  assert.ok(q>0 && q<100);
});
