// session.js — 세션 기록 저장(localStorage)·CSV·규칙 기반 요약
// 모든 데이터는 이 기기 브라우저에만 저장되며 서버 전송이 없다.

import {EXERCISES, exTarget} from "./exercises.js";

const V1="romvision_records_v1";
const V2="romvision_records_v2";

// v1 관절 키 → v2 운동 id
export const V1_MAP={
  kneeR:"kneeR", kneeL:"kneeL", elbowR:"elbowR", elbowL:"elbowL",
  shoulderR:"shoulderAbdR", shoulderL:"shoulderAbdL", hipR:"hipR", hipL:"hipL",
};

/** v1 레코드 {t,j,min,max,rom,c} → v2 {t,ex,min,max,rom,c,reps,med,q} */
export function migrateV1(arr){
  return arr
    .filter(r=>V1_MAP[r.j])
    .map(r=>({t:r.t, ex:V1_MAP[r.j], min:r.min, max:r.max, rom:r.rom,
              c:r.c??null, reps:null, med:null, q:null}));
}

export function loadRecords(){
  try{
    let recs=JSON.parse(localStorage.getItem(V2));
    if(!recs){
      const v1=JSON.parse(localStorage.getItem(V1));
      recs=v1 ? migrateV1(v1) : [];
      if(v1) localStorage.setItem(V2, JSON.stringify(recs)); // v1은 백업용으로 유지
    }
    return recs;
  }catch{ return []; }
}

export function saveRecords(recs){
  try{ localStorage.setItem(V2, JSON.stringify(recs)); }
  catch(e){ alert("저장 실패: "+e.message); }
}

export function addRecord(rec){
  const recs=loadRecords();
  recs.push(rec);
  saveRecords(recs);
}

export function deleteRecord(t){
  const recs=loadRecords();
  const i=recs.findIndex(r=>r.t===t);
  if(i>-1){ recs.splice(i,1); saveRecords(recs); }
}

export function toCsv(recs){
  let csv="date,exercise,min,max,rom,reps,med_rom,quality,comp_pct\n";
  for(const r of recs){
    csv+=[new Date(r.t).toISOString(), EXERCISES[r.ex]?.name??r.ex,
          r.min, r.max, r.rom, r.reps??"", r.med??"", r.q??"", r.c??""].join(",")+"\n";
  }
  return csv;
}

/**
 * 규칙 기반 세션 요약(온디바이스, 외부 전송 없음).
 * 추세·rep·측정 품질·보상 움직임을 종합해 다음 세션 가이드를 만든다.
 */
export function summarize(records, exId){
  const ex=EXERCISES[exId], target=exTarget(exId);
  const recs=records.filter(r=>r.ex===exId);
  if(recs.length<2) return null;

  const last=recs[recs.length-1], prev=recs[recs.length-2];
  const dLast=last.rom-prev.rom;
  const best=Math.max(...recs.map(r=>r.rom));
  const pct=Math.round(last.rom/target*100);
  const half=Math.floor(recs.length/2);
  const avg=a=>a.reduce((s,r)=>s+r.rom,0)/a.length;
  const trendD=Math.round(avg(recs.slice(half))-avg(recs.slice(0,half)));
  const lastC=last.c??null, prevC=prev.c??null;

  const lines=[];
  // 1) 추세
  lines.push(`【추세】 최근 ${ex.name} ROM은 ${last.rom}° (직전 대비 ${dLast>=0?"+":""}${dLast}°), `
    +`총 ${recs.length}회 중 최고 ${best}°, 목표(${target}°)의 ${pct}% 수준입니다. `
    +(recs.length>=4 ? (trendD>3?`전체적으로 상승 추세(약 +${trendD}°)입니다.`
      :trendD<-3?`전체적으로 하락 추세(약 ${trendD}°)입니다.`:`전체적으로 유지 추세입니다.`):""));
  // 2) 반복 수행
  if(last.reps){
    lines.push(`【반복】 최근 세션에서 ${last.reps}회 반복을 수행했고, rep ROM 중앙값은 ${last.med}°입니다. `
      +`중앙값 기준이라 순간 이상치에 흔들리지 않는 수치입니다.`);
  }
  // 3) 측정 품질
  if(last.q!=null && last.q<60){
    lines.push(`【품질】 최근 세션의 측정 품질이 ${last.q}점으로 낮습니다. 이 수치는 참고용으로만 보세요. `
      +`조명을 밝게 하고 관절이 가려지지 않는 위치에서 다시 측정하면 신뢰도가 올라갑니다.`);
  }
  // 4) 보상
  if(lastC!=null && prevC!=null){
    if(lastC<prevC) lines.push(`【보상】 보상 움직임 비율이 ${prevC}% → ${lastC}%로 줄었습니다. 움직임의 질이 좋아지고 있습니다.`);
    else if(lastC>prevC+5) lines.push(`【보상】 보상 비율이 ${prevC}% → ${lastC}%로 늘었습니다. ROM 수치보다 정확한 자세를 우선하세요.`);
    else if(lastC>30) lines.push(`【보상】 보상 비율이 ${lastC}%로 높은 편입니다. 범위를 줄이더라도 보상 없는 동작을 연습하세요.`);
  }
  // 5) 잘된 점
  if(dLast>0) lines.push(`【잘된 점】 직전 세션보다 가동범위가 ${dLast}° 넓어졌습니다.`);
  else if(lastC!=null && prevC!=null && lastC<prevC) lines.push(`【잘된 점】 보상을 줄이면서 측정을 이어가고 있습니다.`);
  else lines.push(`【잘된 점】 꾸준히 기록을 쌓고 있다는 것 자체가 회복 추적의 기본입니다.`);
  // 6) 다음 개선점 (우선순위: 하락 추세 > 보상 > 범위 확장 > 유지)
  if(trendD<-3 && recs.length>=4)
    lines.push(`【다음 세션】 ROM이 줄어드는 추세입니다. 통증·피로가 있는지 확인하고, 무리한 확장보다 통증 없는 범위 반복을 권합니다.`);
  else if(lastC!=null && lastC>30)
    lines.push(`【다음 세션】 빨간 보상 경고가 뜨지 않는 범위까지만 천천히 움직이는 연습을 해보세요.`);
  else if(pct<60)
    lines.push(`【다음 세션】 통증이 없는 범위에서 끝지점에 도달한 뒤 2~3초 유지를 세트당 5회 시도해 보세요.`);
  else if(pct<90)
    lines.push(`【다음 세션】 목표까지 ${target-last.rom}° 남았습니다. 끝범위 유지 시간을 3~5초로 늘려보세요.`);
  else
    lines.push(`【다음 세션】 목표 범위에 도달했습니다. 반대쪽과 비교 측정해 좌우 차이를 확인해 보세요.`);

  lines.push(`※ 본 내용은 측정 기록 기반 운동 보조 정보이며 의료적 진단이 아닙니다.`);
  return lines.join("\n\n");
}
