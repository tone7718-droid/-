// ui.js — 게이지·통계·피드백·기록 렌더링 (DOM 전담)

import {EXERCISES, exTarget} from "./exercises.js";
import {median} from "./geometry.js";

const $=id=>document.getElementById(id);
const ARC_LEN=198;

export function initSelect(){
  const sel=$("exSelect");
  for(const [id, ex] of Object.entries(EXERCISES)){
    const o=document.createElement("option");
    o.value=id; o.textContent=ex.name;
    sel.appendChild(o);
  }
}

export function setStatus(text, ledOn){
  $("statusText").textContent=text;
  $("led").classList.toggle("on", !!ledOn);
}

export function setDetected(name){
  const b=$("detectedBadge");
  if(name){ b.style.display="inline-flex"; b.textContent="감지된 동작 · "+name; }
  else b.style.display="none";
}

export function setGuide(exId){
  const ex=EXERCISES[exId];
  $("jointGuide").textContent="📐 "+ex.guide;
  $("romTarget").textContent=`목표 ${exTarget(exId)}°`;
}

export function setAngle(ang){
  if(ang===null){
    $("angleNum").innerHTML="—<small>°</small>";
    $("gaugeArc").style.strokeDashoffset=ARC_LEN;
    return;
  }
  $("angleNum").innerHTML=Math.round(ang)+"<small>°</small>";
  $("gaugeArc").style.strokeDashoffset=ARC_LEN*(1-Math.min(180,ang)/180);
}

export function setStats(session, counter, target, q){
  const rom=session.max-session.min;
  const ok=isFinite(rom);
  $("minV").textContent=ok?Math.round(session.min)+"°":"—";
  $("maxV").textContent=ok?Math.round(session.max)+"°":"—";
  $("romV").textContent=ok?Math.round(rom)+"°":"—";
  $("repsV").textContent=counter.reps||"—";
  const med=counter.repRoms.length?Math.round(median(counter.repRoms)):null;
  $("medV").textContent=med!==null?med+"°":"—";
  const qual=$("qualV");
  qual.textContent=q!=null?q:"—";
  qual.classList.toggle("low", q!=null&&q<60);
  $("qualBadge").style.display=(q!=null&&q<60)?"inline-flex":"none";
  const pct=ok?Math.min(100, rom/target*100):0;
  $("romFill").style.width=pct+"%";
  $("romPct").textContent=Math.round(pct)+"%";
}

export function resetReadout(){
  $("minV").textContent=$("maxV").textContent=$("romV").textContent="—";
  $("repsV").textContent=$("medV").textContent=$("qualV").textContent="—";
  $("qualBadge").style.display="none";
  $("romFill").style.width="0%";
  $("romPct").textContent="0%";
  setAngle(null);
  feedback("idle","관절을 천천히 끝까지 굽혔다 펴보세요. rep마다 가동범위를 기록합니다.");
}

export function feedback(cls, text){
  const fb=$("feedback");
  fb.className="feedback"+(cls?" "+cls:"");
  fb.textContent=text;
}

/** rom/rep 진행 상황에 따른 피드백 (경고가 없을 때만 호출) */
export function progressFeedback(exId, rom, reps){
  const ex=EXERCISES[exId], target=exTarget(exId);
  const pct=rom/target*100;
  const rep=reps?` · ${reps}회`:"";
  if(!isFinite(rom)||rom<10){
    feedback("idle", `${ex.name} — 천천히 끝까지 움직여 보세요.`);
  }else if(pct<60){
    feedback("warn", `${ex.name} ROM ${Math.round(rom)}°${rep} — 목표(${target}°)의 ${Math.round(pct)}%. 통증이 없는 범위에서 조금 더 깊게 움직여 보세요.`);
  }else if(pct<90){
    feedback("", `${ex.name} ROM ${Math.round(rom)}°${rep} — 목표의 ${Math.round(pct)}%. 좋은 진행입니다. 끝범위에서 2~3초 유지해 보세요.`);
  }else{
    feedback("", `${ex.name} ROM ${Math.round(rom)}°${rep} — 정상 범위 수준입니다. 반대쪽과 비교 측정해 보세요.`);
  }
}

export function renderHistory(records, exId, onDelete){
  const recs=records.filter(r=>r.ex===exId);
  const list=$("histList"), svg=$("trend");
  list.innerHTML=""; svg.innerHTML="";
  if(!recs.length){
    svg.innerHTML='<text x="140" y="50" text-anchor="middle" font-size="11" fill="#8FA3A0">저장된 기록이 없습니다</text>';
    return;
  }
  // 최근 5개 목록 (최신 위)
  for(const r of recs.slice(-5).reverse()){
    const li=document.createElement("li");
    const d=new Date(r.t);
    const extra=[
      r.reps?`${r.reps}회`:null,
      (r.c!=null&&r.c>0)?`보상 ${r.c}%`:null,
      (r.q!=null&&r.q<60)?"참고용":null,
    ].filter(Boolean).join(" · ");
    li.innerHTML='<span class="d">'+(d.getMonth()+1)+'.'+d.getDate()+' '
      +String(d.getHours()).padStart(2,"0")+':'+String(d.getMinutes()).padStart(2,"0")+'</span>'
      +'<span>ROM '+r.rom+'° <span class="d">('+r.min+'–'+r.max+'°'
      +(extra?' · '+extra:'')+')</span></span>';
    const x=document.createElement("button");
    x.className="x"; x.textContent="×"; x.title="기록 삭제";
    x.onclick=()=>onDelete(r.t);
    li.appendChild(x);
    list.appendChild(li);
  }
  // 최근 12회 추세 그래프
  const pts=recs.slice(-12), tgt=exTarget(exId);
  const maxV=Math.max(tgt, ...pts.map(p=>p.rom))*1.08;
  const X=i=>pts.length===1?140:20+i*(240/(pts.length-1));
  const Y=v=>80-(v/maxV)*68;
  let g='<line x1="20" y1="'+Y(tgt)+'" x2="260" y2="'+Y(tgt)+'" stroke="#D8E0DE" stroke-dasharray="3 3"/>'
       +'<text x="261" y="'+(Y(tgt)+3)+'" font-size="8" fill="#8FA3A0">목표</text>';
  if(pts.length>1){
    g+='<polyline fill="none" stroke="#0E8A6D" stroke-width="2" points="'
       +pts.map((p,i)=>X(i)+','+Y(p.rom)).join(" ")+'"/>';
  }
  pts.forEach((p,i)=>{
    g+='<circle cx="'+X(i)+'" cy="'+Y(p.rom)+'" r="3" fill="#0E8A6D"/>'
      +'<text x="'+X(i)+'" y="'+(Y(p.rom)-6)+'" text-anchor="middle" font-size="8" fill="#4A5E63">'+p.rom+'</text>';
  });
  svg.innerHTML=g;
}

export function showSummary(text){
  const box=$("aiBox");
  box.style.display="block";
  box.textContent=text;
}
