// Generated test songs with exact ground truth (beat and downbeat times).
// Every song is built from a 16th-note grid, so we know where each beat and bar lands.
function mkRand(seed){let s=seed>>>0||1;return()=>(s=s*16807%2147483647)/2147483647*2-1}
const midiHz=m=>440*Math.pow(2,(m-69)/12);

// pattern strings: 16 chars per bar, x = hit, o = soft hit, . = rest
function song(spec){
  const sr=spec.sr||44100, rnd=mkRand(spec.seed||7);
  const intro=spec.intro||0, dur=spec.dur, n=Math.floor((intro+dur)*sr);
  const L=new Float32Array(n), R=new Float32Array(n);
  const beats=[], downs=[], steps=[];
  let t=intro, k=0;
  while(t<intro+dur-0.5){
    const bpm=spec.tempo(t-intro), s16=60/bpm/4;
    const swingDelay=(k%2===1)?(spec.swing||0)*s16:0;
    if(k%4===0)beats.push(t); if(k%16===0)downs.push(t);
    steps.push({t:t+swingDelay+(spec.jitter?rnd()*spec.jitter:0),k,bpm});
    t+=s16;k++;
  }
  const add=(buf,at,fn,len,g)=>{const a=Math.floor(at*sr),m=Math.floor(len*sr);for(let i=0;i<m&&a+i<n;i++){if(a+i<0)continue;buf[a+i]+=fn(i/sr)*g}};
  const both=(at,fn,len,g,pan=0)=>{add(L,at,fn,len,g*(1-Math.max(0,pan)));add(R,at,fn,len,g*(1+Math.min(0,pan)))};
  const P=spec.pat||{};
  const hit=(str,k)=>{if(!str)return 0;const c=str[k%str.length];return c==="x"?1:c==="o"?0.5:0};
  const chords=spec.chords||[[57,60,64],[53,57,60],[50,53,57],[52,56,59]];
  for(const st of steps){
    const {t:at,k}=st, bar=Math.floor(k/16);
    if(spec.drumsFrom!=null&&at<intro+spec.drumsFrom) {} else if(!spec.noDrums){
      const kv=hit(P.kick,k), sv=hit(P.snare,k), hv=hit(P.hat,k);
      if(kv)both(at,x=>Math.sin(2*Math.PI*(48+95*Math.exp(-x*32))*x)*Math.exp(-x*8),.35,.9*kv);
      if(sv)both(at,x=>(rnd()*.55*Math.exp(-x*20)+Math.sin(2*Math.PI*185*x)*.3*Math.exp(-x*28)),.25,.85*sv);
      if(hv){const pan=spec.wide?((k%2)?.8:-.8):0;both(at,x=>{const v=rnd();return v*Math.exp(-x*90)},.06,.22*hv,pan)}
    }
    if(spec.chordsOn!==false&&k%16===0){const ch=chords[bar%chords.length],len=60/st.bpm*4;
      both(at,x=>{let s=0;for(const m of ch)s+=Math.sin(2*Math.PI*midiHz(m)*x)*.06+Math.sin(4*Math.PI*midiHz(m)*x)*.015;return s*Math.min(1,x*10)*Math.exp(-x*.4)},len,1)}
    if(spec.bass&&(k%8===0)){const ch=chords[bar%chords.length];both(at,x=>Math.sin(2*Math.PI*midiHz(ch[0]-24)*x)*Math.exp(-x*2.5),60/st.bpm*2,.35)}
    if(spec.piano&&(k%2===0)){const ch=chords[bar%chords.length],m=ch[(k/2)%ch.length]+12;both(at,x=>(Math.sin(2*Math.PI*midiHz(m)*x)+.4*Math.sin(4*Math.PI*midiHz(m)*x))*Math.exp(-x*6),.5,.25*(k%8===0?1.3:1))}
  }
  if(spec.crackle){for(let i=0;i<n;i++){const v=rnd();if(Math.abs(v)>.9996){L[i]+=v*.5;R[i]+=v*.5}L[i]+=rnd()*.004;R[i]+=rnd()*.004}}
  let pk=0;for(let i=0;i<n;i++)pk=Math.max(pk,Math.abs(L[i]),Math.abs(R[i]));const g=(spec.gain||0.95)/pk;for(let i=0;i<n;i++){L[i]*=g;R[i]*=g}
  return {sr,L,R,beats,downs,truthBpm:spec.truth||spec.tempo(dur/2)};
}
const BOOM={kick:"x.......x.x.....",snare:"....x.......x...",hat:"x.x.x.x.x.x.x.x."};
const TRAP={kick:"x......x..x.....x.....x...x.....",snare:"........x...............x.......",hat:"xxxxxxxxxxxxxxxx"};
const HOUSE={kick:"x...x...x...x...",snare:"....x.......x...",hat:"..x...x...x...x."};
const DEMBOW={kick:"x...x...x...x...",snare:"...x..x....x..x.",hat:"x.x.x.x.x.x.x.x."};
const DNB={kick:"x.........x.....",snare:"....x.......x...",hat:"x.x.x.x.x.x.x.x."};
const LOFI={kick:"x......x..x.....",snare:"....x.......x...",hat:"x.oox.oox.oox.oo"};
const c=b=>()=>b;
module.exports={song,SONGS:[
  {name:"Boom-bap 90, swing",tempo:c(90),dur:75,pat:BOOM,swing:.18,bass:1},
  {name:"Trap 140 (half-time snare)",tempo:c(140),dur:70,pat:TRAP,bass:1},
  {name:"House 124",tempo:c(124),dur:70,pat:HOUSE,bass:1},
  {name:"Live soul 95→98, loose timing",tempo:t=>95+3*t/120,dur:120,pat:BOOM,jitter:.012,bass:1,piano:1,truth:96.5},
  {name:"Lo-fi 75, heavy swing",tempo:c(75),dur:90,pat:LOFI,swing:.3,crackle:1,piano:1},
  {name:"Reggaeton dembow 96",tempo:c(96),dur:70,pat:DEMBOW,bass:1},
  {name:"Drum & bass 174",tempo:c(174),dur:60,pat:DNB,bass:1},
  {name:"No drums: chords + bass 85",tempo:c(85),dur:80,noDrums:1,bass:1},
  {name:"Piano only 100",tempo:c(100),dur:70,noDrums:1,piano:1,chordsOn:false},
  {name:"Tempo jump 90 → 100 at 40s",tempo:t=>t<40?90:100,dur:80,pat:BOOM,bass:1,truth:null},
  {name:"8 s ambient intro, then 92",tempo:c(92),dur:80,pat:BOOM,drumsFrom:8,bass:1},
  {name:"48 kHz wide stereo 88",tempo:c(88),dur:70,pat:BOOM,sr:48000,wide:1,bass:1},
  {name:"Very short (12 s) 100",tempo:c(100),dur:12,pat:BOOM},
  {name:"Quiet master 92",tempo:c(92),dur:60,pat:BOOM,gain:.18,bass:1},
  {name:"Vinyl crackle 88",tempo:c(88),dur:70,pat:BOOM,crackle:1,bass:1,piano:1},
  {name:"Long 7 min 94",tempo:c(94),dur:420,pat:BOOM,bass:1},
]};
// Holdout set: randomized songs the analysis code was never tuned on.
const BANK=[BOOM,TRAP,HOUSE,DEMBOW,DNB,LOFI,
  {kick:"x.....x...x.....",snare:"....x.......x...",hat:"x.x.x.x.x.x.x.x."},
  {kick:"x..x......x.....",snare:"....x.......x..o",hat:"xxxxxxxxxxxxxxxx"},
  {kick:"x.......x.......",snare:"....x.......x...",hat:"x...x...x...x..."}];
module.exports.holdout=(count=30,seedBase=1000)=>{const out=[];for(let i=0;i<count;i++){const r=mkRand(seedBase+i*7919),u=()=>(r()+1)/2;
  const bpm=Math.round(70+u()*80),pat=BANK[Math.floor(u()*BANK.length)],root=45+Math.floor(u()*12);
  const prog=[[0,3,7],[5,9,12],[-3,0,4],[7,11,14]].map(c=>c.map(x=>x+root)),every=u()<.5?1:2;
  const chords=[];for(const c of prog)for(let k=0;k<every;k++)chords.push(c);
  out.push({name:`Random #${i+1} (${bpm} BPM)`,tempo:()=>bpm,dur:45+Math.floor(u()*60),pat,swing:u()<.4?u()*.25:0,jitter:u()<.4?u()*.012:0,
    intro:u()<.3?u()*3:0,bass:u()<.7,piano:u()<.3,chords,crackle:u()<.2,gain:.2+u()*.75,sr:u()<.5?44100:48000,seed:i+3})}return out};
