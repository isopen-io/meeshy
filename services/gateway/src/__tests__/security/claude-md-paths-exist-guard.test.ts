/**
 * Les chemins cités par un `CLAUDE.md` EXISTENT (#4455).
 *
 * Ces fichiers sont la consigne que chaque session lit avant de toucher un
 * répertoire. Le `CLAUDE.md` du gateway donnait trois indications sur la
 * régénération du manifeste — le fichier produit, le cliquet qui rougit, la
 * commande — et **les trois étaient fausses**. Le document ne se trompait pas
 * sur le fond : il se trompait sur le OÙ et le COMMENT, c'est-à-dire sur la
 * seule partie qu'on vient y chercher.
 *
 * > Un document d'instructions qui dit vrai sur le principe et faux sur le
 * > chemin est plus coûteux qu'un document absent : on lui fait confiance, on
 * > suit, on échoue, et on ne sait pas si l'erreur est la sienne.
 *
 * Le coût est mesuré : une session de cartographie a dû rectifier les trois
 * chemins avant de pouvoir répondre.
 *
 * ## Ce que la garde regarde, et ce qu'elle laisse passer
 *
 * Seuls les chemins portant un RÉPERTOIRE (`routes/foo.ts`) sont vérifiés. Un
 * nom nu (`calls.ts`) est un raccourci de prose, pas une indication de lieu —
 * l'exiger ferait rougir la moitié du document pour rien, et une garde qui
 * rougit pour rien se fait désarmer.
 *
 * Un chemin est admis s'il existe à la racine du dépôt, sous le répertoire du
 * `CLAUDE.md`, ou sous son `src/` — les trois formes que ces documents
 * emploient réellement.
 *
 * ## La DETTE, et pourquoi elle est nommée fichier par fichier
 *
 * Les cinq autres `CLAUDE.md` portent le même défaut, mesuré le 2026-08-31.
 * Les corriger ici serait écrire dans cinq territoires à la fois ; les ignorer
 * rendrait la garde muette sur eux. Chaque entrée porte donc son COMPTE : la
 * garde rougit si un fichier en dette empire, **et** si un fichier en dette
 * s'améliore sans que sa ligne suive — une dette périmée ment autant qu'une
 * dette absente.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';

const RACINE = join(__dirname, '../../../../..');

/**
 * Un chemin cité doit porter un RÉPERTOIRE — un nom nu (`calls.ts`) est un
 * raccourci de prose, pas une indication de lieu.
 *
 * Les backticks ne sont PAS exigés, et c'est le point : la première version de
 * cette garde ne regardait qu'eux, et laissait donc passer le défaut le plus
 * coûteux de #4455 — la COMMANDE de régénération, qui vit dans un bloc de code
 * clôturé, sans backtick inline. Une garde qui rate précisément le cas qui l'a
 * fait naître est pire qu'une garde absente.
 *
 * Un chemin est reconnu à son préfixe : il commence par un répertoire de
 * premier niveau du dépôt, ou par un segment relatif suivi d'un fichier.
 */
// L'alternation va du PLUS LONG au plus court, et se ferme sur une frontière :
// `js` avant `json` matcherait `route-manifest.js` dans `route-manifest.json`,
// et la garde inventerait deux fichiers introuvables qui n'ont jamais été cités.
// Mesuré ici même — l'ordre d'une alternation n'est pas un détail de style.
const CHEMIN_CITE = /([A-Za-z0-9_@.-]+(?:\/[A-Za-z0-9_@.-]+)+\.(?:tsx|ts|mjs|json|js|md|prisma|yml|swift|kt|py|sh))(?![A-Za-z0-9])(?::\d+)?/g;

/**
 * Compte des chemins introuvables, fichier par fichier, au 2026-08-31.
 * Une entrée à zéro se RETIRE — la garde le vérifie.
 */
const DETTE: ReadonlyArray<{ fichier: string; introuvables: number }> = [
  { fichier: 'CLAUDE.md', introuvables: 7 },
  { fichier: 'apps/ios/CLAUDE.md', introuvables: 4 },
  { fichier: 'apps/web/CLAUDE.md', introuvables: 1 },
  { fichier: 'infrastructure/CLAUDE.md', introuvables: 1 },
  { fichier: 'packages/MeeshySDK/CLAUDE.md', introuvables: 7 },
  { fichier: 'packages/shared/CLAUDE.md', introuvables: 1 },
];

const FICHIERS = [
  'CLAUDE.md',
  'apps/android/CLAUDE.md',
  'apps/ios/CLAUDE.md',
  'apps/web/CLAUDE.md',
  'infrastructure/CLAUDE.md',
  'packages/MeeshySDK/CLAUDE.md',
  'packages/shared/CLAUDE.md',
  'services/agent/CLAUDE.md',
  'services/gateway/CLAUDE.md',
  'services/translator/CLAUDE.md',
];

/**
 * Les citations qui nomment volontairement quelque chose d'ABSENT.
 *
 * Un document a le droit de raconter un retrait — c'est même ce qui empêche de
 * refaire l'erreur. Une garde qui l'interdirait pousserait à effacer
 * l'histoire pour faire taire un test, ce qui est exactement l'inverse du but.
 * Chaque entrée porte donc sa raison, et non un simple laissez-passer.
 */
const CITATIONS_VOLONTAIREMENT_ABSENTES: ReadonlyArray<{ chemin: string; raison: string }> = [
  {
    chemin: '__tests__/unit/socketio/MeeshySocketIOManager.presenceSnapshot.test.ts',
    raison: "cité comme « cas réel, SUPPRIMÉ au cycle 62 » — le document raconte sa suppression",
  },
  {
    chemin: 'X/index.ts',
    raison: "gabarit générique du § « Un fichier `X.ts` à côté d'un répertoire `X/` », pas une adresse",
  },
];

/**
 * Les racines depuis lesquelles un chemin peut résoudre.
 *
 * Ce sont les formes que ces documents emploient RÉELLEMENT — mesurées, pas
 * supposées : une adresse relative au répertoire du document, à son `src/`, à
 * son `src/routes/` (le raccourci le plus fréquent du gateway) ou à son
 * `src/__tests__/`.
 */
const BASES = ['', 'src', 'src/routes', 'src/__tests__', 'src/__tests__/unit/routes'] as const;

/** Les chemins cités par un document, et ceux qui ne résolvent nulle part. */
function introuvables(relatif: string): string[] {
  const absolu = join(RACINE, relatif);
  if (!existsSync(absolu)) return [];
  const base = dirname(absolu);
  const source = readFileSync(absolu, 'utf8');
  const exemptes = new Set(CITATIONS_VOLONTAIREMENT_ABSENTES.map((e) => e.chemin));
  const cites = new Set<string>();
  for (const m of source.matchAll(CHEMIN_CITE)) if (!exemptes.has(m[1])) cites.add(m[1]);
  return [...cites].filter(
    (c) => !existsSync(join(RACINE, c)) && !BASES.some((b) => existsSync(join(base, b, c))),
  );
}

describe('Les chemins cités par un CLAUDE.md existent (#4455)', () => {
  it('balaie réellement les documents — sinon une liste vide passerait au vert', () => {
    // Témoin de balayage : le document du gateway cite des dizaines de chemins.
    // Sans lui, un `RACINE` mal calculé rendrait « aucun chemin » partout et la
    // garde affirmerait le contraire de ce qu'elle mesure.
    const source = readFileSync(join(RACINE, 'services/gateway/CLAUDE.md'), 'utf8');
    expect([...source.matchAll(CHEMIN_CITE)].length).toBeGreaterThan(30);
  });

  it('le CLAUDE.md du gateway ne cite AUCUN chemin introuvable', () => {
    expect(introuvables('services/gateway/CLAUDE.md')).toEqual([]);
  });

  it('chaque exemption porte une RAISON — un laissez-passer nu se périme sans qu\'on le voie', () => {
    for (const { chemin, raison } of CITATIONS_VOLONTAIREMENT_ABSENTES) {
      expect(raison.length).toBeGreaterThan(20);
      // Et l'exemption ne survit pas à son objet : si le fichier réapparaît,
      // la ligne doit partir, sinon elle cache un vrai chemin.
      expect(existsSync(join(RACINE, 'services/gateway', chemin))).toBe(false);
    }
  });

  it.each(FICHIERS.filter((f) => !DETTE.some((d) => d.fichier === f) && f !== 'services/gateway/CLAUDE.md'))(
    '%s ne cite aucun chemin introuvable',
    (fichier) => {
      expect(introuvables(fichier)).toEqual([]);
    },
  );

  it.each(DETTE)('$fichier ne DÉPASSE pas sa dette déclarée ($introuvables)', ({ fichier, introuvables: attendu }) => {
    const trouves = introuvables(fichier);
    // Le sens qui compte : la dette ne grandit pas.
    expect(trouves.length).toBeLessThanOrEqual(attendu);
    // Et le sens inverse : une dette qui a fondu doit voir sa ligne suivre,
    // sinon la liste dit un chiffre que personne ne doit plus.
    expect(trouves.length).toBe(attendu);
  });
});
