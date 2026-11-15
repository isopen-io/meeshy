/**
 * #17068 (constat n°9) — le verdict à TROIS valeurs d'une lecture de plan se
 * déclare une SEULE fois.
 *
 * `ReaderSignedPlanOutcome` et l'union écrite à la main
 * `EditedReaderPlan | null | 'unavailable'` disaient la même chose à deux
 * endroits. La structure l'expliquait — `EditedReaderPlan` est un type RÉDUIT à
 * ce que son unité consomme — mais c'était la jumelle d'un type dont **tout
 * l'argument est qu'on ne doit pas collapser ses valeurs** :
 *
 * | valeur | ce qu'elle dit | ce que l'appelant fait |
 * |---|---|---|
 * | un plan | « voici qui adresser » | remise par lecteur |
 * | `null` | « personne à adresser par lecteur » | diffusion de room |
 * | `'unavailable'` | « je ne SAIS pas adresser » | RIEN en direct |
 *
 * Le risque n'est pas théorique : si l'une gagne une QUATRIÈME valeur, l'autre
 * ne la connaîtra pas, et le site qui les relie compilera. Un générique partagé
 * le rend impossible — on ne peut plus en élargir une seule.
 *
 * Ce que ce témoin garde est donc ce qu'un générique ne peut PAS garder : le
 * retour d'une union RETAPÉE à la main. C'est la même forme que
 * `server-emit-door-sweep` (une porte se ferme, puis se contourne) et que la
 * garde de `resolvePrefsOnly` : un identifiant ou une forme dont la
 * réapparition est le défaut.
 *
 * Le motif cherché est ÉTROIT par décision — `null` ET `'unavailable'` dans la
 * même union. Le dépôt porte quatre autres usages de `'unavailable'` qui n'ont
 * rien à voir (`account-from-email`, `viewerEngagement`, `ServerKeyVault`) :
 * tous sont des membres d'unions DISCRIMINÉES (`{ kind: 'unavailable' }`), et un
 * balayage qui les compterait mesurerait la popularité d'un mot, pas une
 * propriété (cycle 107).
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SOCKETIO = join(__dirname, '..');
const LEAF = 'planOutcome.ts';

/** `X | null | 'unavailable'` sous ses deux ordres, hors commentaire. */
const HAND_WRITTEN = /\|\s*(?:null\s*\|\s*'unavailable'|'unavailable'\s*\|\s*null)/;

function sourcesOf(dir: string): Array<{ readonly name: string; readonly code: string }> {
  const out: Array<{ name: string; code: string }> = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === '__tests__') continue;
      out.push(...sourcesOf(full).map((f) => ({ name: `${entry}/${f.name}`, code: f.code })));
      continue;
    }
    if (!entry.endsWith('.ts') || entry.endsWith('.d.ts')) continue;
    out.push({ name: entry, code: readFileSync(full, 'utf8') });
  }
  return out;
}

const stripComments = (code: string) =>
  code.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');

describe("#17068 — une seule déclaration du verdict à trois valeurs", () => {
  it('le balayage BALAIE — sans quoi une garde négative reste verte sur rien', () => {
    const files = sourcesOf(SOCKETIO);

    expect(files.length).toBeGreaterThanOrEqual(20);
    expect(files.some((f) => f.name === LEAF)).toBe(true);
  });

  it("aucune union `| null | 'unavailable'` retapée à la main sous `socketio/`", () => {
    const offenders = sourcesOf(SOCKETIO)
      .filter((f) => f.name !== LEAF)
      .filter((f) => HAND_WRITTEN.test(stripComments(f.code)))
      .map((f) => f.name);

    // Le message NOMME le fichier : « 1 au lieu de 0 » laisse chercher.
    expect(offenders).toEqual([]);
  });

  it("le motif cherché TROUVE la forme fautive — sinon il ne garde rien", () => {
    expect(HAND_WRITTEN.test("type X = Plan | null | 'unavailable';")).toBe(true);
    expect(HAND_WRITTEN.test("type X = Plan | 'unavailable' | null;")).toBe(true);
    // Et il laisse passer les unions DISCRIMINÉES, qui sont une autre famille.
    expect(HAND_WRITTEN.test("type X = { kind: 'ok' } | { kind: 'unavailable' };")).toBe(false);
  });
});
