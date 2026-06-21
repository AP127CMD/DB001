#!/usr/bin/env node
// Fetches live data from the relay and writes cache.json

const RELAY = process.env.RELAY_URL;
if (!RELAY) { console.error("RELAY_URL environment variable is not set"); process.exit(1); }
const BATCHES = ["AP124", "AP126", "AP127"];

const AP127_NICKS   = ["A-VIT","A-SORN","A-RUT","B-SET","J-YU","K-PONG","K-YA","K-KORN","K-SEE","KRIT","M-PHAN","N-PON","N-KALP","N-PHAT","P-THAN","P-KORN","P-KUL","P-DET","S-SIT","S-KORN","S-WITCH","S-WAN","T-KORN","T-WAJ","V-PHON","W-PHOL","W-POL","W-PONG"];
const AP127_FI      = ["W-CHAI","P-YUTH","P-YA","S-TI","N-TORN","I-POL","SN-TI","S-TI","A-WAT","W-NU","K-POL","C-CHAI","P-YUTH","SN-TI","E-PHOB","K-POL","S-WAN","N-TORN","E-PHOB","I-POL","K-CHAI","K-CHAI","P-YA","S-WAN","C-CHAI","W-NU","W-CHAI","A-WAT"];
const AP127_SE      = ["DA40-TDI","DA40-CS","DA40-CS","DA40-CS","DA40-TDI","DA40-TDI","DA40-CS","DA40-CS","DA40-TDI","DA40-TDI","DA40-CS","DA40-CS","DA40-CS","DA40-CS","DA40-TDI","DA40-CS","DA40-CS","DA40-TDI","DA40-TDI","DA40-TDI","DA40-CS","DA40-CS","DA40-CS","DA40-CS","DA40-CS","DA40-TDI","DA40-TDI","DA40-TDI"];
const AP127_FI_FULL = {"W-CHAI":"WUTTHICHAI L.","P-YUTH":"PHAHOLYUTH P.","P-YA":"PARINYA B.","S-TI":"SANTI SUK.","N-TORN":"NAPATTORN S.","I-POL":"ITTIPOL P.","SN-TI":"SANTI PO.","A-WAT":"THAWATANAN P.","W-NU":"WISANU T.","K-POL":"KOONPHOL U.","C-CHAI":"CHAROENCHAI U.","E-PHOB":"EKKAPHOP R.","S-WAN":"SOWAN C.","K-CHAI":"KITTICHAI C."};
const HOL = new Set(["2026-05-01","2026-05-04","2026-05-13","2026-06-01","2026-06-03","2026-07-28","2026-07-29","2026-07-30","2026-08-12","2026-10-13","2026-10-23","2026-12-07","2026-12-10","2026-12-31"]);
const CFG = {cap:25, n129:13, ap129start:"2026-06-01", horizon:800};

// ── CSV PARSER ──
function parseDate(s) {
  s = (s || "").trim(); if (!s) return "";
  const M = {Jan:1,Feb:2,Mar:3,Apr:4,May:5,Jun:6,Jul:7,Aug:8,Sep:9,Oct:10,Nov:11,Dec:12};
  const m = s.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (!m) return ""; const mo = M[m[2]]; if (!mo) return "";
  return m[3] + "-" + String(mo).padStart(2,"0") + "-" + String(m[1]).padStart(2,"0");
}
function splitCSVLine(l) {
  const c = []; let cur = "", inQ = false;
  for (let i = 0; i < l.length; i++) {
    const ch = l[i];
    if (ch === '"') { inQ = !inQ; }
    else if (ch === "," && !inQ) { c.push(cur.trim()); cur = ""; }
    else { cur += ch; }
  }
  c.push(cur.trim()); return c;
}
function parseCSV(text, batch) {
  const rows = text.replace(/\r\n/g,"\n").replace(/\r/g,"\n").split("\n").map(splitCSVLine);
  if (rows.length < 5) throw new Error("Only " + rows.length + " rows");
  const pN = rows[0].slice(3), pFT = rows[1].slice(3), pD = rows[2].slice(3);
  const curriculum = [];
  pN.forEach((name, i) => {
    if (!name || /\/\d+$/.test(name) || /^AUPRT/i.test(name)) return;
    let pm = 0; const ft = (pFT[i] || "");
    if (ft.includes(":")) { const [h, m] = ft.split(":").map(Number); pm = (h||0)*60 + (m||0); }
    curriculum.push({lesson: name, planned_mins: pm, planned_date: parseDate(pD[i] || "")});
  });
  if (!curriculum.length) throw new Error("No curriculum found");
  const students = []; let i = 3;
  while (i < rows.length - 1) {
    const rA = rows[i]||[], rB = rows[i+1]||[], rC = rows[i+2]||[];
    const cid = (rB[1] || "").trim();
    if (!cid.startsWith("681")) { i++; continue; }
    const name = (rB[2] || "").replace(/^(Mr\.|Ms\.)\s*/, "").trim();
    const lH = rA.slice(3), ftC = rB.slice(3), dtC = rC.slice(3);
    const flown = [];
    lH.forEach((ln, j) => {
      if (!ln || /^AUPRT/i.test(ln)) return;
      const ft = (ftC[j] || "").trim(); if (!ft || !ft.includes(":")) return;
      const [h, m] = ft.split(":").map(Number);
      const mins = (h||0)*60+(m||0);
      if (/\/\d+$/.test(ln)) {
        // Split continuation — accumulate hours into the base lesson record
        const base = ln.replace(/\/\d+$/, '');
        const existing = flown.find(r => r.lesson === base);
        if (existing) existing.actual_mins += mins;
        return;
      }
      flown.push({lesson: ln, actual_ft: ft, actual_mins: mins, date: parseDate(dtC[j]||"")});
    });
    const tot = curriculum.length, done = flown.length;
    students.push({catc_id: cid, name, batch, done, total: tot, remaining: tot-done, pct: tot ? +(done/tot*100).toFixed(1) : 0, flown, next_lesson: done < tot ? curriculum[done].lesson : "COMPLETE"});
    i += 3;
  }
  if (!students.length) throw new Error("No students found");
  return {students, curriculum};
}

// ── SCHEDULER ──
function isWD(ds) { const d = new Date(ds+"T12:00:00Z"), dw = d.getUTCDay(); return dw !== 0 && dw !== 6 && !HOL.has(ds); }
function getWDs(s, n) {
  const a = []; let d = new Date(s+"T12:00:00Z");
  while (a.length < n) { const ds = d.toISOString().slice(0,10); if (isWD(ds)) a.push(ds); d.setUTCDate(d.getUTCDate()+1); }
  return a;
}
function runScheduler(batchData, curricula) {
  const {cap, n129, ap129start, horizon} = CFG;
  const _d = new Date(Date.now() + 7 * 3600000); _d.setUTCDate(_d.getUTCDate() + 1);
  const tomorrowBKK = _d.toISOString().slice(0, 10);
  const wds = getWDs(tomorrowBKK, horizon);
  const w129 = wds.findIndex(d => d >= ap129start);
  const cur129 = curricula.AP127 || curricula.AP126 || [];
  function computeLwM(ld) {
    if (!ld || !wds[0]) return -99;
    let cnt = 0, d = new Date(ld + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + 1);
    const end = new Date(wds[0] + "T12:00:00Z");
    while (d <= end && cnt <= 20) { if (isWD(d.toISOString().slice(0,10))) cnt++; d.setUTCDate(d.getUTCDate()+1); }
    return -cnt;
  }
  const iM = {}, lwM = {}, lmM = {}, schM = {};
  ["AP124","AP126","AP127"].forEach(b => {
    const st = batchData[b] || []; iM[b]={}; lwM[b]={}; lmM[b]={}; schM[b]={};
    st.forEach((s,i) => { const ld=s.flown?.at(-1)?.date||""; iM[b][i]=s.done; lwM[b][i]=computeLwM(ld); lmM[b][i]=s.flown?.at(-1)?.actual_mins||0; schM[b][i]=[]; });
  });
  iM.AP129={}; lwM.AP129={}; lmM.AP129={}; schM.AP129={};
  for (let i = 0; i < n129; i++) { iM.AP129[i]=0; lwM.AP129[i]=-99; lmM.AP129[i]=0; schM.AP129[i]=[]; }
  function elig(b, cur, wi) {
    const tot=cur.length, wl=Math.max(horizon-wi,1), n=b==="AP129"?n129:(batchData[b]||[]).length, out=[];
    for (let i=0; i<n; i++) { if (iM[b][i]>=tot) continue; const gap=lmM[b][i]>=120?2:1; if ((wi-lwM[b][i])<gap) continue; out.push([(tot-iM[b][i])/wl,i]); }
    return out.sort((a,z) => z[0]-a[0]);
  }
  wds.forEach((ds, wi) => {
    let slots = cap;
    ["AP124","AP126","AP127"].forEach(b => {
      if (slots<=0) return; const cur=curricula[b]||[];
      for (const [,i] of elig(b,cur,wi)) { if (slots<=0) break; const ix=iM[b][i]; if (ix>=cur.length) continue; const p=cur[ix]; schM[b][i].push([ds,p.lesson,p.planned_mins]); lwM[b][i]=wi; lmM[b][i]=p.planned_mins; iM[b][i]=ix+1; slots--; }
    });
    if (slots>0 && wi>=w129) for (const [,i] of elig("AP129",cur129,wi)) { if (slots<=0) break; const ix=iM.AP129[i]; if (ix>=cur129.length) continue; const p=cur129[ix]; schM.AP129[i].push([ds,p.lesson,p.planned_mins]); lwM.AP129[i]=wi; lmM.AP129[i]=p.planned_mins; iM.AP129[i]=ix+1; slots--; }
  });
  const dc={}, wpm={};
  wds.forEach(d => { const m=d.slice(0,7); wpm[m]=(wpm[m]||0)+1; });
  ["AP124","AP126","AP127","AP129"].forEach(b => {
    const n=b==="AP129"?n129:(batchData[b]||[]).length;
    for (let i=0; i<n; i++) for (const [ds] of schM[b][i]||[]) { const m=ds.slice(0,7); if (!dc[m]) dc[m]={t:0,"124":0,"126":0,"127":0,"129":0}; dc[m].t++; dc[m][b.replace("AP","")]++; }
  });
  const monthly={};
  Object.entries(dc).forEach(([m,v]) => { const w=wpm[m]||1; monthly[m]={t:+(v.t/w).toFixed(1),"124":+(v["124"]/w).toFixed(1),"126":+(v["126"]/w).toFixed(1),"127":+(v["127"]/w).toFixed(1),"129":+(v["129"]/w).toFixed(1)}; });
  function mkSt(b, st, cur, sd) {
    if (b==="AP129") return Array.from({length:n129},(_,i)=>({catc_id:"AP129-"+String(i+1).padStart(2,"0"),name:"Student "+String(i+1).padStart(2,"0"),batch:"AP129",done:0,total:cur.length,remaining:cur.length,pct:0,flown:[],next_lesson:cur[0]?.lesson||"",planned:(sd[i]||[]).map(p=>Array.isArray(p)?{date:p[0],lesson:p[1],mins:p[2]}:p),planned_total:(sd[i]||[]).length,finish:(sd[i]||[]).at(-1)?.[0]||(sd[i]||[]).at(-1)?.date||"N/A"}));
    return (st||[]).map((s,i) => { const pl=sd[i]||[]; const pl2=pl.map(p=>Array.isArray(p)?{date:p[0],lesson:p[1],mins:p[2]}:p); return {...s,planned:pl2,planned_total:pl2.length,finish:pl2.at(-1)?.date||pl.at(-1)?.[0]||(s.remaining===0?"COMPLETE":"N/A")}; });
  }
  return {ap124:mkSt("AP124",batchData.AP124,curricula.AP124||[],schM.AP124),ap126:mkSt("AP126",batchData.AP126,curricula.AP126||[],schM.AP126),ap127:mkSt("AP127",batchData.AP127,curricula.AP127||[],schM.AP127),ap129:mkSt("AP129",[],cur129,schM.AP129),monthly,cap,cur124:curricula.AP124,cur126:curricula.AP126,cur127:curricula.AP127};
}

// ── MAIN ──
async function fetchBatch(batch) {
  const url = RELAY + "?batch=" + batch;
  const resp = await fetch(url, {redirect: "follow"});
  if (!resp.ok) throw new Error("HTTP " + resp.status);
  const text = await resp.text();
  if (text.startsWith("{")) throw new Error(JSON.parse(text).error || "Script error");
  if (text.length < 100) throw new Error("Response too short (" + text.length + " bytes)");
  return parseCSV(text, batch);
}

(async () => {
  const results = {}, curricula = {}, failed = [];
  for (const batch of BATCHES) {
    try {
      console.log("Fetching " + batch + "...");
      const d = await fetchBatch(batch);
      results[batch] = d.students;
      curricula[batch] = d.curriculum;
      console.log("  " + batch + ": " + d.students.length + " students, " + d.curriculum.length + " lessons");
    } catch (e) {
      console.error("  " + batch + " failed: " + e.message);
      failed.push(batch);
    }
  }
  if (failed.length === BATCHES.length) { console.error("All batches failed — aborting"); process.exit(1); }

  results.AP127?.forEach((s, i) => { s.nick = AP127_NICKS[i] || ""; s.fi = AP127_FI[i] || ""; s.se = AP127_SE[i] || ""; });
  const G = runScheduler(results, curricula);
  G.ap127?.forEach((s, i) => { s.nick = AP127_NICKS[i] || ""; s.fi = AP127_FI[i] || ""; s.se = AP127_SE[i] || ""; });

  G._updated = new Date().toISOString();
  const fs = await import("fs");
  fs.writeFileSync("cache.json", JSON.stringify(G, null, null));
  console.log("cache.json updated (" + Buffer.byteLength(JSON.stringify(G)) + " bytes)");
  if (failed.length) { console.warn("Warning: missing batches: " + failed.join(", ")); process.exit(0); }
})();
