// Loads the app's own sound and analysis code out of index.html so tests run exactly what the site ships.
const fs = require("fs"), os = require("os"), path = require("path");
module.exports = function load() {
  const page = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  const js = page.match(/<script>\n\{([\s\S]*?)\n\}\n<\/script>/)[1];
  const a = js.indexOf("/* ---------- DSP basics"), b = js.indexOf("/* ---------- playback");
  const m0 = js.indexOf("let mseed="), m1 = js.indexOf("const hz=v=>");
  if (a < 0 || b < 0 || m0 < 0 || m1 < 0) throw new Error("Could not find the engine code in index.html");
  const el = () => ({ textContent: "", options: [{}, {}, {}], value: "auto", setAttribute() {}, style: {}, classList: { add() {}, remove() {}, toggle() {} } });
  global.document = { getElementById: el, querySelectorAll: () => [], body: { classList: { add() {}, remove() {} } } };
  global.localStorage = { getItem: () => null, setItem() {} };
  const code = "let status=()=>{};\n" + (js.slice(0, js.indexOf("let favs")) + js.slice(a, b)).replace(/function status\(m\)\{[^}]*\}/, "") + "\n" + js.slice(m0, m1) +
    "\nmodule.exports={S,P,base,setBpm,onsetEnv,tempo,detectKey,chopSet,render,mono,breaks,opens,findStab,buildDrumKit,getKit:()=>kit,MODES,makeFlip,filt,grit,wav,KEYS,resample,onsetsIn:typeof onsetsIn!=='undefined'?onsetsIn:null,bounceBeat:typeof bounceBeat!=='undefined'?bounceBeat:null,midiFile:typeof midiFile!=='undefined'?midiFile:null,evTime:typeof evTime!=='undefined'?evTime:null,padBake:typeof padBake!=='undefined'?padBake:null,patLen:typeof patLen!=='undefined'?patLen:null};";
  const tmp = path.join(os.tmpdir(), `sm_engine_${process.pid}_${Date.now()}.js`);
  fs.writeFileSync(tmp, code);
  const A = require(tmp);
  fs.unlinkSync(tmp);
  return A;
};
