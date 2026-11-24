#!/usr/bin/env node
// Sample Machine test lab.
// Runs the app's real analysis code (pulled straight out of index.html) on generated songs
// whose beats and bar lines are known exactly, and checks tempo, beats, bar starts and loops.
//
//   node tests/lab.js            run every test set
//   node tests/lab.js main       hand-made set only
//   node tests/lab.js --verbose  print a row for every song
//
// Exits with code 1 if any set scores below its required pass count.
const { song, SONGS, holdout } = require("./songs.js");

const args = process.argv.slice(2);
const verbose = args.includes("--verbose");
const only = args.find(a => !a.startsWith("--"));

// Each set must reach its pass count. Random 9000 has two known hard cases (see README).
const SETS = [
  { name: "main", songs: () => SONGS, need: 16 },
  { name: "main-48k", songs: () => SONGS.map(s => Object.assign({}, s, { sr: 48000 })), need: 16 },
  { name: "random-1000", songs: () => holdout(30, 1000), need: 30 },
  { name: "random-5000", songs: () => holdout(30, 5000), need: 30 },
  { name: "random-9000", songs: () => holdout(30, 9000), need: 28 },
];

const A = require("./load.js")();

const near = (arr, t) => { let lo = 0, hi = arr.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; arr[m] < t ? lo = m : hi = m } return Math.min(Math.abs(arr[lo] - t), Math.abs(arr[hi] - t)) };

async function analyse(spec) {
  const sg = song(spec), S = A.S;
  S.ch = [sg.L, sg.R]; S.y = A.mono(S.ch); S.sr = sg.sr; S.dur = S.y.length / sg.sr; S.name = spec.name;
  S.sets = {}; S.params = {}; S.cache.clear();
  S.env = await A.onsetEnv(S.y, S.sr);
  A.setBpm(A.tempo(S.env, S.sr / 512), true);
  return sg;
}

function score(spec, sg) {
  const S = A.S, tr = sg.truthBpm;
  let bpm = "n/a";
  if (tr) bpm = Math.abs(S.tb - tr) <= 1 ? "exact" : Math.abs(S.tb - 2 * tr) <= 2 ? "double" : Math.abs(S.tb - tr / 2) <= 1 ? "half" : "WRONG";
  // beats: compare at the metric level the app chose (double-time beats include the half-beats)
  let ref = sg.beats;
  if (bpm === "double") { ref = []; for (let i = 0; i < sg.beats.length; i++) { ref.push(sg.beats[i]); if (i + 1 < sg.beats.length) ref.push((sg.beats[i] + sg.beats[i + 1]) / 2) } }
  const span = S.beats.filter(t => t >= sg.beats[0] - .05 && t <= sg.beats[sg.beats.length - 1] + .05);
  const beats = span.filter(t => near(ref, t) < .07).length / Math.max(1, span.length);
  // bar starts: every 2-bar chop should start within 30 ms of a real bar line
  const cs = A.chopSet(2).filter(c => c.start >= sg.downs[0] - .1);
  const errs = cs.map(c => near(sg.downs, c.start + .004));
  const bars = errs.filter(e => e < .03).length / Math.max(1, cs.length);
  // loops: exact length at the BPM in the file name
  let loops = true;
  for (const c of cs.slice(0, 6)) { const r = A.render(c); if (r.seg.length !== Math.round(8 * 60 / S.tb * S.sr)) loops = false }
  const pass = bpm !== "WRONG" && beats >= .9 && bars >= .9 && loops;
  return { song: spec.name, truth: tr ? +tr.toFixed(1) : "-", shown: S.tb, bpm, beats: Math.round(beats * 100) + "%", bars: Math.round(bars * 100) + "%", loops: loops ? "exact" : "OFF", pass };
}

(async () => {
  let ok = true;
  const t0 = Date.now();
  for (const set of SETS) {
    if (only && set.name !== only) continue;
    const rows = [];
    for (const spec of set.songs()) { const sg = await analyse(spec); rows.push(score(spec, sg)) }
    const passed = rows.filter(r => r.pass).length, good = passed >= set.need;
    if (!good) ok = false;
    console.log(`${good ? "PASS" : "FAIL"}  ${set.name.padEnd(12)} ${passed}/${rows.length} songs (need ${set.need})`);
    for (const r of rows) if (verbose || !r.pass) console.log(`      ${r.pass ? "ok  " : "miss"} ${r.song.padEnd(34)} truth ${String(r.truth).padStart(5)}  shown ${String(r.shown).padStart(3)}  ${r.bpm.padEnd(6)} beats ${r.beats.padStart(4)}  bars ${r.bars.padStart(4)}  loops ${r.loops}`);
  }
  console.log(`\n${ok ? "All test sets passed" : "Some test sets FAILED"} in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  process.exit(ok ? 0 : 1);
})();
