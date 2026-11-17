/**
 * La MESURE des règles d'options sous homme du milieu — confirmation d'un appareil par code court
 * (#18906, #19154). Elle fonde l'arbitrage 1 de la spécification
 * `docs/superpowers/specs/2026-11-17-e2ee-ajout-appareil-par-code.md` (quatre options en carré) :
 *
 *   node packages/shared/scripts/measure-device-verification-options.mjs [tirages = 200000]
 *
 * Le code affiché par le nouvel appareil est tiré INDÉPENDAMMENT du code juste de l'appareil qui
 * répond (c'est ce qu'un homme du milieu obtient). Règles mesurées : v1 de la spec (premier symbole
 * distinct), amendement 2 littéral (3 options), symétrique (3), carré (4, retenu), carré à paires
 * uniformes, cube (8). Utilisateurs simulés : hasard, écran seul (option la plus « typique »),
 * gauche-droite, premier symbole, « juste assez » (plus petit ensemble de positions qui départage,
 * en emoji puis en chiffres), honnête. Ce n'est pas une étude d'utilisabilité (§ 11) : ce sont des
 * comportements stylisés, dont les taux s'écrivent au tableau de l'arbitrage 1.
 *
 * Aléa non déterministe (`node:crypto`) : deux exécutions donnent des taux voisins, pas identiques.
 * Le témoin déterministe de la référence est `__tests__/device-verification-options.test.ts`.
 */
import { randomBytes, randomInt } from 'node:crypto';
const N = Number(process.argv[2] ?? 200000);
const P42 = 2 ** 42;
const symsOf = (n48) => Array.from({ length: 7 }, (_, i) => Math.floor(n48 / 2 ** (42 - 6 * i)) % 64);
const pack = (s, low6) => s.reduce((a, v) => a * 64 + v, 0) * 64 + low6;
const bytesOf = (n48) => Array.from({ length: 6 }, (_, i) => Math.floor(n48 / 2 ** (40 - 8 * i)) % 256);
const dec = (n48) => { const b = bytesOf(n48); return [((b[0] << 5) | (b[1] >> 3)) + 1000, (((b[1] & 7) << 10) | (b[2] << 2) | (b[3] >> 6)) + 1000, (((b[3] & 63) << 7) | (b[4] >> 1)) + 1000]; };
const rnd48 = () => randomBytes(6).reduce((a, x) => a * 256 + x, 0);
const other = (v) => (v + 1 + randomInt(63)) % 64;
const shared = (a, b) => a.filter((x, i) => x === b[i]).length;
const shuffle = (a) => { const r = [...a]; for (let i = r.length - 1; i > 0; i--) { const j = randomInt(i + 1); [r[i], r[j]] = [r[j], r[i]]; } return r; };
const distinctBoth = (opts) => new Set(opts.map((o) => o.s.join(','))).size === opts.length && new Set(opts.map((o) => o.d.join(','))).size === opts.length;
const mk = (s, low) => ({ s, d: dec(pack(s, low)) });
// chaque règle rend { opts: [{s,d}], at } (at = index du code juste)
const rules = {
  'v1 (1er symbole distinct)': (real, low) => { const o = [real]; while (o.length < 3) { const d = symsOf(rnd48()); if (o.every((x) => x[0] !== d[0]) && shared(d, real) <= 2) o.push(d); } const at = randomInt(3); const r = o.slice(1); r.splice(at, 0, real); return { opts: r.map((s) => mk(s, low)), at }; },
  'amendement 2 littéral (3)': (real, low) => { for (;;) { const p = shuffle([0, 1, 2, 3, 4, 5, 6]); const c = (P) => real.map((v, i) => (P.includes(i) ? other(v) : v)); const r = [c(p.slice(0, 2)), c(p.slice(2, 4))]; const at = randomInt(3); r.splice(at, 0, real); const opts = r.map((s) => mk(s, low)); if (distinctBoth(opts)) return { opts, at }; } },
  'symétrique (3)': (real, low) => { for (;;) { const p = shuffle([0, 1, 2, 3, 4, 5, 6]); const P0 = p.slice(0, 2), P1 = p.slice(2, 4), P2 = p.slice(4, 6); const v0 = P0.map((i) => other(real[i])); const d1 = real.map((v, i) => (P0.includes(i) ? v0[P0.indexOf(i)] : P1.includes(i) ? other(v) : v)); const d2 = real.map((v, i) => (P0.includes(i) ? v0[P0.indexOf(i)] : P2.includes(i) ? other(v) : v)); const r = [d1, d2]; const at = randomInt(3); r.splice(at, 0, real); const opts = r.map((s) => mk(s, low)); if (distinctBoth(opts)) return { opts, at }; } },
  'carré (4) retenu {0,1}x{3,5}': (real, low) => { const B1 = [0, 1], B2 = [3, 5]; const a = real.map((v) => other(v)); const v = (b1, b2) => real.map((x, i) => ((b1 && B1.includes(i)) || (b2 && B2.includes(i)) ? a[i] : x)); const all = [v(0, 0), v(1, 0), v(0, 1), v(1, 1)]; const order = shuffle([0, 1, 2, 3]); return { opts: order.map((k) => mk(all[k], low)), at: order.indexOf(0) }; },
  'carré (4) paires uniformes': (real, low) => { for (;;) { const p = shuffle([0, 1, 2, 3, 4, 5, 6]); const B1 = p.slice(0, 2), B2 = p.slice(2, 4); const a = real.map((v) => other(v)); const v = (b1, b2) => real.map((x, i) => ((b1 && B1.includes(i)) || (b2 && B2.includes(i)) ? a[i] : x)); const all = [v(0, 0), v(1, 0), v(0, 1), v(1, 1)]; const order = shuffle([0, 1, 2, 3]); const opts = order.map((k) => mk(all[k], low)); if (distinctBoth(opts)) return { opts, at: order.indexOf(0) }; } },
  'cube (8) {0,1}x{3}x{5}': (real, low) => { const B = [[0, 1], [3], [5]]; const a = real.map((v) => other(v)); const v = (m) => real.map((x, i) => (B.some((Bk, k) => (m >> k) & 1 && Bk.includes(i)) ? a[i] : x)); const all = Array.from({ length: 8 }, (_, m) => v(m)); const order = shuffle([0, 1, 2, 3, 4, 5, 6, 7]); return { opts: order.map((k) => mk(all[k], low)), at: order.indexOf(0) }; },
};
const subsetsOf = (n) => { const out = []; for (let m = 1; m < 1 << n; m++) out.push([...Array(n).keys()].filter((p) => m & (1 << p))); return out.sort((a, b) => a.length - b.length); };
const SUB7 = subsetsOf(7), SUB3 = subsetsOf(3);
const users = {
  hasard: (shown, opts) => ({ pick: randomInt(opts.length), looked: 0 }),
  'écran seul (médoïde)': (shown, opts) => { const cost = opts.map((o) => opts.reduce((s, q) => s + (7 - shared(o.s, q.s)), 0)); const m = Math.min(...cost); const best = cost.map((c, i) => (c === m ? i : -1)).filter((i) => i >= 0); return { pick: best[randomInt(best.length)], looked: 0 }; },
  'gauche-droite': (shown, opts) => { let alive = opts.map((_, i) => i); for (let p = 0; p < 7; p++) { alive = alive.filter((i) => opts[i].s[p] === shown.s[p]); if (alive.length <= 1) return { pick: alive[0] ?? null, looked: p + 1 }; } return { pick: alive[0] ?? null, looked: 7 }; },
  'premier symbole': (shown, opts) => { let alive = opts.map((_, i) => i); for (let p = 0; p < 7; p++) { const next = alive.filter((i) => opts[i].s[p] === shown.s[p]); if (next.length === 0) return { pick: null, looked: p + 1 }; if (next.length === 1) return { pick: next[0], looked: p + 1 }; alive = next; } return { pick: alive[0], looked: 7 }; },
  'juste assez (emoji)': (shown, opts) => { const S = SUB7.find((S) => new Set(opts.map((o) => S.map((p) => o.s[p]).join(','))).size === opts.length); const alive = opts.map((_, i) => i).filter((i) => S.every((p) => opts[i].s[p] === shown.s[p])); return { pick: alive.length === 1 ? alive[0] : null, looked: S.length }; },
  'juste assez (chiffres)': (shown, opts) => { const S = SUB3.find((S) => new Set(opts.map((o) => S.map((p) => o.d[p]).join(','))).size === opts.length); const alive = opts.map((_, i) => i).filter((i) => S.every((p) => opts[i].d[p] === shown.d[p])); return { pick: alive.length === 1 ? alive[0] : null, looked: S.length }; },
};
const lines = [];
for (const [rn, rule] of Object.entries(rules)) {
  let honest = 0, singleNumber = 0, singleSymbol = 0;
  const stats = Object.fromEntries(Object.keys(users).map((u) => [u, { win: 0, decoy: 0, looked: 0 }]));
  for (let t = 0; t < N; t++) {
    const n = rnd48(); const real = symsOf(n); const low = n % 64; const { opts, at } = rule(real, low);
    const shownN = mk(symsOf(rnd48()), 0);
    for (const [un, u] of Object.entries(users)) { const r = u(shownN, opts); const st = stats[un]; st.looked += r.looked; if (r.pick === at) st.win++; else if (r.pick !== null && r.pick !== undefined) st.decoy++; }
    if (users['gauche-droite']({ s: real, d: dec(pack(real, low)) }, opts).pick === at) honest++;
    const sep = (k, key) => [...Array(k).keys()].some((p) => opts.filter((o) => o[key][p] === opts[at][key][p]).length === 1);
    if (sep(7, 's')) singleSymbol++; if (sep(3, 'd')) singleNumber++;
  }
  lines.push(`\n## ${rn} — ${N} tirages ; honnête réussi ${(100 * honest / N).toFixed(2)} % ; un SYMBOLE seul isole le code juste : ${(100 * singleSymbol / N).toFixed(2)} % ; un NOMBRE seul l'isole : ${(100 * singleNumber / N).toFixed(2)} %`);
  for (const [un, st] of Object.entries(stats)) lines.push(`  ${un.padEnd(24)} fantôme approuvé ${String(st.win).padStart(7)}/${N} = ${(st.win / N).toExponential(2).padEnd(9)} leurre touché ${(st.decoy / N).toExponential(2).padEnd(9)} lus ${(st.looked / N).toFixed(2)}`);
}
// accusé : 2 symboles, 4 options en carré (1 symbole par « bit »)
let accWin = 0, accRand = 0;
for (let t = 0; t < N; t++) { const real = [randomInt(64), randomInt(64)]; const a = [other(real[0]), other(real[1])]; const all = [[real[0], real[1]], [a[0], real[1]], [real[0], a[1]], [a[0], a[1]]]; const order = shuffle([0, 1, 2, 3]); const opts = order.map((k) => all[k]); const at = order.indexOf(0); const shown = [randomInt(64), randomInt(64)]; const alive = opts.map((_, i) => i).filter((i) => opts[i][0] === shown[0] && opts[i][1] === shown[1]); if (alive.length === 1 && alive[0] === at) accWin++; if (randomInt(4) === at) accRand++; }
lines.push(`\n## accusé (2 symboles, 4 options en carré) — homme du milieu : ${accWin}/${N} = ${(accWin / N).toExponential(2)} (2^-12 = ${(2 ** -12).toExponential(2)}) ; toucher au hasard ${(accRand / N).toFixed(4)}`);
console.log(lines.join('\n'));
