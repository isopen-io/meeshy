import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  CIBLES_PRODUCTION,
  composeBaseline,
  estDeProduction,
  optionsDeMesure,
  routeDe,
  verdictDeLigneDeBase,
} from '../scripts/baseline.mjs';
import type { LigneDeBaseline } from '../scripts/baseline.mjs';
import { composeMesure, mesureIndisponible } from '../scripts/mesure-reseau.mjs';

const CHEMIN = join(__dirname, '..', 'e2e', 'visual', 'baseline.json');

const RACINE = join(__dirname, '..', '..', '..');

const SOURCE_BASELINE = join(__dirname, '..', 'scripts', 'baseline.mjs');

describe('la ligne de base « AVANT », mesurée sur la prod actuelle', () => {
  it('vise les quatre gestes du rôle premier, sur l\'apex de production', () => {
    expect(CIBLES_PRODUCTION.length).toBeGreaterThanOrEqual(4);
    CIBLES_PRODUCTION.forEach((cible) => expect(cible.url).toMatch(/^https:\/\/meeshy\.me\//));
  });

  it('date la mesure et nomme ce qu\'elle mesure', () => {
    const baseline = composeBaseline({
      date: '2026-08-30',
      mesures: [],
    });

    expect(baseline.date).toBe('2026-08-30');
    expect(baseline.mesure).toContain('apps/web');
    expect(baseline.mesures).toEqual([]);
  });

  it('garde « à établir » ce qui n\'a pas pu être joint — jamais un zéro', () => {
    const baseline = composeBaseline({
      date: '2026-08-30',
      mesures: [
        mesureIndisponible({
          url: 'https://meeshy.me/',
          commande: 'node apps/web-v3/scripts/baseline.mjs',
          raison: 'proxy 403',
        }),
      ],
    });

    expect(baseline.mesures[0]?.statut).toBe('à établir');
    expect(baseline.mesures[0]?.octets_transferes).toBeNull();
    expect(baseline.etablie).toBe(false);
  });
});

describe('le baseline.json commité', () => {
  const baseline: unknown = JSON.parse(readFileSync(CHEMIN, 'utf8'));
  const lignes = (baseline as { readonly mesures?: readonly LigneDeBaseline[] }).mesures ?? [];

  it('porte une entrée par geste du rôle premier', () => {
    expect(lignes.length).toBe(CIBLES_PRODUCTION.length);
  });

  it('accompagne CHAQUE valeur de la commande qui la produit', () => {
    expect(lignes.length).toBeGreaterThan(0);
    lignes.forEach((ligne) => expect(ligne.commande).toContain('baseline.mjs'));
  });

  it("n'avance aucun chiffre qu'une mesure n'a pas rendu", () => {
    lignes
      .filter((ligne) => ligne.statut !== 'mesuré')
      .forEach((ligne) => {
        expect(ligne.octets_transferes).toBeNull();
        expect(ligne.lcp_ms).toBeNull();
        expect(ligne.requetes_avant_premier_pixel).toBeNull();
        expect(ligne.raison).toEqual(expect.any(String));
      });
  });
});

// Le critère de fin du lot demande des valeurs MESURÉES. Tant qu'il n'est pas
// atteint, le fichier doit le DIRE — un manque qui ne se voit pas devient un
// critère silencieusement réputé rempli.
describe('un manque reste un point OUVERT, jamais un critère réputé rempli', () => {
  const baseline: {
    readonly etablie?: boolean;
    readonly point_ouvert?: { readonly a_rejouer?: string; readonly prerequis?: readonly string[] } | null;
    readonly mesures?: readonly LigneDeBaseline[];
  } = JSON.parse(readFileSync(CHEMIN, 'utf8'));

  it("nomme ce qu'il faut rejouer, et où, tant que la ligne de base n'est pas établie", () => {
    if (baseline.etablie) {
      expect(baseline.point_ouvert).toBeNull();
      return;
    }
    expect(baseline.point_ouvert?.a_rejouer).toContain('baseline.mjs');
    expect(baseline.point_ouvert?.prerequis?.length).toBeGreaterThan(0);
  });

  it("ne peut pas se déclarer établi sans porter de chiffres", () => {
    const declaree = composeBaseline({
      date: '2026-08-30',
      mesures: [
        mesureIndisponible({ url: 'https://meeshy.me/', commande: 'x', raison: 'proxy 403' }),
      ],
    });

    expect(declaree.etablie).toBe(false);
    expect(declaree.point_ouvert).not.toBeNull();
  });

  it("retire le point ouvert dès que TOUTES les cibles ont rendu un chiffre", () => {
    const mesuree = composeMesure({
      url: 'https://meeshy.me/',
      commande: 'x',
      http: 200,
      dureeMs: 1,
      requetesEmises: 1,
      requetesTerminees: 1,
      reponses: [],
      chargements: [{ requestId: '1', encodedDataLength: 1024 }],
      ressources: [],
      fcpMs: 100,
      lcpMs: 200,
      cls: 0,
    });

    const etablie = composeBaseline({ date: '2026-08-30', mesures: [mesuree] });

    expect(etablie.etablie).toBe(true);
    expect(etablie.point_ouvert).toBeNull();
  });

  it("le fichier commité dit lui-même s'il satisfait le critère de fin", () => {
    const chiffrees = (baseline.mesures ?? []).filter((m) => m.statut === 'mesuré').length;

    expect(baseline.etablie).toBe(chiffrees === (baseline.mesures ?? []).length && chiffrees > 0);
  });
});

// LE VERDICT QUE L'AGRÉGATEUR LIT — conception § 9.2, table « Ligne de base ».
//
// La ligne de base était le seul livrable de la machine de vérification que le
// rapport unique ne regardait pas : `scripts/v3-rapport.mjs` agrégeait six
// mesures et ignorait celle-ci. C'est exactement le défaut que son propre
// en-tête nomme — « un instrument absent de l'agrégation ne rougit jamais : il
// n'existe pas » — appliqué à la seule mesure qui, elle, n'est PAS établie.
//
// Le verdict vit ici, avec la donnée qu'il juge, et non dans l'agrégateur : une
// seconde lecture de `etablie` côté racine serait la jumelle que le § 9.2
// interdit.
const ligneMesuree = (url: string): LigneDeBaseline =>
  composeMesure({
    url,
    commande: `node apps/web-v3/scripts/baseline.mjs ${url}`,
    http: 200,
    dureeMs: 640,
    requetesEmises: 3,
    requetesTerminees: 3,
    reponses: [],
    chargements: [{ requestId: '1', encodedDataLength: 40960 }],
    ressources: [],
    fcpMs: 900,
    lcpMs: 1400,
    cls: 0.01,
  });

// Un identifiant PUBLIC vivant à la place du placeholder : c'est ce que le
// workflow demande à l'opérateur, et c'est donc la seule forme de fichier qui
// puisse être verte.
const urlVivante = (gabarit: string): string => gabarit.replace(/<[^>]+>/, 'abc123');

const ligneDeBaseComplete = (
  surcharge: Record<string, unknown> = {},
): Record<string, unknown> => ({
  ...composeBaseline({
    date: '2026-08-30',
    mesures: CIBLES_PRODUCTION.map((cible) => ligneMesuree(urlVivante(cible.url))),
    profil: optionsDeMesure().profil,
  }),
  ...surcharge,
});

describe('la ligne de base rend un verdict que le rapport unique peut compter', () => {
  it("sort NON EXÉCUTÉE tant qu'elle n'est pas établie — jamais verte", () => {
    const verdict = verdictDeLigneDeBase(
      composeBaseline({
        date: '2026-08-30',
        mesures: [
          mesureIndisponible({ url: 'https://meeshy.me/', commande: 'x', raison: 'proxy 403' }),
        ],
      }),
    );

    expect(verdict.statut).toBe('non exécutée');
    expect(verdict.chiffres).toBeNull();
    expect(verdict.raison).toContain('baseline.mjs');
  });

  it('sort VERTE avec ses chiffres ET ses conditions dès que les six cibles sont mesurées', () => {
    const verdict = verdictDeLigneDeBase(ligneDeBaseComplete());

    expect(verdict.statut).toBe('vert');
    expect(verdict.raison).toBeNull();
    expect(verdict.chiffres).toEqual({
      date: '2026-08-30',
      cibles: CIBLES_PRODUCTION.length,
      mesurees: CIBLES_PRODUCTION.length,
      octets_max_ko: 40,
      requetes_avant_premier_pixel_max: 1,
      lcp_max_ms: 1400,
      profil: optionsDeMesure().profil?.nom,
      repetitions: optionsDeMesure().repetitions,
      percentile: optionsDeMesure().rang,
    });
  });

  // Le fichier porte lui-même son `etablie`. Le croire sur parole rendrait vert
  // un fichier édité à la main — la seule façon dont ce critère de fin peut être
  // réputé rempli sans qu'aucune mesure n'ait été prise.
  it('sort ROUGE si le fichier se DÉCLARE établi sans porter de chiffres', () => {
    const verdict = verdictDeLigneDeBase({
      date: '2026-08-30',
      etablie: true,
      mesures: [mesureIndisponible({ url: 'https://meeshy.me/', commande: 'x', raison: 'proxy 403' })],
    });

    expect(verdict.statut).toBe('rouge');
    expect(verdict.raison).toContain('sans');
  });

  it('sort ROUGE sur un fichier illisible ou absent, au lieu de faire tomber le rapport', () => {
    expect(verdictDeLigneDeBase(null).statut).toBe('rouge');
    expect(verdictDeLigneDeBase({ mesures: [] }).statut).toBe('rouge');
  });

  it('juge le fichier COMMITÉ tel qu’il est aujourd’hui', () => {
    const verdict = verdictDeLigneDeBase(JSON.parse(readFileSync(CHEMIN, 'utf8')));

    expect(['vert', 'non exécutée']).toContain(verdict.statut);
  });
});

// Un instrument qu'aucune commande ne lance n'en est pas un — même règle que le
// gate axe (`a11y-gate.test.ts`), et même défaut : la ligne de base avait sa
// forme, son fichier et sa commande, et AUCUN hôte capable de l'exécuter. Ses
// deux porteurs sont donc gagés : le rapport unique, qui la compte, et un
// workflow `workflow_dispatch` qui la prend depuis un runner dont le réseau
// sortant atteint réellement meeshy.me — ce que l'egress de la session de
// développement refuse (403 à CONNECT meeshy.me:443).
describe('la ligne de base est BRANCHÉE', () => {
  const lisRacine = (...segments: readonly string[]): string =>
    readFileSync(join(RACINE, ...segments), 'utf8');

  it("entre dans le rapport unique : l'agrégateur ne peut plus se dire complet sans elle", () => {
    const rapport = lisRacine('scripts', 'v3-rapport.mjs');

    expect(rapport).toContain('mesureLigneDeBase');
    expect(rapport).toMatch(/agrege\(\[[^\]]*mesureLigneDeBase\(/s);
  });

  it('a un hôte qui sait la prendre : un workflow qui lance baseline.mjs', () => {
    const workflow = lisRacine('.github', 'workflows', 'v3-baseline.yml');

    expect(workflow).toContain('workflow_dispatch');
    expect(workflow).toContain('apps/web-v3/scripts/baseline.mjs');
    expect(workflow).toMatch(/playwright@[\d.]+ install --with-deps chromium/);
  });

  // Le navigateur installé par l'hôte et le `playwright-core` que la mesure
  // charge parlent le MÊME protocole CDP ou ne se parlent pas. Les deux versions
  // vivent dans deux fichiers que rien ne relie — un bump de l'un rendrait le
  // job vert au checkout et rouge au lancement du navigateur.
  it('installe le Chromium de la version que la mesure sait piloter', () => {
    const workflow = lisRacine('.github', 'workflows', 'v3-baseline.yml');
    const navigateur = lisRacine('scripts', 'lib', 'navigateur.cjs');
    const version = /playwright-core@([\d.]+)/.exec(navigateur)?.[1];

    expect(version).toEqual(expect.any(String));
    expect(workflow).toContain(`playwright@${version} install`);
  });

  // Les six cibles du § 8.2 (3) exigent de VRAIS identifiants publics : un
  // workflow qui les coderait en dur mesurerait des pages d'erreur, et
  // `baseline.json` porterait des chiffres qui ne disent rien du rôle premier.
  it("demande les identifiants publics à l'opérateur plutôt que de les inventer", () => {
    const workflow = lisRacine('.github', 'workflows', 'v3-baseline.yml');

    CIBLES_PRODUCTION.filter((cible) => cible.url.includes('<')).forEach((cible) => {
      expect(workflow).toContain(cible.route);
    });
    expect(workflow).not.toContain('<token>');
    expect(workflow).not.toContain('<id>');
  });
});

// LES CONDITIONS SONT LA MOITIÉ DE LA MESURE — conception § 8.3 (« 3G Fast
// simulé, p75 ») et § 9.2 (« la même mesure sert le gate de la v3 ET la ligne de
// base »).
//
// Le MODULE était partagé, ses CONDITIONS ne l'étaient pas : `baseline.mjs`
// appelait `mesureUrls` sans options, donc sans émulation réseau et en UNE
// exécution, pendant que le gate de la v3 applique le profil de `budgets.json`
// et rend un p75. L'« AVANT » aurait été pris en fibre de datacenter et
// l'« APRÈS » en 3G — deux chiffres non comparables, et rien dans le fichier
// écrit ne l'aurait dit.
describe('la ligne de base se prend dans les conditions contre lesquelles la v3 sera jugée', () => {
  it('applique le profil réseau que budgets.json déclare, jamais la fibre du runner', () => {
    const options = optionsDeMesure();

    expect(options.profil?.nom).toContain('3G');
    expect(options.profil?.download_bps).toEqual(expect.any(Number));
    expect(options.repetitions).toBe(options.profil?.repetitions);
    expect(options.rang).toBe(options.profil?.percentile);
  });

  it('passe ces options à la mesure — un profil lu et non passé ne freine rien', () => {
    const source = readFileSync(SOURCE_BASELINE, 'utf8');

    expect(source).toMatch(/const options = optionsDeMesure\(\)/);
    expect(source).toMatch(/mesureUrls\(joignables, commandePour, options\)/);
  });

  it('écrit les conditions DANS le fichier : un chiffre sans son profil ne se compare pas', () => {
    const baseline = composeBaseline({
      date: '2026-08-30',
      mesures: [ligneMesuree('https://meeshy.me/')],
      profil: optionsDeMesure().profil,
    });

    expect(baseline.profil?.nom).toContain('3G');
    expect(baseline.repetitions).toBe(optionsDeMesure().repetitions);
    expect(baseline.percentile).toBe(optionsDeMesure().rang);
  });

  it("sort ROUGE sur une ligne de base établie qui ne dit pas dans quelles conditions", () => {
    const verdict = verdictDeLigneDeBase(ligneDeBaseComplete({ profil: null }));

    expect(verdict.statut).toBe('rouge');
    expect(verdict.raison).toContain('§ 8.3');
  });
});

// CE QU'UN VERDICT DOIT REGARDER EN PLUS DE « COMBIEN DE LIGNES SONT PLEINES ».
//
// Deux façons de rendre la septième mesure VERTE sans avoir rien mesuré de la
// production : la prendre sur localhost, ou la prendre sur un identifiant mort
// dont `page.goto` rend un 404 avec une page d'erreur. Les deux passaient.
describe('un fichier qui ne mesure pas la production ne peut pas être vert', () => {
  it("refuse une URL qui n'est pas servie par la production, dès la commande", () => {
    expect(estDeProduction('https://meeshy.me/story/abc')).toBe(true);
    expect(estDeProduction('http://127.0.0.1:8931/')).toBe(false);
    expect(estDeProduction('https://staging.meeshy.me/')).toBe(false);
    expect(estDeProduction('https://meeshy.me.evil.test/')).toBe(false);
  });

  it('sort ROUGE sur une ligne de base prise ailleurs que sur la production', () => {
    const verdict = verdictDeLigneDeBase(
      composeBaseline({
        date: '2026-08-30',
        mesures: [ligneMesuree('http://127.0.0.1:8931/')],
        profil: optionsDeMesure().profil,
      }),
    );

    expect(verdict.statut).toBe('rouge');
    expect(verdict.raison).toContain('production');
  });

  it('sort ROUGE quand il manque une route du rôle premier', () => {
    const partielle = ligneDeBaseComplete({
      mesures: CIBLES_PRODUCTION.slice(0, 3).map((cible) => ligneMesuree(urlVivante(cible.url))),
    });

    const verdict = verdictDeLigneDeBase(partielle);

    expect(verdict.statut).toBe('rouge');
    expect(verdict.raison).toContain('/mood/[postId]');
  });

  it("reconnaît la route d'une URL vivante, pas seulement celle d'un gabarit", () => {
    expect(routeDe('https://meeshy.me/')).toBe('/');
    expect(routeDe('https://meeshy.me/story/68f0c1a2')).toBe('/story/[postId]');
    expect(routeDe('https://meeshy.me/l/abc?x=1')).toBe('/l/[token]');
    expect(routeDe('https://meeshy.me/inconnu/abc')).toBeNull();
  });

  it("ne pose pas « mesuré » sur un code d'erreur : une page 404 n'est pas un geste", () => {
    const morte = composeMesure({
      url: 'https://meeshy.me/story/mort',
      commande: 'x',
      http: 404,
      dureeMs: 120,
      requetesEmises: 1,
      requetesTerminees: 1,
      reponses: [],
      chargements: [{ requestId: '1', encodedDataLength: 2048 }],
      ressources: [],
      fcpMs: null,
      lcpMs: null,
      cls: null,
    });

    expect(morte.statut).toBe('à établir');
    expect(morte.raison).toContain('404');
    expect(morte.octets_transferes).toBeNull();
    expect(morte.lcp_ms).toBeNull();
  });

  it("ne remplace pas un chiffre absent par un zéro qui se compare", () => {
    const sansPeinture = ligneDeBaseComplete({
      mesures: CIBLES_PRODUCTION.map((cible) => ({
        ...ligneMesuree(urlVivante(cible.url)),
        lcp_ms: null,
      })),
    });

    const verdict = verdictDeLigneDeBase(sansPeinture);

    expect(verdict.statut).toBe('rouge');
    expect(verdict.raison).toContain('lcp_ms');
  });
});

// L'HÔTE NE PEUT PAS ÊTRE DÉTOURNÉ PAR CE QU'ON LUI DONNE.
//
// Six entrées `workflow_dispatch` interpolées par `${{ }}` dans un `run:` sont
// substituées dans le script AVANT que le shell ne s'exécute : une entrée
// portant `"; curl … | sh; "` s'exécute sur le runner. Les entrées passent donc
// par `env:`, et le script les cite.
describe("l'hôte de la ligne de base ne substitue aucune entrée dans son shell", () => {
  const workflow = readFileSync(
    join(RACINE, '.github', 'workflows', 'v3-baseline.yml'),
    'utf8',
  );

  it("ne laisse `${{ inputs.… }}` que dans une affectation d'environnement", () => {
    workflow
      .split('\n')
      .filter((ligne) => !ligne.trimStart().startsWith('#'))
      .filter((ligne) => /\$\{\{\s*inputs\./.test(ligne))
      .forEach((ligne) => expect(ligne).toMatch(/^\s+[A-Z_]+:\s*\$\{\{\s*inputs\.[a-z]+\s*\}\}$/));
  });

  it('cite les variables dans la commande de mesure', () => {
    expect(workflow).toContain('"$ACCUEIL"');
    expect(workflow).toContain('"$LIEN"');
    expect(workflow).toContain('"$MOOD"');
  });

  // 6 cibles × 5 exécutions en 3G Fast : le plafond de 25 minutes hérité de la
  // mesure en une passe couperait le job au milieu et rendrait un artefact
  // incomplet — pire qu'un échec, parce qu'il se commite.
  it('se donne le temps que le profil 3G réclame', () => {
    const minutes = Number(/timeout-minutes:\s*(\d+)/.exec(workflow)?.[1]);

    expect(minutes).toBeGreaterThanOrEqual(40);
  });
});
