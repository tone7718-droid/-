// app.js — 진입점: 카메라·MediaPipe 파이프라인, 프레임 처리, 화면 그리기
// MediaPipe 모듈은 카메라 시작 시 동적 import 하므로, 페이지 로드와
// 프레임 처리 로직(processFrame)은 네트워크 없이도 동작·테스트 가능하다.

import {JOINTS} from "./joints.js";
import {EXERCISES, RepCounter, AutoDetector, exTarget, exSignals} from "./exercises.js";
import {Ema, Median3, JitterMeter, frameQuality, median} from "./geometry.js";
import * as ui from "./ui.js";
import * as store from "./session.js";

const CDN="https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";
const $=id=>document.getElementById(id);
const video=$("video"), canvas=$("canvas"), ctx=canvas.getContext("2d");

let mp=null, landmarker=null, running=false, lastTs=-1;

// ── 측정 상태 ──────────────────────────────────────────────
let activeEx, session, counter, smooth, spike, jitter, detector;

function newSession(){
  session={min:Infinity, max:-Infinity, comp:0, frames:0, qSum:0};
  counter=new RepCounter(EXERCISES[activeEx]);
  smooth=new Ema(0.3);      // 표시용 (부드러운 게이지)
  spike=new Median3();      // 측정용 (지연 없는 스파이크 제거)
  jitter=new JitterMeter(15);
  ui.resetReadout();
}

function switchExercise(id){
  if(!EXERCISES[id]) return;
  activeEx=id;
  $("exSelect").value=id;
  newSession();
  ui.setGuide(id);
  ui.renderHistory(store.loadRecords(), id, onDeleteRecord);
  $("aiBox").style.display="none";
}

function onDeleteRecord(t){
  store.deleteRecord(t);
  ui.renderHistory(store.loadRecords(), activeEx, onDeleteRecord);
}

// ── 보상 움직임 감지 (2D 랜드마크 — 화면 기준 상대 지표라 2D가 적합) ──
function compWarn2D(lm, exId){
  const mShX=(lm[11].x+lm[12].x)/2, mShY=(lm[11].y+lm[12].y)/2;
  const mHpX=(lm[23].x+lm[24].x)/2, mHpY=(lm[23].y+lm[24].y)/2;
  const torso=Math.abs(mShY-mHpY);
  const tilt=Math.atan2(mShX-mHpX, mHpY-mShY)*180/Math.PI;   // 0° = 몸통 수직
  if(exId.startsWith("shoulder") && Math.abs(tilt)>12)
    return "몸통 기울임 보상 — 상체를 곧게 세우고 팔만 올리세요";
  if(exId.startsWith("hip") && Math.abs(tilt)>15)
    return "몸통 젖힘 보상 — 상체를 세운 채 다리만 들어 올리세요";
  if(/^shoulder(Abd|Flex)R$/.test(exId) && torso>0 && (lm[11].y-lm[12].y)/torso>0.08)
    return "어깨 들림(으쓱) 보상 — 어깨를 내리고 팔만 올리세요";
  if(/^shoulder(Abd|Flex)L$/.test(exId) && torso>0 && (lm[12].y-lm[11].y)/torso>0.08)
    return "어깨 들림(으쓱) 보상 — 어깨를 내리고 팔만 올리세요";
  return null;
}

// ── 프레임 처리 (그리기와 분리 — 테스트에서 합성 프레임 주입 가능) ──
const MIN_QUALITY=40;

function processFrame(result, tMs){
  const lm=result.landmarks?.[0], w=result.worldLandmarks?.[0];
  if(!lm || !w){ ui.setAngle(null); return {lm:null}; }

  const sig=exSignals(w);

  if($("autoChk").checked){
    const det=detector.push(sig, tMs);
    ui.setDetected(det?EXERCISES[det].name:null);
    if(det && det!==activeEx) switchExercise(det);
  }

  const s=sig[activeEx];
  const ex=EXERCISES[activeEx];
  let warn=null;
  if(!s || s.vis<0.5)
    warn="측정 관절이 화면에 충분히 보이지 않습니다";
  else if(s.oop>0.85)                     // 평면 이탈은 각도 null보다 먼저 판정
    warn=ex.planeWarn ?? "운동 평면을 벗어났습니다";
  else if(s.angle===null)
    warn="측정 관절이 화면에 충분히 보이지 않습니다";

  if(warn){
    ui.setAngle(null);
    ui.feedback("warn", "⚠ "+warn+" — 올바른 자세에서만 ROM이 기록됩니다.");
    return {lm, warn};
  }

  const comp=compWarn2D(lm, activeEx);
  const q=frameQuality(s.vis, jitter.push(s.angle));
  const meas=spike.push(s.angle);   // 측정 경로: EMA 지연 없이 스파이크만 제거
  const angle=smooth.push(meas);    // 표시 경로

  if(q>=MIN_QUALITY){
    session.frames++;
    session.qSum+=q;
    if(comp) session.comp++;
    session.min=Math.min(session.min, meas);
    session.max=Math.max(session.max, meas);
    counter.push(meas);
  }

  ui.setAngle(angle);
  ui.setStats(session, counter, exTarget(activeEx), q);
  if(comp) ui.feedback("warn", "🔴 "+comp);
  else ui.progressFeedback(activeEx, session.max-session.min, counter.reps);

  return {lm, angle, comp, q};
}

// ── 화면 그리기 (카메라 루프에서만 호출) ──────────────────────
function draw(info){
  ctx.save();
  ctx.translate(canvas.width,0); ctx.scale(-1,1);      // 거울 모드
  ctx.drawImage(video,0,0,canvas.width,canvas.height);
  const lm=info.lm;
  if(!lm){ ctx.restore(); return; }

  const du=new mp.DrawingUtils(ctx);
  du.drawConnectors(lm, mp.PoseLandmarker.POSE_CONNECTIONS,
    {color:"rgba(255,255,255,.35)", lineWidth:2});

  const col=info.warn ? "#E8B14C" : (info.comp ? "#E05C5C" : "#19D3A5");
  const px=p=>({x:p.x*canvas.width, y:p.y*canvas.height});

  if(info.angle!=null){
    let labelAt=null;
    for(const jk of EXERCISES[activeEx].joints){
      const [pa,pb,pc]=JOINTS[jk].drawPts.map(i=>px(lm[i]));
      ctx.strokeStyle=col; ctx.lineWidth=4; ctx.lineCap="round";
      ctx.beginPath(); ctx.moveTo(pa.x,pa.y); ctx.lineTo(pb.x,pb.y); ctx.lineTo(pc.x,pc.y); ctx.stroke();
      for(const p of [pa,pc]){
        ctx.fillStyle=col; ctx.beginPath(); ctx.arc(p.x,p.y,6,0,7); ctx.fill();
      }
      ctx.lineWidth=3; ctx.strokeStyle=col;
      ctx.beginPath(); ctx.arc(pb.x,pb.y,10,0,7); ctx.stroke();
      labelAt=labelAt??pb;
    }
    // 각도 라벨 (거울 보정 위해 텍스트만 재반전)
    ctx.save();
    ctx.translate(labelAt.x, labelAt.y); ctx.scale(-1,1);
    ctx.font="600 17px 'IBM Plex Mono'";
    const t=Math.round(info.angle)+"°";
    ctx.fillStyle="rgba(13,20,22,.75)";
    const tw=ctx.measureText(t).width;
    ctx.fillRect(10,-26,tw+14,24);
    ctx.fillStyle=col; ctx.fillText(t,17,-8);
    ctx.restore();
  }

  const banner=info.warn||info.comp;
  if(banner){
    ctx.save();
    ctx.scale(-1,1); ctx.translate(-canvas.width,0);
    ctx.font="600 16px 'IBM Plex Sans KR'";
    const bw=ctx.measureText(banner).width;
    ctx.fillStyle=info.warn ? "rgba(216,122,38,.92)" : "rgba(192,57,57,.92)";
    ctx.fillRect(canvas.width/2-bw/2-14,16,bw+28,34);
    ctx.fillStyle="#fff";
    ctx.fillText(banner, canvas.width/2-bw/2, 39);
    ctx.restore();
  }
  ctx.restore();
}

// ── 카메라 루프 ──────────────────────────────────────────────
let fpsT=performance.now(), fpsN=0;
function loop(){
  if(!running) return;
  if(video.currentTime!==lastTs){
    lastTs=video.currentTime;
    const now=performance.now();
    const res=landmarker.detectForVideo(video, now);
    draw(processFrame(res, now));
    fpsN++;
    if(now-fpsT>1000){ $("hud").textContent=fpsN+" fps · local"; fpsN=0; fpsT=now; }
  }
  requestAnimationFrame(loop);
}

$("startBtn").onclick=async()=>{
  const btn=$("startBtn");
  btn.disabled=true; btn.textContent="모델 로딩 중…";
  ui.setStatus("모델 로딩", false);
  try{
    mp=await import(CDN);
    const fileset=await mp.FilesetResolver.forVisionTasks(CDN+"/wasm");
    landmarker=await mp.PoseLandmarker.createFromOptions(fileset,{
      baseOptions:{
        modelAssetPath:"https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task",
        delegate:"GPU"},
      runningMode:"VIDEO", numPoses:1});
    btn.textContent="카메라 켜는 중…";
    const stream=await navigator.mediaDevices.getUserMedia(
      {video:{width:{ideal:960}, height:{ideal:720}, facingMode:"user"}});
    video.srcObject=stream;
    await video.play();
    canvas.width=video.videoWidth; canvas.height=video.videoHeight;
    $("placeholder").style.display="none";
    $("hud").style.display="block";
    ui.setStatus("측정 중 · on-device", true);
    running=true;
    requestAnimationFrame(loop);
  }catch(e){
    btn.disabled=false; btn.textContent="카메라 시작";
    ui.setStatus("오류", false);
    alert("시작 실패: "+e.message+"\n카메라 권한과 HTTPS 접속 여부를 확인하세요.");
  }
};

// ── 세션 저장/초기화/내보내기 ────────────────────────────────
$("saveBtn").onclick=()=>{
  const excursion=session.max-session.min;
  if(!isFinite(excursion)||excursion<5){
    alert("저장할 측정값이 없습니다. 관절을 충분히 움직인 뒤 저장하세요.");
    return;
  }
  // rep이 있으면 rep ROM 중앙값(이상치에 강함), 없으면 excursion
  const med=counter.repRoms.length ? Math.round(median(counter.repRoms)) : null;
  store.addRecord({
    t:Date.now(), ex:activeEx,
    min:Math.round(session.min), max:Math.round(session.max),
    rom:med ?? Math.round(excursion),
    reps:counter.reps||null, med,
    q:session.frames ? Math.round(session.qSum/session.frames) : null,
    c:session.frames ? Math.round(session.comp/session.frames*100) : 0,
  });
  ui.renderHistory(store.loadRecords(), activeEx, onDeleteRecord);
  newSession();
  ui.feedback("", "세션이 저장되었습니다. 아래 기록에서 추세를 확인하세요.");
};

$("resetBtn").onclick=newSession;

$("csvBtn").onclick=()=>{
  const recs=store.loadRecords();
  if(!recs.length){ alert("내보낼 기록이 없습니다."); return; }
  const a=document.createElement("a");
  a.href=URL.createObjectURL(new Blob(["﻿"+store.toCsv(recs)],{type:"text/csv"}));
  a.download="rom_records.csv";
  a.click();
};

$("aiBtn").onclick=()=>{
  const text=store.summarize(store.loadRecords(), activeEx);
  if(!text){ alert("요약하려면 같은 운동의 저장 기록이 2회 이상 필요합니다."); return; }
  ui.showSummary(text);
};

$("exSelect").onchange=e=>switchExercise(e.target.value);
$("autoChk").onchange=e=>{
  if(!e.target.checked) ui.setDetected(null);
  else detector.reset();
};

// ── 초기화 ──────────────────────────────────────────────────
ui.initSelect();
detector=new AutoDetector();
switchExercise(Object.keys(EXERCISES)[0]);

// E2E 테스트용 훅: 합성 랜드마크 프레임을 파이프라인에 직접 주입
window.__rom={
  processFrame,
  setExercise:switchExercise,
  get state(){
    return {activeEx, reps:counter.reps, repRoms:[...counter.repRoms],
            min:session.min, max:session.max, frames:session.frames};
  },
};
