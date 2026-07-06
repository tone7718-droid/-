import test from "node:test";
import assert from "node:assert/strict";
import {jointAngle} from "../js/joints.js";
import {makeBody, bendKnee, raiseArmR, p} from "./helpers.js";

const near=(a,b,tol=3)=>assert.ok(Math.abs(a-b)<=tol, `${a} ≉ ${b}`);

test("무릎: 곧게 서면 ≈180°, 90° 굽히면 ≈90°", ()=>{
  near(jointAngle("kneeR", makeBody()).angle, 180);
  near(jointAngle("kneeR", bendKnee(makeBody(),"R",90)).angle, 90);
  near(jointAngle("kneeR", bendKnee(makeBody(),"R",135)).angle, 135);
});

test("어깨 외전: 차렷 ≈10° 미만, 옆으로 수평 ≈90°, 만세 ≈180°", ()=>{
  const rest=jointAngle("shoulderAbdR", makeBody());
  assert.ok(rest.angle<15, `rest=${rest.angle}`);
  assert.ok(rest.oop<0.2);
  near(jointAngle("shoulderAbdR", raiseArmR(makeBody(),90,"side")).angle, 90);
  near(jointAngle("shoulderAbdR", raiseArmR(makeBody(),170,"side")).angle, 170);
});

test("어깨 외전 측정 중 팔을 앞으로 들면 out-of-plane 경고", ()=>{
  const s=jointAngle("shoulderAbdR", raiseArmR(makeBody(),90,"front"));
  assert.ok(s.oop>0.9, `oop=${s.oop}`);
});

test("어깨 굴곡: 앞으로 수평 ≈90°, 옆으로 들면 out-of-plane", ()=>{
  const flex=jointAngle("shoulderFlexR", raiseArmR(makeBody(),90,"front"));
  near(flex.angle, 90);
  assert.ok(flex.oop<0.1);
  const wrong=jointAngle("shoulderFlexR", raiseArmR(makeBody(),90,"side"));
  assert.ok(wrong.oop>0.9);
});

test("3D 불변성: 몸 전체를 회전해도 무릎 각도 동일", ()=>{
  const rotY=(w,deg)=>{
    const t=deg*Math.PI/180;
    return w.map(q=>p(q.x*Math.cos(t)+q.z*Math.sin(t), q.y,
                      -q.x*Math.sin(t)+q.z*Math.cos(t), q.visibility));
  };
  const bent=bendKnee(makeBody(),"R",120);
  const a0=jointAngle("kneeR", bent).angle;
  for(const deg of [30, 60, 85]){
    near(jointAngle("kneeR", rotY(bent,deg)).angle, a0, 0.01);
  }
});

test("visibility: 측정점 중 최솟값이 반영된다", ()=>{
  const w=makeBody();
  w[26].visibility=0.3;   // 오른무릎 가림
  assert.equal(jointAngle("kneeR", w).vis, 0.3);
});
