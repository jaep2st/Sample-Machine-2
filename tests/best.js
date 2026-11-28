#!/usr/bin/env node
// Checks the Best tab: no fade-outs, no silent intros, no repeats of the same section, and the reasons it shows.
//   node tests/best.js
const A = require("./load.js")();
const { song } = require("./songs.js");
const BOOM = { kick: "x.......x.x.....", snare: "....x.......x...", hat: "x.x.x.x.x.x.x.x." };
let fails = 0;
const check = (ok, what) => { console.log(`${ok ? "PASS" : "FAIL"}  ${what}`); if (!ok) fails++ };
async function load(spec) {
  const sg = song(spec), S = A.S;
  S.ch = [sg.L, sg.R]; S.y = A.mono(S.ch); S.sr = sg.sr; S.dur = S.y.length / sg.sr; S.name = spec.name;
  S.sets = {}; S.params = {}; S.cache.clear(); S.brk = null; S.opn = null; S.rk = null; S.pk = null;
  S.env = await A.onsetEnv(S.y, S.sr); A.setBpm(A.tempo(S.env, S.sr / 512), true); S.bars = 2; A.rank(); return sg;
}
const cos = (a, b) => { let d = 0, x = 0, z = 0; for (let k = 0; k < 12; k++) { d += a[k] * b[k]; x += a[k] * a[k]; z += b[k] * b[k] } return d / Math.sqrt(x * z || 1) };
(async () => {
  const S = A.S;
  // 1. a song that fades out over its last 20 s
  await load({ name: "fade", tempo: () => 92, dur: 120, pat: BOOM, bass: 1, piano: 1, fadeOut: 20, seed: 3 });
  const inFade = S.best.filter(c => c.end > S.dur - 18);
  check(S.best.length >= 4 && inFade.length === 0, `Fade-out: none of the ${S.best.length} Best chops sit in the fade (${inFade.map(c => c.n).join(",") || "none"})`);
  check(S.best[0].start < S.dur - 25, `Fade-out: top pick at ${S.best[0].start.toFixed(1)} s is well before the fade`);
  // 2. near-silent intro
  await load({ name: "intro", tempo: () => 88, dur: 90, pat: BOOM, bass: 1, piano: 1, drumsFrom: 0, intro: 7, seed: 8 });
  check(S.best.every(c => c.start > 5), `Silent intro: no Best chop starts in the first 7 s`);
  // 3. repeats: count Best chops that are near-copies of a higher-ranked one
  await load({ name: "repeats", tempo: () => 95, dur: 120, pat: BOOM, bass: 1, piano: 1, breakBars: [20, 24], seed: 12 });
  const dup = S.best.filter((c, i) => S.best.slice(0, i).some(p => cos(p.ft.avg, c.ft.avg) > .985 && Math.abs(Math.log(p.ft.level / c.ft.level)) < .35)).length;
  const distinct = new Set(S.best.map(c => c.why.join())).size;
  check(dup <= Math.max(0, S.best.length - 4), `Repeats: ${dup} near-copies among ${S.best.length} Best chops (the rest are different parts)`);
  check(S.best.some(c => c.why.includes("Drum break")), `Tags: the drum break is labelled (${S.best.map(c => c.why[0] || "-").join(", ")})`);
  check(S.best.every(c => Array.isArray(c.why)), "Every Best chop carries its reasons");
  // 4. a soft, drumless intro (the C.R.E.A.M. situation): it should be at or near the top
  await load({ name: "soul intro", tempo: () => 90, dur: 120, pat: BOOM, bass: 1, piano: 1, drumsFrom: 16, seed: 21 });
  const ip = S.best.findIndex(c => c.end <= 16.5);
  check(ip >= 0 && ip <= 1, `Drumless intro: ranked #${ip + 1} in Best (${S.best[Math.max(0, ip)].why.join(", ")})`);
  console.log(fails ? `\n${fails} check(s) FAILED` : "\nAll Best checks passed");
  process.exit(fails ? 1 : 0);
})();
