import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  BUDGETS_V3,
  COLONNES_DE_THEME,
  IMPACTS_BLOQUANTS,
  exigeUnManifesteLu,
  lisGroupes,
  rapporteViolations,
  routesPubliques,
  violationsBloquantes,
  type ViolationAxe,
} from '../e2e/visual/lib/a11y';
import type { EntreeDeManifeste, PorteurDeGroupe } from '../scripts/check-bundle-budget.mjs';

const ROOT = join(__dirname, '..');
const CONCEPTION = join(
  ROOT,
  '..',
  '..',
  'docs',
  'product',
  'MeeshyWebV3Design',
  'conception-web-v3.md',
);

const violation = (attributs: Partial<ViolationAxe> = {}): ViolationAxe => ({
  id: 'image-alt',
  impact: 'critical',
  help: 'Les images doivent porter un texte alternatif',
  nodes: [{ target: ['main > img'] }],
  ...attributs,
});

const entree = (route: string): EntreeDeManifeste => ({ route, chunks: [] });

const GROUPES: readonly PorteurDeGroupe[] = [
  {
    id: '(public)',
    motifs: ['/stories/*', '/reels/*', '/l/*', '/_not-found/page'],
  },
  { id: '(connected)', motifs: ['/feed/*', '/page'] },
];

const GROUPES_AMBIGUS: readonly PorteurDeGroupe[] = [
  { id: '(public)', motifs: ['/moods/*'] },
  { id: '(connected)', motifs: ['/moods/*'] },
];

const chemins = (routes: readonly { readonly chemin: string }[]): readonly string[] =>
  routes.map((route) => route.chemin);

describe('le verdict du gate axe — ce qui fait tomber une route (public)', () => {
  it('retient les violations serious et critical', () => {
    const retenues = violationsBloquantes([
      violation({ id: 'image-alt', impact: 'critical' }),
      violation({ id: 'link-name', impact: 'serious' }),
    ]);

    expect(retenues.map((v) => v.id)).toEqual(['image-alt', 'link-name']);
  });

  it('laisse passer les violations moderate et minor — le § 8.5 ne les gate pas', () => {
    const retenues = violationsBloquantes([
      violation({ id: 'region', impact: 'moderate' }),
      violation({ id: 'landmark-unique', impact: 'minor' }),
    ]);

    expect(retenues).toEqual([]);
  });

  it("retient une violation dont l'impact est absent : rien ne prouve qu'elle est sous la barre", () => {
    expect(violationsBloquantes([violation({ id: 'inconnue', impact: null })])).toHaveLength(1);
    expect(violationsBloquantes([violation({ id: 'inconnue', impact: undefined })])).toHaveLength(1);
  });

  it("retient une violation dont l'impact n'appartient pas à la taxonomie d'axe", () => {
    expect(violationsBloquantes([violation({ id: 'exotique', impact: 'blocker' })])).toHaveLength(1);
  });

  it('gate exactement serious et critical', () => {
    expect([...IMPACTS_BLOQUANTS]).toEqual(['serious', 'critical']);
  });
});

describe('le rapport de violation — un gate qui tombe doit dire OÙ', () => {
  it("nomme la route, la règle, l'impact et le nœud fautif", () => {
    const rapport = rapporteViolations('/stories/abc', [
      violation({ id: 'image-alt', impact: 'critical', nodes: [{ target: ['main > img'] }] }),
    ]);

    expect(rapport).toContain('/stories/abc');
    expect(rapport).toContain('image-alt');
    expect(rapport).toContain('critical');
    expect(rapport).toContain('main > img');
    expect(rapport).toContain('Les images doivent porter un texte alternatif');
  });

  it("dit pourquoi une violation sans impact connu est retenue, plutôt que de la ranger en critical", () => {
    const rapport = rapporteViolations('/stories/abc', [violation({ id: 'exotique', impact: null })]);

    expect(rapport).toContain('non classé');
    expect(rapport).not.toContain('critical');
  });

  it('compte les violations retenues', () => {
    const rapport = rapporteViolations('/x', [violation({ id: 'a' }), violation({ id: 'b' })]);

    expect(rapport).toContain('2');
  });
});

describe("le balayage — ce que la v3 SERT, pas ce que son disque porte", () => {
  it('balaie une page émise que budgets.json range dans (public)', () => {
    const routes = routesPubliques({
      entrees: [entree('/(public)/stories/[id]/page')],
      groupes: GROUPES,
      echantillons: { '/stories/[id]': '/stories/68b0000000000000000000aa' },
    });

    expect(chemins(routes)).toEqual(['/stories/68b0000000000000000000aa']);
  });

  it("laisse le segment de groupe hors de l'URL demandée au navigateur", () => {
    const routes = routesPubliques({ entrees: [entree('/(public)/l/page')], groupes: GROUPES });

    expect(chemins(routes)).toEqual(['/l']);
  });

  it("ignore une page que budgets.json range hors de (public)", () => {
    const routes = routesPubliques({
      entrees: [entree('/(connected)/feed/page')],
      groupes: GROUPES,
    });

    expect(routes).toEqual([]);
  });

  it("ignore un gestionnaire de route : il n'expédie aucun HTML à examiner", () => {
    const routes = routesPubliques({ entrees: [entree('/healthz/route')], groupes: GROUPES });

    expect(routes).toEqual([]);
  });

  it("porte la limite /_not-found dès que next build l'émet — budgets.json la range dans (public)", () => {
    const routes = routesPubliques({ entrees: [entree('/_not-found/page')], groupes: GROUPES });

    expect(chemins(routes)).toEqual(['/_not-found']);
  });

  it("échoue en nommant la route dynamique qui entre sans échantillon — aucun écran n'entre sans valeur d'exemple", () => {
    expect(() =>
      routesPubliques({ entrees: [entree('/(public)/reels/[id]/page')], groupes: GROUPES }),
    ).toThrow('/reels/[id]');
  });

  it('rend un ordre déterministe', () => {
    const routes = routesPubliques({
      entrees: [entree('/(public)/stories/page'), entree('/(public)/l/page')],
      groupes: GROUPES,
    });

    expect(chemins(routes)).toEqual(['/l', '/stories']);
  });
});

// `groupeDe` rend un verdict à DEUX champs — `{ groupe, ambigu }` — parce que `plusPrecis` pose
// délibérément `choix: null` dans DEUX cas distincts : rien ne réclame la page, ou deux groupes la
// réclament à précision égale. Le gate de budget les distingue et rend rc=2 sur les deux ; le gate
// axe n'en lisait que la moitié et SAUTAIT la page en silence, à côté de celles qu'un autre groupe
// réclame légitimement. Deux consommateurs d'un même module, une seule moitié de verdict honorée.
describe('une page émise sans groupe fait ÉCHOUER le balayage, jamais sauter en silence', () => {
  it("nomme la page qu'aucun motif de budgets.json ne réclame", () => {
    expect(() =>
      routesPubliques({ entrees: [entree('/(public)/moods/[id]/page')], groupes: GROUPES }),
    ).toThrow(/\/moods\/\[id\].*aucun motif/s);
  });

  it('nomme la page que deux groupes réclament à précision égale, et les cite', () => {
    expect(() =>
      routesPubliques({ entrees: [entree('/(public)/moods/page')], groupes: GROUPES_AMBIGUS }),
    ).toThrow(/\/moods.*\(public\).*\(connected\)/s);
  });

  it("n'échoue pas sur une page qu'un AUTRE groupe réclame — l'ignorer est légitime", () => {
    expect(() =>
      routesPubliques({ entrees: [entree('/(connected)/feed/page')], groupes: GROUPES }),
    ).not.toThrow();
  });
});

// Un `goto` qui rend une réponse NON NULLE ne prouve pas que la page demandée a été servie : une
// route émise qui échoue à l'exécution (404 sur un identifiant absent, 500, limite `error.tsx`)
// rend une page d'erreur qui hérite du `<html lang>` du layout racine et passe axe sans broncher.
// Le gate sortirait VERT sur un écran que le visiteur ne peut pas lire.
describe('chaque route balayée porte le statut HTTP qu’elle doit servir', () => {
  it('attend 200 sur une page ordinaire', () => {
    const routes = routesPubliques({ entrees: [entree('/(public)/l/page')], groupes: GROUPES });

    expect(routes).toEqual([{ id: '/l', chemin: '/l', statut: 200 }]);
  });

  it('attend 404 sur la limite /_not-found — le seul écran dont la panne EST le contrat', () => {
    const routes = routesPubliques({ entrees: [entree('/_not-found/page')], groupes: GROUPES });

    expect(routes.map((route) => route.statut)).toEqual([404]);
  });

  it("porte le statut jusqu'aux routes dynamiques échantillonnées", () => {
    const routes = routesPubliques({
      entrees: [entree('/(public)/stories/[id]/page')],
      groupes: GROUPES,
      echantillons: { '/stories/[id]': '/stories/68b0000000000000000000aa' },
    });

    expect(routes.map((route) => route.statut)).toEqual([200]);
  });
});

// `color-contrast` est une règle d'impact `serious` — la barre EXACTE de ce gate — et la seule
// dont le verdict dépend entièrement du thème. Sans stockage et sans média sombre, le script
// anti-flash pose toujours `light` : la branche `.dark`, celle pour laquelle il existe, n'était
// jamais auditée. Le § 9.6 tranche déjà ce piège pour le gate VISUEL avec QUATRE colonnes ; le
// gate d'accessibilité prend les mêmes, pour la même raison.
describe('le balayage a une dimension THÈME — un gate qui n’audite qu’une palette n’en garde qu’une', () => {
  it('porte les quatre colonnes du § 9.6', () => {
    expect(COLONNES_DE_THEME.map((colonne) => colonne.id)).toEqual([
      'system-light',
      'system-dark',
      'explicit-light-on-dark',
      'explicit-dark-on-light',
    ]);
  });

  it('audite les DEUX classes de thème, pas une seule', () => {
    expect([...new Set(COLONNES_DE_THEME.map((c) => c.classeAttendue))].sort()).toEqual([
      'dark',
      'light',
    ]);
  });

  it('oppose le stockage explicite à la préférence système sur deux colonnes', () => {
    const explicites = COLONNES_DE_THEME.filter((c) => c.stockage !== null);

    expect(explicites).toHaveLength(2);
    explicites.forEach((colonne) => {
      expect(colonne.classeAttendue).toBe(colonne.stockage);
      expect(colonne.classeAttendue).not.toBe(colonne.colorScheme);
    });
  });

  it('laisse la préférence système décider quand rien n’est stocké', () => {
    COLONNES_DE_THEME.filter((c) => c.stockage === null).forEach((colonne) => {
      expect(colonne.classeAttendue).toBe(colonne.colorScheme);
    });
  });
});

describe("la garde de balayage — un `[]` ne peut pas sortir vert sans prouver qu'il a vu", () => {
  it('rend les entrées quand le manifeste en porte', () => {
    const entrees = [entree('/healthz/route')];

    expect(exigeUnManifesteLu(entrees)).toBe(entrees);
  });

  it('échoue quand le manifeste est vide : le build manque, la mesure ne vaut rien', () => {
    expect(() => exigeUnManifesteLu([])).toThrow(/AUCUNE route/);
  });
});

describe('la zone (public) se lit dans budgets.json, pas dans un second inventaire', () => {
  const groupes = (): readonly PorteurDeGroupe[] => lisGroupes(readFileSync(BUDGETS_V3, 'utf8'));

  it('y trouve le groupe (public) et ses motifs', () => {
    const publique = groupes().find((groupe) => groupe.id === '(public)');

    expect(publique?.motifs).toContain('/stories/*');
    expect(publique?.motifs).toContain('/_not-found/page');
  });

  it("échoue quand le fichier ne déclare aucun groupe, plutôt que de balayer le vide", () => {
    expect(() => lisGroupes('{}')).toThrow(/aucun groupe/);
  });
});

// CE QUI LIT UN ARTEFACT DE BUILD NE PEUT PAS VIVRE DANS LE JOB QUI NE CONSTRUIT PAS.
//
// Un bloc `describe` lisait ici le manifeste RÉEL — `.next/app-build-manifest.json` — pour
// prouver que l'instrument voit autre chose que des entrées fabriquées. La propriété est
// juste ; sa PLACE ne l'était pas. Le job `Test web-v3` de la CI enchaîne install, `prisma
// generate`, build de `packages/shared`, puis `test:coverage` : il ne lance JAMAIS `next
// build` sur cette application. Le manifeste ne pouvait donc pas exister, et les trois
// témoins rendaient `ENOENT` à chaque run — un rouge permanent, sur une machine qui n'avait
// aucun moyen de devenir verte.
//
// Le vert d'origine venait d'un `.next/` présent dans l'arbre de travail de l'auteur. Un
// témoin dont le résultat dépend d'un répertoire gitignoré ne mesure pas le dépôt : il
// mesure la machine qui le lance.
//
// Les deux assertions non redondantes ont été portées dans `e2e/visual/v3-a11y.spec.ts`,
// exécuté par le job `a11y-v3` — celui qui, lui, porte l'étape « Build apps/web-v3 (le
// manifeste que le balayage lit) », posée précisément pour cette raison. Rien n'est perdu :
// elles passent d'un job où elles ne pouvaient que rougir à un job où elles peuvent conclure.
//
// Ce n'est PAS un test sauté. Un `describe.skip` conditionné à la présence du manifeste
// aurait été définitivement sauté en CI — le vert par vacuité que ce fichier dénonce trente
// lignes plus bas, retourné contre lui-même.

// UN INSTRUMENT DÉCLARÉ N'EST PAS UN INSTRUMENT LANCÉ.
//
// La première écriture de ce témoin assérait que `test:a11y` figure dans `package.json` — c'est-à-
// dire la DÉCLARATION, jamais l'INVOCATION, sa propre distinction retournée contre lui. Mesuré :
// la chaîne `test:a11y` n'apparaissait alors que DEUX fois dans le dépôt — sa définition et ce
// témoin. Aucune CI ne la lançait, et `scripts/v3-rapport.mjs` — l'agrégateur écrit pour qu'« une
// mesure non exécutée sorte en rapport incomplet, jamais en vert » — n'en connaissait pas
// l'existence : il aurait rendu « 4/4 vertes, rapport complet » pendant que le gate axe n'avait
// jamais été regardé. Le témoin gage donc les DEUX porteurs, pas la clé.
describe("le gate est BRANCHÉ — un instrument qu'aucune commande ne lance n'en est pas un", () => {
  const manifeste = (): unknown => JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

  const script = (nom: string): unknown => {
    const paquet = manifeste();
    const scripts =
      typeof paquet === 'object' && paquet !== null && 'scripts' in paquet ? paquet.scripts : {};
    return typeof scripts === 'object' && scripts !== null && nom in scripts
      ? (scripts as Record<string, unknown>)[nom]
      : undefined;
  };

  const lisRacine = (...segments: readonly string[]): string =>
    readFileSync(join(ROOT, '..', '..', ...segments), 'utf8');

  it('expose une commande qui lance le spec', () => {
    expect(script('test:a11y')).toContain('e2e/visual/v3-a11y.spec.ts');
  });

  it('déclare le paquet qui exécute axe dans le navigateur', () => {
    const paquet = manifeste();
    const dev =
      typeof paquet === 'object' && paquet !== null && 'devDependencies' in paquet
        ? paquet.devDependencies
        : {};

    expect(Object.keys(dev as Record<string, unknown>)).toContain('@axe-core/playwright');
  });

  it("entre dans le rapport unique : l'agrégateur ne peut plus se dire complet sans lui", () => {
    const rapport = lisRacine('scripts', 'v3-rapport.mjs');

    expect(rapport).toContain('mesureA11y');
    expect(rapport).toMatch(/agrege\(\[[^\]]*mesureA11y\(/s);
  });

  it("est LANCÉ par ci.yml, pas seulement défini par package.json", () => {
    const ci = lisRacine('.github', 'workflows', 'ci.yml');

    expect(ci).toContain('test:a11y');
    expect(ci).toContain('playwright install');
  });
});

describe('le § 8.5 de la conception nomme son instrument', () => {
  const ligneAxe = (): string => {
    const texte = readFileSync(CONCEPTION, 'utf8');
    const ligne = texte
      .split('\n')
      .find((l) => l.startsWith('- ') && l.includes('axe') && l.includes('serious'));
    if (ligne === undefined) throw new Error('§ 8.5 : la puce du gate axe est introuvable');
    return ligne;
  };

  it("cite le fichier qui porte le gate, au lieu d'annoncer un gate sans porteur", () => {
    expect(ligneAxe()).toContain('apps/web-v3/e2e/visual/v3-a11y.spec.ts');
  });

  // Le § 9.5 dit, 80 lignes plus bas et dans le même commit : « ce que le balayage prend pour
  // entrée est ce que next build a ÉMIS, pas ce que le disque porte ». Le § 8.5 promettait un
  // glob de `app/(public)/**/page.tsx` — deux descriptions d'un seul mécanisme, une seule vraie,
  // et c'est la plus lue qui était fausse.
  //
  // Le témoin porte sur l'AFFIRMATION, pas sur la présence du glob : le § 8.5 a le droit — et
  // même le devoir — de NOMMER l'approche rejetée avec sa raison. Ce qu'il ne peut plus faire,
  // c'est la présenter comme le mécanisme (« découvert depuis `app/… »).
  it('dit ce que le balayage prend pour ENTRÉE : le manifeste de build, pas le disque', () => {
    expect(ligneAxe()).toContain('app-build-manifest.json');
    expect(ligneAxe()).toMatch(/jamais depuis un parcours du disque|pas ce que le disque porte/);
    expect(ligneAxe()).not.toMatch(/d[ée]couvert\*{0,2} depuis `app\//);
  });

  // La garde livrée est une garde de NON-VACUITÉ sur le manifeste entier, dont le témoin est le
  // gestionnaire `/healthz/route`. Annoncer `not-found` comme témoin de contrôle promettait une
  // garde plus forte que celle qui existe — la seule erreur de documentation qu'un gate ne peut
  // pas rattraper, puisqu'elle porte sur ce qui l'empêche de sortir vert.
  it('décrit la garde qui EXISTE, en nommant son témoin réel', () => {
    expect(ligneAxe()).toContain('/healthz/route');
  });
});
