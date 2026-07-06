import test from "node:test";
import assert from "node:assert/strict";
import {migrateV1, toCsv, summarize} from "../js/session.js";

test("migrateV1: 구 관절 키를 운동 id로 변환", ()=>{
  const v2=migrateV1([
    {t:1, j:"kneeR", min:40, max:170, rom:130, c:10},
    {t:2, j:"shoulderR", min:5, max:150, rom:145},
  ]);
  assert.equal(v2[0].ex, "kneeR");
  assert.equal(v2[1].ex, "shoulderAbdR");
  assert.equal(v2[0].c, 10);
  assert.equal(v2[1].c, null);
  assert.equal(v2[0].reps, null);
});

test("migrateV1: 알 수 없는 키는 버린다", ()=>{
  assert.equal(migrateV1([{t:1, j:"unknown", rom:10}]).length, 0);
});

test("toCsv: 헤더 + 레코드", ()=>{
  const csv=toCsv([{t:0, ex:"squat", min:90, max:175, rom:85, reps:3, med:82, q:88, c:5}]);
  const lines=csv.trim().split("\n");
  assert.equal(lines.length, 2);
  assert.match(lines[0], /^date,exercise,min,max,rom,reps,med_rom,quality,comp_pct$/);
  assert.match(lines[1], /스쿼트,90,175,85,3,82,88,5$/);
});

test("summarize: 기록 2회 미만이면 null", ()=>{
  assert.equal(summarize([{t:1, ex:"squat", rom:80}], "squat"), null);
});

test("summarize: 추세·반복·품질 문구 포함", ()=>{
  const recs=[
    {t:1, ex:"squat", min:100, max:170, rom:70, c:20, reps:null, med:null, q:null},
    {t:2, ex:"squat", min:95,  max:175, rom:80, c:10, reps:5, med:78, q:45},
  ];
  const s=summarize(recs, "squat");
  assert.match(s, /【추세】/);
  assert.match(s, /5회 반복/);
  assert.match(s, /【품질】/);        // q=45 < 60
  assert.match(s, /의료적 진단이 아닙니다/);
});
