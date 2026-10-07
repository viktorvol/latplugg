/* Låtplugg – gemensam kod för index.html och verktyg.html */
const COUNTRY = "se";
const K_PROG = "latplugg_progress_v2", K_RES = "latplugg_audio_v2", K_REMOTE = "latplugg_remote_cache";

function load(key){ try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch(e){ return null; } }
function save(key, val){ try { localStorage.setItem(key, JSON.stringify(val)); return true; } catch(e){ return false; } }
const $ = id => document.getElementById(id);
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---------- Text ---------- */
function fold(s){ return (s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,""); }
const VERSION_WORDS = /(remaster|remix|mono|stereo|version|edit|single|live|mix|demo|take|from|soundtrack|anniversary|deluxe|bonus)/i;
function cleanTitle(t){
  t = (t||"").trim();
  t = t.replace(/\s+[-–]\s+[^-–]*$/, m => VERSION_WORDS.test(m) ? "" : m);
  t = t.replace(/\s*[(\[][^)\]]*[)\]]/g, m => VERSION_WORDS.test(m) ? "" : m);
  return t.replace(/\s+/g," ").trim();
}
function norm(s){
  return fold(s).replace(/\s*[(\[].*?[)\]]/g,"").replace(/\s(feat|ft|featuring|with)\.?\s.*$/,"")
    .replace(/&/g," and ").replace(/^the\s+/,"").replace(/[^a-z0-9]/g,"");
}
function normKeep(s){
  return fold(s).replace(/\s(feat|ft|featuring|with)\.?\s.*$/,"").replace(/&/g," and ").replace(/^the\s+/,"").replace(/[^a-z0-9]/g,"");
}
function lev(a,b){
  const m=a.length,n=b.length; if(!m) return n; if(!n) return m;
  let prev=Array.from({length:n+1},(_,i)=>i);
  for(let i=1;i<=m;i++){ const cur=[i]; for(let j=1;j<=n;j++) cur[j]=Math.min(prev[j]+1,cur[j-1]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1)); prev=cur; }
  return prev[n];
}
function closeEnough(a,b){ if(!a) return false; if(a===b) return true; const tol=b.length>12?2:b.length>5?1:0; return lev(a,b)<=tol; }
function isMatch(input, answer){ return closeEnough(norm(input),norm(answer)) || closeEnough(normKeep(input),normKeep(answer)); }
function artistParts(a){ return [a, ...a.split(/\s*(?:,|&|\band\b|\bx\b|\bfeat\.?|\bft\.?|\bwith\b)\s*/i)].map(x=>x.trim()).filter(Boolean); }
function artistMatch(input, answer){ const n=norm(input); return artistParts(answer).some(p=>closeEnough(n,norm(p))); }

/* ---------- songs.txt ----------
   Rad: Artist - Titel | låt-id | ljudlänk | omslagslänk   (allt efter titeln är valfritt) */
function songKey(s){ return "n"+norm(s.artist)+"|"+norm(s.title); }
function parseSongInput(text){
  text=(text||"").trim(); if(!text) return [];
  if(text.startsWith("[")){ try{ return JSON.parse(text); }catch(e){ return null; } }
  return text.split(/\r?\n/).map(line=>{
    const parts=line.split(/\s+\|\s+/), l=parts[0];
    const m=l.trim().match(/^(.+?)\s+[-–—]\s+(.+)$/) || (l.split("\t").length>1 && [0,...l.split("\t")]);
    if(!m) return null;
    const o={artist:m[1],title:m[2]};
    const p=i=>(parts[i]||"").trim();
    if(/^\d+$/.test(p(1))) o.trackId=p(1);
    if(/^https:\/\//.test(p(2))) o.preview=p(2);
    if(/^https:\/\//.test(p(3))) o.art=p(3);
    return o;
  }).filter(Boolean);
}
function prepSongs(list){
  const seen=new Set(), out=[];
  for(const x of list||[]){
    if(!x || !x.artist || !x.title) continue;
    const s={artist:String(x.artist).trim(), title:cleanTitle(String(x.title))};
    if(x.trackId && /^\d+$/.test(String(x.trackId))) s.trackId=Number(x.trackId);
    if(x.preview && /^https:\/\//.test(x.preview)) s.preview=String(x.preview);
    if(x.art && /^https:\/\//.test(x.art)) s.art=String(x.art);
    s.key=songKey(s);
    if(seen.has(s.key)) continue; seen.add(s.key); out.push(s);
  }
  return out;
}
function bigArt(u){ return u ? u.replace(/\/\d+x\d+bb\./,"/600x600bb.") : ""; }

/* ---------- Apples låtsök ---------- */
let jsonpN=0, lastNetErr="";
function jsonp(url){
  return new Promise((res,rej)=>{
    const cb="__lp"+Date.now()+(++jsonpN), s=document.createElement("script");
    const done=()=>{ clearTimeout(t); delete window[cb]; s.remove(); };
    const t=setTimeout(()=>{ done(); rej(new Error("timeout")); },12000);
    window[cb]=d=>{ done(); res(d); };
    s.onerror=()=>{ done(); rej(new Error("net")); };
    s.src=url+(url.includes("?")?"&":"?")+"callback="+cb;
    document.head.append(s);
  });
}
async function itunes(url){
  try{
    const r=await fetch(url,{mode:"cors",cache:"no-store"});
    if(r.ok){ lastNetErr=""; return await r.json(); }
    lastNetErr="Apple svarade med felkod "+r.status;
  }catch(e){ lastNetErr="Direktanrop misslyckades"; }
  try{ const d=await jsonp(url); lastNetErr=""; return d; }
  catch(e){ lastNetErr+=". Reservanrop misslyckades"; throw e; }
}
function scoreHit(s,h){
  let sc=0;
  if(artistMatch(h.artistName||"",s.artist) || artistMatch(s.artist,h.artistName||"")) sc+=4;
  const ht=norm(cleanTitle(h.trackName||"")), st=norm(s.title);
  if(ht===st) sc+=4; else if(closeEnough(ht,st) || ht.startsWith(st) || st.startsWith(ht)) sc+=2;
  if(/live|karaoke|cover|tribute|instrumental/i.test((h.trackName||"")+" "+(h.collectionName||""))) sc-=3;
  if(!h.previewUrl) sc-=10;
  return sc;
}
async function searchHits(s, limit=10){
  const term=encodeURIComponent(`${s.artist} ${s.title}`);
  const d=await itunes(`https://itunes.apple.com/search?term=${term}&country=${COUNTRY}&media=music&entity=song&limit=${limit}`);
  return (d.results||[]).filter(h=>h.previewUrl);
}
async function bestHit(s){
  const hits=await searchHits(s);
  const best=hits.map(h=>({h,sc:scoreHit(s,h)})).sort((a,b)=>b.sc-a.sc)[0];
  return best && best.sc>=4 ? best.h : null;
}
function hitToRes(h, manual){ const r={tid:h.trackId,url:h.previewUrl,art:bigArt(h.artworkUrl100)}; if(manual) r.manual=true; return r; }
