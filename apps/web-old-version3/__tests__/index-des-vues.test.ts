import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  ecrisLIndex,
  indexRegenere,
  litLesVues,
  vuesJointes,
} from '../scripts/lib/index-des-vues.mjs';
import type { IndexDeVues, LigneDeVue } from '../scripts/lib/index-des-vues.mjs';
import { selectionComparable } from '../scripts/lib/vues-comparables.mjs';

// Le dossier RÉEL — celui que `capture-cibles.js` régénère et que
// `compare-rendu.js` lit. Un témoin qui fabriquerait ses lignes dirait ce que son
// auteur croit ; celui-ci dit ce que le dépôt porte.
const DESIGN = join(__dirname, '..', '..', '..', 'docs', 'product', 'MeeshyWebV3Design');
const INDEX = join(DESIGN, 'vues.json');
const ANNEXE = join(DESIGN, 'jetons-de-vues.json');

const lisLIndex = (dossier: string): IndexDeVues =>
  JSON.parse(readFileSync(join(dossier, 'vues.json'), 'utf8')) as IndexDeVues;

// Ce qu'une CAPTURE produit : les sept champs scrapés de la planche, et rien de
// plus — la planche ne connaît aucun jeton. Les lignes réelles de `vues.json` en
// sont, par construction, la sortie.
const captureFraiche = (): readonly LigneDeVue[] => lisLIndex(DESIGN).vues;

// L'annexe n'est pas OPTIONNELLE dans ce dépôt : c'est le seul site où une vue
// déclare la valeur de ses jetons. Sa disparition se dit ici, par son nom, plutôt
// qu'en cascade d'ENOENT trois témoins plus bas.
const dossierDEssai = (): string => {
  expect(existsSync(ANNEXE)).toBe(true);
  const dossier = mkdtempSync(join(tmpdir(), 'vues-v3-'));
  cpSync(INDEX, join(dossier, 'vues.json'));
  cpSync(ANNEXE, join(dossier, 'jetons-de-vues.json'));
  return dossier;
};

const regenere = (dossier: string): void => {
  ecrisLIndex({ dossier, source: 'MeeshyWebV3.dc.html', vues: captureFraiche() });
};

const jetonsDe = (vues: readonly LigneDeVue[], id: string): Readonly<Record<string, string>> =>
  vues.find((v) => v.id === id)?.jetons ?? {};

describe('ce que la régénération de vues.json ÉCRIT', () => {
  it('ne pose que les champs que la planche produit — un `jetons` glissé dans le lot n’atteint pas le fichier', () => {
    const index = indexRegenere({
      source: 'MeeshyWebV3.dc.html',
      vues: [
        {
          id: 'linkRedirect',
          label: 'Ouverture du lien',
          route: '/l/:token',
          group: 'ENTRÉE PUBLIQUE',
          title: 'Ouverture du lien',
          subtitle: 'Redirection',
          png: 'cible/linkRedirect.png',
          jetons: { token: 'venu-du-scrape' },
        },
      ],
    });

    expect(index.count).toBe(1);
    expect(Object.keys(index.vues[0] ?? {})).toEqual([
      'id',
      'label',
      'route',
      'group',
      'title',
      'subtitle',
      'png',
    ]);
    expect(index.vues[0]?.jetons).toBeUndefined();
  });

  it('réécrit l’index ET sa version lisible, en laissant l’annexe OCTET POUR OCTET intacte', () => {
    const dossier = dossierDEssai();
    const annexeAvant = readFileSync(join(dossier, 'jetons-de-vues.json'));
    writeFileSync(join(dossier, 'vues.json'), '{"source":"","count":0,"vues":[]}\n');

    regenere(dossier);

    expect(lisLIndex(dossier).count).toBe(captureFraiche().length);
    expect(readFileSync(join(dossier, 'vues.md'), 'utf8')).toContain('/l/:token');
    expect(readFileSync(join(dossier, 'jetons-de-vues.json'))).toEqual(annexeAvant);
    rmSync(dossier, { recursive: true, force: true });
  });
});

// LE CŒUR DU LOT. Ces témoins assertent le POSITIF — la valeur du jeton, le
// chemin composé —, jamais « ça refuse » : un refus est le verdict des DEUX
// états, celui du défaut comme celui de sa réparation, donc un témoin qui le
// constate passerait dans les deux et ne prouverait rien.
describe('ce que la régénération PRÉSERVE', () => {
  it('rend encore les jetons de linkRedirect et linkExpired APRÈS une régénération complète', () => {
    const dossier = dossierDEssai();
    const avant = litLesVues(dossier);

    regenere(dossier);
    const apres = litLesVues(dossier);

    expect(jetonsDe(avant.vues, 'linkRedirect').token).toEqual(expect.any(String));
    expect(jetonsDe(apres.vues, 'linkRedirect')).toEqual(jetonsDe(avant.vues, 'linkRedirect'));
    expect(jetonsDe(apres.vues, 'linkExpired')).toEqual(jetonsDe(avant.vues, 'linkExpired'));
    expect(jetonsDe(apres.vues, 'linkRedirect').token).not.toBe(
      jetonsDe(apres.vues, 'linkExpired').token,
    );
    expect(apres.refus).toEqual([]);
    rmSync(dossier, { recursive: true, force: true });
  });

  it('DIT que l’annexe manque, au lieu de rendre le refus ordinaire d’un jeton non déclaré', () => {
    const dossier = dossierDEssai();
    rmSync(join(dossier, 'jetons-de-vues.json'), { force: true });

    const lecture = litLesVues(dossier);

    expect(lecture.refus.map((r) => r.id)).toEqual(['jetons-de-vues.json']);
    expect(lecture.refus[0]?.raison).toContain('jetons-de-vues.json');
    rmSync(dossier, { recursive: true, force: true });
  });

  it('NOMME un jeton déclaré dans vues.json — la prochaine régénération l’effacerait', () => {
    const index = lisLIndex(DESIGN);
    const dossier = dossierDEssai();
    writeFileSync(
      join(dossier, 'vues.json'),
      JSON.stringify(
        {
          ...index,
          vues: index.vues.map((v) =>
            v.id === 'linkRedirect' ? { ...v, jetons: { token: 'mal-place' } } : v,
          ),
        },
        null,
        1,
      ),
    );

    const lecture = litLesVues(dossier);

    expect(lecture.refus.map((r) => r.id)).toEqual(['linkRedirect']);
    expect(lecture.refus[0]?.raison).toContain('jetons-de-vues.json');
    expect(jetonsDe(lecture.vues, 'linkRedirect').token).not.toBe('mal-place');
    rmSync(dossier, { recursive: true, force: true });
  });
});

describe('la branche COMPARAISON du résolveur, par le chemin RÉEL', () => {
  it('rend linkRedirect et linkExpired COMPARABLES, sur deux écrans servis distincts', () => {
    const selection = selectionComparable({
      vues: litLesVues(DESIGN).vues,
      demandees: ['linkRedirect', 'linkExpired'],
    });

    expect(selection.refus).toEqual([]);
    expect(selection.comparables.map((c) => c.id)).toEqual(['linkRedirect', 'linkExpired']);
    selection.comparables.forEach((c) => expect(c.chemin).not.toContain(':'));
    expect(new Set(selection.comparables.map((c) => c.chemin)).size).toBe(2);
  });

  // Le MÊME chemin, annexe vidée : il refuse. C'est l'état d'avant ce lot, et
  // c'est ce qui rend le témoin ci-dessus discriminant plutôt que décoratif.
  it('refuse les deux dès que l’annexe ne les déclare plus — les deux états sont donc DISTINGUÉS', () => {
    const selection = selectionComparable({
      vues: vuesJointes({ index: lisLIndex(DESIGN), jetons: {} }),
      demandees: ['linkRedirect', 'linkExpired'],
    });

    expect(selection.comparables).toEqual([]);
    expect(selection.refus.map((r) => r.id)).toEqual(['linkRedirect', 'linkExpired']);
  });
});

// LES SEPT ÉCRANS DE `reglages-details` (matrice.json) SONT DES SIBLINGS : les
// sept servent `/settings/*` derrière la MÊME garde MEMBRE. Trois d'entre eux
// (`detail-profile`, `detail-security`, `detail-application`) n'avaient AUCUNE
// entrée dans `jetons-de-vues.json` : `creanceDeVue` (compare-rendu.js) posait
// alors ZÉRO cookie, la route redirigeait vers `/login`, et le gate de
// conformité comparait un FORMULAIRE DE CONNEXION contre la cible du réglage —
// une mesure qui ne pouvait jamais dire si l'écran EST conforme, mesurée le
// 2026-09-06 (`rendu/detail-profile.dark.png` = page `/login`, aux deux
// bornes : next-start nu ET passerelle de bouchon correctement montée).
describe('toute vue MEMBRE déclare sa session — dérivé des groupes de vues.json', () => {
  // La liste n'est PAS écrite ici : elle se dérive des groupes de l'index réel,
  // pour qu'une vue MEMBRE ajoutée demain rougisse d'elle-même si son entrée
  // manque à l'annexe — 9 vues (feed, reels, composer, storyCreate, notifs,
  // contacts, settings, profileEdit, password) capturaient la page de CONNEXION
  // en silence, à l'octet près identiques, faute d'entrée (2026-09-06).
  const GROUPES_MEMBRE = [
    'MEMBRE — PRINCIPAL',
    'APPELS',
    'SOCIAL',
    'ESPACE MEMBRE',
    'ESPACE MEMBRE — FICHES DE REGLAGES',
  ] as const;
  // Exclusions dites, jamais silencieuses : callAudio/callVideo sont des routes
  // paramétrées P2 hors capture ; comments et story attendent la décision
  // produit #5134 (lecture sans compte) avant de fixer leur session de capture.
  const EXCLUES = new Set(['callAudio', 'callVideo', 'comments', 'story']);
  const vuesMembre = captureFraiche()
    .filter((v) => (GROUPES_MEMBRE as readonly string[]).includes(v.group))
    .map((v) => v.id)
    .filter((id) => !EXCLUES.has(id));

  it('la dérivation trouve bien des vues (le filtre ne peut pas devenir inerte)', () => {
    expect(vuesMembre.length).toBeGreaterThanOrEqual(20);
  });

  it.each(vuesMembre)('%s déclare @session: membre dans jetons-de-vues.json', (id) => {
    const annexe = JSON.parse(readFileSync(ANNEXE, 'utf8')) as {
      jetons: Record<string, Record<string, string> | undefined>;
    };
    expect(annexe.jetons[id]?.['@session']).toBe('membre');
  });
});
