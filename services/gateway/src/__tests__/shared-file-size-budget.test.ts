/**
 * Le CLIQUET du budget de taille sur `packages/shared` (#4532).
 *
 * ## Ce qu'il ferme
 *
 * `packages/shared/types/api-schemas.ts` fait **3995 lignes** — le contrat de
 * réponse de tout le dépôt, quatre fois le plafond — et **rien ne le mesure**.
 * Il a déjà écarté deux corrections : #4487 (hisser `issues` dans
 * `errorResponseSchema`) et #4535. La directive 2026-08-28 interdit d'ajouter à
 * un fichier hors budget avant de l'avoir découpé ; le blocage a donc été
 * découvert **en le heurtant**, faute d'une mesure qui le signale.
 *
 * C'est la troisième fois que la même forme se paie : **un inventaire ferme une
 * classe dans la langue où on l'a énoncée** (leçon 261). #4284 disait `routes/`
 * et laissait `NotificationService.ts` à 6119 lignes ; #4426 a élargi au
 * gateway et laissait `packages/shared` dehors ; #4531 a élargi aux suites du
 * gateway et laissait `packages/shared` dehors aussi. La directive, elle, ne
 * nomme ni `routes/`, ni le gateway, ni les suites :
 *
 * > « Le budget vaut pour les sources **écrites à la main** (Swift, TS,
 * > Python) — pas pour le code généré ni les dépendances. »
 *
 * ## La mesure DU JOUR (2026-08-31, `dev` à 7e9f3306a1)
 *
 * 252 fichiers `.ts` hors `node_modules/`, `dist/` et `.d.ts`. **130 sources de
 * production, 121 témoins, 1 artefact généré.** Neuf fichiers atteignent
 * 1000 lignes ; les chiffres gelés plus bas sont ceux-là, mesurés ici avec le
 * `lineCount` de ce dépôt — **jamais recopiés depuis l'issue**, qui aura
 * vieilli (c'est la règle que #4426 et #4531 se sont déjà appliquée, et les
 * chiffres de #4426 avaient bougé en une nuit).
 *
 * Un fait de cadrage a été rectifié à la mesure : les témoins vivent dans NEUF
 * répertoires `__tests__`, pas quatre — `__tests__/{ci,providers,types,utils,vectors}`
 * s'ajoutent à `__tests__`, `api/__tests__`, `types/__tests__` et
 * `types/preferences/__tests__`. Le sélecteur ne s'en trouve pas changé (il
 * discrimine sur le SEGMENT, qui les couvre tous), mais une énumération de
 * répertoires ne se recopie pas plus qu'un compte (leçon 261).
 *
 * ## Trois populations, pas deux — et la troisième est EXCLUE
 *
 * `api/endpoints.ts` (1476 lignes) est **GÉNÉRÉ** : son en-tête le déclare, et
 * `api-endpoints:generate` le réécrit en entier depuis
 * `services/gateway/route-manifest.json`. Le compter gèlerait 1476 lignes que
 * **personne ne peut réduire à la main** — la directive l'exempte nommément, et
 * un cliquet qui gèle une dette irréductible cesse d'être un levier.
 *
 * L'exemption est donc ÉCRITE (`ARTEFACTS_GENERES`), TESTÉE dans les deux sens,
 * et sa preuve est LUE dans le fichier plutôt qu'affirmée de mémoire :
 *
 * - le fichier exempté porte la marque de génération **dans son en-tête** ;
 * - **aucun autre** fichier retenu ne la porte — sans quoi l'exemption serait
 *   incomplète, et une exemption incomplète est un gel de dette irréductible.
 *
 * La marque se cherche dans les SIX PREMIÈRES LIGNES, et c'est mesuré : quatre
 * fichiers de `packages/shared` contiennent la phrase ailleurs — les deux
 * rendus qui l'ÉCRIVENT (`api/build-catalog.ts`, `api/build-swift-endpoints.ts`),
 * le script qui les pilote, et le cliquet qui l'ASSERTE. **Citer une marque
 * n'est pas la porter** : un balayage plein texte rendrait quatre faux positifs
 * et exempterait quatre fichiers écrits à la main.
 *
 * Le client Prisma, que #4532 range aussi dans le généré, ne contribue AUCUN
 * `.ts` au balayage : `prisma/client/` ne porte que des `.d.ts` et des `.js`,
 * déjà écartés par le sélecteur. Rien à exempter de ce côté.
 *
 * ## La portée : DEUX listes, production et témoins gelés SÉPARÉMENT
 *
 * C'est la question que cette livraison devait trancher, et voici la raison.
 *
 * **Pourquoi pas une seule liste :** parce qu'elle accorderait la compensation
 * le jour exact où la dette est payée. Découper `api-schemas.ts` — le but même
 * de #4532 — retirerait 3995 lignes d'un cumul commun de 16 101, ouvrant près
 * de 4000 lignes de marge à une population de témoins dont le SEUL membre hors
 * budget est à 1001. Le cliquet se desserrerait au moment où il devrait mordre.
 * C'est la raison de #4531 (« découper un service ne doit pas acheter le droit
 * de faire grossir une suite »), et l'asymétrie d'ici — 15 100 lignes de
 * production contre 1001 de témoin — la rend plus forte, pas plus faible.
 *
 * ## Ce que la liste des TÉMOINS porte, et ce qu'elle ne porte PAS : la règle 3
 *
 * #4615 est ouverte contre la règle 3 du cliquet des témoins du gateway :
 * « le péage tombe sur le geste qu'on veut récompenser » — ajouter un témoin à
 * une suite déjà saturée exige de la découper d'abord, ce qui encourage à ne
 * PAS écrire le témoin, ou à le poser loin de ce qu'il couvre. L'issue dit
 * explicitement que le cliquet de PRODUCTION (#4426) n'a pas ce défaut : « un
 * fichier de production qui grossit, c'est de la dette, et mordre est juste ».
 *
 * **La règle 3 n'est donc PAS reprise sur les témoins ici**, et trois mesures
 * le justifient plutôt qu'un goût :
 *
 * 1. **Sur une liste à UNE entrée, la marge est nulle par construction, et
 *    définitivement.** La règle 3 borne un CUMUL : elle laisse un fichier
 *    grossir quand un frère maigrit. Avec une seule entrée il n'y a pas de
 *    frère — « le cumul ne remonte pas » y veut dire « ce fichier précis ne
 *    gagnera jamais une ligne ».
 * 2. **Le cliquet des témoins du gateway est à marge NULLE aujourd'hui**
 *    (cumul gelé = cumul mesuré = 158 523 sur 86 fichiers, 2026-08-31) : un
 *    seul `it` ajouté à l'un des 86 rougit `dev`. Le défaut de #4615 n'est pas
 *    théorique, il bloque une branche.
 * 3. **Le péage tomberait ici sur le travail que la liste de PRODUCTION
 *    réclame.** `utils/river-lanes.ts` (1044, gelé en production) est le sujet
 *    de `__tests__/river-lanes.test.ts` (1001, unique entrée des témoins).
 *    Découper le premier, c'est écrire les témoins des modules qui en sortent —
 *    que la règle 3 interdirait tant que le second n'est pas découpé lui aussi.
 *    Le cliquet de production serait taxé par celui des témoins, sur la même
 *    feature, dans le même lot.
 *
 * **Ce qui reste mesuré chez les témoins : les FRANCHISSEMENTS.** La règle 1
 * interdit qu'un 122ᵉ témoin passe au-dessus du seuil — c'est la propriété pour
 * laquelle #4531 a été ouverte (87 fichiers étaient déjà hors budget, et rien
 * n'empêchait le 88ᵉ). **Ce qui reste NON mesuré, et je le nomme plutôt que de
 * le taire : la DÉRIVE de l'unique entrée gelée**, à 1001 lignes aujourd'hui,
 * qui peut grossir sans qu'un témoin tombe. La taille du trou est donc connue —
 * un fichier — et il se ferme quand #4615 livrera son « delta borné par fichier
 * et par lot, que le commit NOMME » : ce cliquet l'adoptera alors, et gagnera sa
 * règle 3. Inventer ici une réponse concurrente à une issue ouverte coûterait
 * plus cher que le trou (#4615, critère 3 : « un plancher qui bouge sans
 * justification cesse de mesurer quoi que ce soit »).
 *
 * ## Le balayage NE DESCEND PAS dans `node_modules/` ni `dist/`
 *
 * `walk` descend dans tout répertoire, et `packages/shared` — contrairement à
 * `services/gateway/src` — en porte deux qui n'ont rien à faire dans la mesure.
 * Aujourd'hui la précaution semble gratuite : le balayage rend **252 fichiers
 * avec ou sans elle**, parce que bun 1.3 installe en mode ISOLÉ et que les
 * paquets y sont des LIENS SYMBOLIQUES, dont `entry.isDirectory()` rend `false`.
 *
 * **C'est un accident de layout d'installation, pas une propriété.** Le
 * `node_modules` RACINE du dépôt porte 4155 fichiers `.ts` non-`.d.ts` : sous un
 * `npm`/`pnpm` à répertoires réels, le même balayage les aspirerait et gèlerait
 * des sources de DÉPENDANCES que la directive exempte au même titre que le
 * généré. La borne de non-vacuité ne verrait rien passer — elle compte, et le
 * compte serait au contraire trop grand.
 *
 * ## La borne de NON-VACUITÉ porte sur le compte ET sur la MESURE
 *
 * Un balayage vide passe les trois règles au vert pour la pire des raisons — le
 * piège déjà payé par #4531, où `overBudget(<…>/src/__tests__, 1000)` rendait
 * `[]` (tout chemin sous cette racine porte le segment `__tests__` que le
 * sélecteur de production exclut) et laissait un cliquet vert sur rien.
 *
 * La borne d'ici va un cran plus loin que celle du gateway : elle vérifie que le
 * balayage COMPTE des fichiers **et** qu'il en LIT les lignes. Un `lineCount`
 * qui rendrait 0 partout laisserait une liste de 252 fichiers tous « sous le
 * seuil » — trois règles vertes, zéro mesure.
 *
 * ## Ce que les listes portent, et ce qu'elles ne portent pas
 *
 * Fichier + nombre de lignes, **jamais un numéro de ligne** — une clé de ligne
 * périme au premier commit et transforme le cliquet en bruit. Même loi que
 * `security/response-schema-closure-guard.test.ts`.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { readFileSync, statSync } from 'fs';
import { basename, join, relative, sep } from 'path';

import {
  estSourceTypeScript,
  isHandWrittenSource,
  isHandWrittenTest,
  lineCount,
  overBudget,
  walk,
  type SelecteurDeFichier,
} from './helpers/file-size-sweep';

const RACINE = join(__dirname, '..', '..', '..', '..', 'packages', 'shared');

/** Le plafond des cliquets frères (#4284, #4426, #4531), plus strict que la directive (1100). */
const MAX_LINES = 1000;

/**
 * Les répertoires dans lesquels le balayage NE DESCEND PAS : les dépendances et
 * l'artefact de compilation. La directive les exempte tous deux, et `walk`
 * descend partout par défaut (§ « Le balayage NE DESCEND PAS »).
 */
const REPERTOIRES_EXCLUS: readonly string[] = ['node_modules', 'dist'];

const descendre = (chemin: string): boolean => !REPERTOIRES_EXCLUS.includes(basename(chemin));

const cheminRelatif = (chemin: string): string => relative(RACINE, chemin).split(sep).join('/');

/**
 * Les artefacts GÉNÉRÉS, hors périmètre par la directive.
 *
 * Cette liste est une DÉCLARATION, pas une commodité : les deux témoins qui la
 * gardent exigent que chaque entrée porte la marque de génération dans son
 * en-tête, et qu'aucun autre fichier retenu ne la porte.
 */
const ARTEFACTS_GENERES: readonly string[] = ['api/endpoints.ts'];

/**
 * La marque qu'un rendu pose en tête de ce qu'il écrit
 * (`api/build-catalog.ts`, `api/build-swift-endpoints.ts`).
 */
const MARQUE_DE_GENERATION = /GÉNÉRÉ[^\n]{0,4}ne pas éditer/;

/** Les six premières lignes — citer la marque n'est pas la porter (§ Trois populations). */
const enTete = (chemin: string): string =>
  readFileSync(chemin, 'utf8').split('\n').slice(0, 6).join('\n');

/** Prend un chemin ABSOLU — celui que `walk` rend. Lui passer un chemin déjà
 * relatif rendrait `relative()` muet (il résoudrait contre le `cwd`) et
 * l'assertion qui l'emploie incapable de tomber. */
const estGenere = (chemin: string): boolean => ARTEFACTS_GENERES.includes(cheminRelatif(chemin));

/** Les sources de PRODUCTION écrites à la main : ni témoin, ni `.d.ts`, ni généré. */
const estSourceDeProduction: SelecteurDeFichier = (chemin) =>
  isHandWrittenSource(chemin) && !estGenere(chemin);

/** Les TÉMOINS écrits à la main. Le segment `__tests__` est le discriminant COMPLET :
 * zéro `*.test.ts` de `packages/shared` vit hors d'un tel répertoire (mesuré), et
 * `__tests__/vectors/harness.ts` montre pourquoi discriminer sur le suffixe
 * `.test.ts` laisserait dehors les harnais qui portent la même dette. */
const estTemoin: SelecteurDeFichier = (chemin) => isHandWrittenTest(chemin);

/**
 * La dette de PRODUCTION, mesurée le 2026-08-31 sur `dev`.
 *
 * Elle ne se regèle PAS à la hausse : une entrée dont le nombre monte fait
 * rougir la règle 3, et c'est le seul moment où quelqu'un relit ce tableau. Une
 * entrée qui disparaît (fichier découpé, ou repassé sous le seuil) peut être
 * retirée dans le commit qui l'a fait disparaître — mais ne pas la retirer ne
 * rougit rien, par construction des règles 2 et 3.
 */
const DETTE_PRODUCTION: Readonly<Record<string, number>> = {
  'types/api-schemas.ts': 3995,
  'types/socketio-events.ts': 3238,
  'utils/validation.ts': 2697,
  'utils/languages.ts': 1718,
  'types/video-call.ts': 1238,
  'types/voice-api.ts': 1170,
  'utils/river-lanes.ts': 1044,
};

/**
 * La dette des TÉMOINS, mesurée le même jour. Une seule entrée, à UNE ligne
 * au-dessus du seuil — c'est la mesure qui commande de ne pas lui appliquer la
 * règle 3 (§ « Ce que la liste des TÉMOINS ne porte PAS »).
 */
const DETTE_TEMOINS: Readonly<Record<string, number>> = {
  '__tests__/river-lanes.test.ts': 1001,
};

const nombreGele = (dette: Readonly<Record<string, number>>): number => Object.keys(dette).length;

const cumulGele = (dette: Readonly<Record<string, number>>): number =>
  Object.values(dette).reduce((somme, lignes) => somme + lignes, 0);

const horsBudget = (retenir: SelecteurDeFichier) =>
  overBudget(RACINE, MAX_LINES, retenir, descendre);

const balayer = (retenir: SelecteurDeFichier): readonly string[] =>
  walk(RACINE, retenir, descendre);

const lignesBalayees = (fichiers: readonly string[]): number =>
  fichiers.reduce((somme, chemin) => somme + lineCount(chemin), 0);

describe('budget de taille sur packages/shared (#4532)', () => {
  describe('la borne de NON-VACUITÉ — un balayage vide passerait tout au vert', () => {
    it('voit la racine, et y compte des sources de production', () => {
      expect(statSync(RACINE).isDirectory()).toBe(true);
      expect(balayer(estSourceDeProduction).length).toBeGreaterThan(100);
    });

    it('y compte aussi des témoins — le sélecteur par défaut les exclut tous', () => {
      expect(balayer(estTemoin).length).toBeGreaterThan(90);
    });

    it('LIT les lignes des fichiers qu\'il compte — un lineCount muet passerait au vert', () => {
      expect(lignesBalayees(balayer(estSourceDeProduction))).toBeGreaterThan(10000);
      expect(lignesBalayees(balayer(estTemoin))).toBeGreaterThan(10000);
    });
  });

  describe('les sources de PRODUCTION — les trois règles de #4426', () => {
    it('règle 1 — aucune source hors budget qui ne soit déjà dans la dette gelée', () => {
      const nouveaux = horsBudget(estSourceDeProduction)
        .filter((file) => DETTE_PRODUCTION[file.path] === undefined)
        .map((file) => `${file.path} (${file.lines} lignes)`);

      expect(nouveaux).toEqual([]);
    });

    it('règle 2 — la dette gelée ne compte pas plus de fichiers qu\'au gel', () => {
      expect(horsBudget(estSourceDeProduction).length).toBeLessThanOrEqual(
        nombreGele(DETTE_PRODUCTION),
      );
    });

    it('règle 3 — le cumul des lignes hors budget ne remonte pas', () => {
      const liste = horsBudget(estSourceDeProduction);
      const cumul = liste.reduce((somme, file) => somme + file.lines, 0);

      // Le message porte le détail : sans lui, un dépassement de trois lignes
      // n'apprend pas QUEL fichier a grossi, et la première réaction est de
      // regeler le nombre — c'est-à-dire de ne plus lire le cliquet.
      const aGrossi = liste
        .filter((file) => file.lines > (DETTE_PRODUCTION[file.path] ?? 0))
        .map((file) => `${file.path} : ${DETTE_PRODUCTION[file.path] ?? 0} → ${file.lines}`);

      expect({ cumul, aGrossi }).toEqual({ cumul: expect.any(Number), aGrossi: [] });
      expect(cumul).toBeLessThanOrEqual(cumulGele(DETTE_PRODUCTION));
    });
  });

  describe('les TÉMOINS — règles 1 et 2 seulement, la 3 est retenue par #4615', () => {
    it('règle 1 — aucun témoin hors budget qui ne soit déjà dans la dette gelée', () => {
      const nouveaux = horsBudget(estTemoin)
        .filter((file) => DETTE_TEMOINS[file.path] === undefined)
        .map((file) => `${file.path} (${file.lines} lignes)`);

      expect(nouveaux).toEqual([]);
    });

    it('règle 2 — la dette gelée ne compte pas plus de témoins qu\'au gel', () => {
      expect(horsBudget(estTemoin).length).toBeLessThanOrEqual(nombreGele(DETTE_TEMOINS));
    });
  });

  describe('l\'exclusion du code GÉNÉRÉ — explicite, et vérifiée dans les deux sens', () => {
    it('chaque artefact exempté porte la marque de génération dans son EN-TÊTE', () => {
      for (const chemin of ARTEFACTS_GENERES) {
        expect(MARQUE_DE_GENERATION.test(enTete(join(RACINE, chemin)))).toBe(true);
      }
    });

    it('aucun AUTRE fichier retenu ne porte cette marque — sinon l\'exemption est incomplète', () => {
      const marques = balayer(estSourceTypeScript)
        .filter((chemin) => MARQUE_DE_GENERATION.test(enTete(chemin)))
        .map(cheminRelatif)
        .sort();

      expect(marques).toEqual([...ARTEFACTS_GENERES].sort());
    });

    it('api/endpoints.ts est hors du périmètre — et l\'exemption PORTE : il dépasse le seuil', () => {
      const genere = join(RACINE, 'api', 'endpoints.ts');

      expect(lineCount(genere)).toBeGreaterThanOrEqual(MAX_LINES);
      expect(balayer(estSourceDeProduction).map(cheminRelatif)).not.toContain('api/endpoints.ts');
      expect(balayer(estTemoin).map(cheminRelatif)).not.toContain('api/endpoints.ts');
    });
  });

  describe('la structure des deux listes', () => {
    it('elles portent des LIGNES, jamais des numéros de ligne', () => {
      for (const dette of [DETTE_PRODUCTION, DETTE_TEMOINS]) {
        for (const [chemin, lignes] of Object.entries(dette)) {
          expect(chemin.endsWith('.ts')).toBe(true);
          expect(lignes).toBeGreaterThanOrEqual(MAX_LINES);
        }
      }
    });

    /**
     * La PARTITION, vérifiée plutôt que supposée : sans elle une troisième
     * catégorie échapperait aux deux listes sans que rien ne rougisse — c'est
     * exactement le trou que #4531 a fermé côté gateway, où l'exemption des
     * témoins n'était qu'un `!` dans un prédicat.
     *
     * Ici la partition est TERNAIRE, parce que le généré est une population à
     * part entière et non un oubli : production ⊎ témoins ⊎ généré = tout `.ts`
     * non-`.d.ts` de la racine.
     */
    it('production ⊎ témoins ⊎ généré = toutes les sources — rien ne tombe entre les listes', () => {
      const production = balayer(estSourceDeProduction);
      const temoins = balayer(estTemoin);
      const tous = balayer(estSourceTypeScript);

      expect(production.filter(estGenere).map(cheminRelatif)).toEqual([]);
      expect(temoins.filter(estGenere).map(cheminRelatif)).toEqual([]);
      expect(production.filter((chemin) => temoins.includes(chemin)).map(cheminRelatif)).toEqual([]);
      expect(production.length + temoins.length + ARTEFACTS_GENERES.length).toBe(tous.length);
    });
  });
});
