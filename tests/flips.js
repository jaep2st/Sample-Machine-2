#!/usr/bin/env node
// Checks every flip mode, the stab kit, the filters and the break finder on generated songs.
//   node tests/flips.js
// Exits with code 1 on any failure.
const A = require("./load.js")();
const { song } = require("./songs.js");

const BOOM = { kick: "x.......x.x.....", snare: "....x.......x...", hat: "x.x.x.x.x.x.x.x." };
let fails = 0;
const check = (ok, what) => { console.log(`${ok ? "PASS" : "FAIL"}  ${what}`); if (!ok) fails++ };

function load(spec) {
  const sg = song(spec), S = A.S;
  S.ch = [sg.L, sg.R]; S.y = A.mono(S.ch); S.sr = sg.sr; S.dur = S.y.length / sg.sr; S.name = spec.name;
  S.sets = {}; S.params = {}; S.cache.clear(); S.brk = null;
  return sg;
}
const finite = chs => chs.every(x => x.every(Number.isFinite));
const peak = chs => Math.max(...chs.map(x => x.reduce((m, v) => Math.max(m, Math.abs(v)), 0)));
const corr = (a, b) => { const n = Math.min(a.length, b.length); let d = 0, x = 0, y = 0; for (let i = 0; i < n; i++) { d += a[i] * b[i]; x += a[i] * a[i]; y += b[i] * b[i] } return d / Math.sqrt(x * y || 1) };
// energy above 2 kHz via a simple difference filter (high frequencies make big sample-to-sample jumps)
const hf = x => { let s = 0; for (let i = 1; i < x.length; i++) s += (x[i] - x[i - 1]) ** 2; return s / x.length };

(async () => {
  // a 90 BPM boom-bap song with a 4-bar drum-only break in the middle (bars 12-15)
  const sg = load({ name: "flip test", tempo: () => 90, dur: 60, pat: BOOM, bass: 1, piano: 1, breakBars: [12, 16], seed: 5 });
  const S = A.S;
  S.env = await A.onsetEnv(S.y, S.sr); A.setBpm(A.tempo(S.env, S.sr / 512), true); S.key = A.detectKey(S.y, S.sr);
  check(S.tb === 90, `analysis reads 90 BPM (got ${S.tb})`);
  S.bars = 2;
  const it = A.chopSet(2)[2], sr = S.sr, want = b => Math.round(8 * 60 / b * sr);
  const plain = A.render(it);
  check(plain.seg.length === want(90), "plain 2-bar chop is exactly 8 beats at 90 BPM");

  for (const m of Object.keys(A.MODES)) {
    S.params[it.id] = A.base(); const p = A.P(it.id); A.MODES[m].go(p, it); p.mode = A.MODES[m].name; S.cache.clear();
    const r = A.render(it), L = r.seg.length;
    check(L === want(p.bpm) && finite(r.chs) && peak(r.chs) <= 1, `${A.MODES[m].name}: exact length at ${p.bpm} BPM, no bad samples, no clipping`);
    if (m === "soul") check(p.tape && p.bpm > 90 && Math.abs(L / plain.seg.length - 90 / p.bpm) < 1e-3 && /Tape speed \+/.test(r.st.join(" ")), `Soul Speed-Up: tape-style speed-up to ${p.bpm} BPM, pitch rises with it (${r.st.find(x => /Tape/.test(x))})`);
    if (m === "micro" || m === "offgrid") check(corr(r.seg, plain.seg) < .9 && p.flip.pat[0] === 0, `${A.MODES[m].name}: slices re-sequenced (similarity to original ${corr(r.seg, plain.seg).toFixed(2)}), downbeat kept`);
    if (m === "offgrid") check(p.flip.swing > 0 && p.flip.hum, "Off-Grid Flip: swing and human timing applied");
    if (m === "bass") check(hf(r.seg) < hf(plain.seg) * .05, `Filtered Bass: highs removed (${(hf(r.seg) / hf(plain.seg) * 100).toFixed(1)}% left)`);
    if (m === "dusty") check(hf(r.seg) < hf(plain.seg), "Dusty Loop: top end softened");
  }
  // loop seams: the first hit is untouched, and the last sample flows into the first (forward and reversed)
  { let worstHit = 1, worstJump = 0;
    for (const c of A.chopSet(2).slice(1, 9)) for (const rev of [false, true]) {
      S.params[c.id] = Object.assign(A.base(), { rev }); S.cache.clear(); const x = A.render(c).chs[0], L = x.length;
      if (!rev) { const k = Math.floor(.025 * sr), o = Math.floor(c.start * sr); let d = 0, a = 0, b = 0; for (let i = 0; i < k; i++) { d += x[i] * S.ch[0][o + i]; a += x[i] * x[i]; b += S.ch[0][o + i] ** 2 } worstHit = Math.min(worstHit, d / Math.sqrt(a * b || 1)) }
      let st = 0; for (let i = L - 200; i < L - 1; i++) st += Math.abs(x[i + 1] - x[i]); worstJump = Math.max(worstJump, Math.abs(x[0] - x[L - 1]) / (st / 199 || 1e-9)) }
    check(worstHit > .98, `loop seams: first hit of every loop is untouched (worst match ${worstHit.toFixed(3)})`);
    check(worstJump < 6, `loop seams: last sample flows into the first, forward and reversed (worst jump ${worstJump.toFixed(1)}x a normal step)`) }
  // flips re-roll: pressing a flip mode twice gives a different pattern
  S.params[it.id] = A.base(); let p = A.P(it.id); A.MODES.micro.go(p, it); const p1 = p.flip.pat.join(); A.MODES.micro.go(p, it);
  check(p.flip.pat.join() !== p1, "Micro-Chop Flip: tapping again gives a new flip");
  // stab kit: finds a real hit inside the chop
  const st = A.findStab(it);
  check(st.t >= it.start && st.t < it.end && st.len >= .12, `Stab Kit: picked a ${st.len.toFixed(2)} s hit inside the chop`);
  // filters
  const x = A.S.ch[0].slice(0, sr * 2);
  check(hf(A.filt(x, "lp", 300, .8, sr)) < hf(x) * .05 && hf(A.filt(x, "hp", 2000, .7, sr)) > hf(x) * .3, "low-pass and high-pass filters behave");
  // break finder: the drum-only bars should come out on top
  const br = A.breaks(), bt = [sg.downs[12], sg.downs[16]];
  check(br.length > 0 && br[0].start >= bt[0] - .1 && br[0].end <= bt[1] + .1, `Break finder: top break ${br[0] ? br[0].start.toFixed(1) + "-" + br[0].end.toFixed(1) + " s" : "none"} (real break ${bt[0].toFixed(1)}-${bt[1].toFixed(1)} s)`);
  // screwed and pitch-down slow the loop like tape
  for (const m of ["screw", "down"]) { S.params[it.id] = A.base(); const q = A.P(it.id); A.MODES[m].go(q, it); S.cache.clear(); const r = A.render(it);
    check(q.tape && q.bpm < 90 && r.seg.length === want(q.bpm) && /Tape speed -/.test(r.st.join(" ")), `${A.MODES[m].name}: slowed to ${q.bpm} BPM, pitch drops with it, exact length`) }
  // drum kit: pulls single hits and sorts them
  A.buildDrumKit(it); const kit = A.getKit() || [];
  const types = new Set(kit.map(k => k.note.split(" ")[0]));
  check(kit.length >= 4 && types.has("Kick") && types.has("Snare") && kit.every(k => finite(k.chs) && k.chs[0].length > 0.04 * sr), `Drum Kit: ${kit.length} hits found (${[...types].join(", ")})`);
  // open finder: a song with an 8-bar drumless intro should surface the intro
  load({ name: "open test", tempo: () => 92, dur: 60, pat: BOOM, bass: 1, piano: 1, drumsFrom: 21, seed: 9 });
  S.env = await A.onsetEnv(S.y, S.sr); A.setBpm(A.tempo(S.env, S.sr / 512), true); S.bars = 2;
  const op = A.opens();
  check(op.length > 0 && op[0].end <= 21.5, `Open finder: top open loop ${op[0] ? op[0].start.toFixed(1) + "-" + op[0].end.toFixed(1) + " s" : "none"} (drums start at 21 s)`);
  console.log(fails ? `\n${fails} check(s) FAILED` : "\nAll flip checks passed");
  process.exit(fails ? 1 : 0);
})();
