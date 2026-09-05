/**
 * Cliquet — aucune `config.rateLimit` du gateway ne peut se TAIRE.
 *
 * ## Pourquoi ce cliquet alors qu'un autre garde déjà les clés de débit
 *
 * `account-keyed-rate-limit-sweep.test.ts` part du `keyGenerator` : il exige
 * de toute config qui lit l'appelant qu'elle pose le hook rendant cette
 * lecture possible. Il ne peut pas voir la faute inverse — **une config qui
 * ne déclare rien**. Un littéral nu n'a ni `keyGenerator` (invisible à ce
 * balayage) ni nom (invisible à toute énumération de fabriques) :
 *
 * | route | littéral |
 * |---|---|
 * | `routes/invitations.ts` | `{ max: 10, timeWindow: '1 hour' }` |
 * | `routes/auth/revoke-all-sessions.ts` | `{ max: 5, timeWindow: '1 minute' }` |
 *
 * Deux sur cinquante, et gardés par rien. `mergeParams` étant un
 * `Object.assign` (`@fastify/rate-limit/index.js:190`), tous deux prenaient la
 * clé des paramètres GLOBAUX — `global:${request.ip}` — donc comptaient par
 * ADRESSE. Le premier voulait manifestement compter un COMPTE ; le second
 * assume l'adresse, mais ne le disait nulle part.
 *
 * ## Ce que ce cliquet exige
 *
 * Une config de route vient d'un NOM (fabrique ou constante partagée, dont le
 * site est relisable et gardé par le balayage voisin), ou elle DÉCLARE `hook`,
 * `keyGenerator` et `skipOnError` sur place. `rateLimit: false` est une
 * quatrième forme, explicite : la route désactive le limiteur du plugin parce
 * qu'elle en monte un autre.
 *
 * ## La troisième propriété, et pourquoi son omission se voyait le moins (#4687)
 *
 * `hook` dit QUAND la config compte, `keyGenerator` CE QU'elle compte,
 * `skipOnError` ce qu'elle fait quand le COMPTEUR TOMBE. Trois configs
 * déclaraient les deux premières et taisaient la troisième — leurs auteurs
 * avaient lu #4347 et pensé à la clé, pas au sens de l'échec :
 *
 * | site | `hook` | `keyGenerator` | `skipOnError` |
 * |---|---|---|---|
 * | `routes/me/preferences/categories.ts` | oui | oui | **absent** |
 * | `routes/me/consents.ts` | oui | oui | **absent** |
 * | `routes/me/preferences/preference-rate-limit.ts` | oui | oui | **absent** |
 *
 * Le piège est que le DÉFAUT DU PLUGIN vaut `false` (@fastify/rate-limit
 * `index.js:138`) : qui va vérifier « et si je ne déclare rien ? » dans la
 * dépendance lit *fail-closed* et conclut que l'omission est prudente. Elle ne
 * l'est pas, parce que la valeur héritée n'est pas celle du plugin mais celle
 * de l'ENREGISTREMENT du dépôt — `registerGlobalRateLimiter` pose
 * `skipOnError: true`. Une panne du magasin de compteurs y effaçait le
 * plafond, entièrement : `onRoute` (`index.js:174`) monte le limiteur de la
 * route À LA PLACE du global, jamais en plus.
 *
 * Le dépôt avait pourtant tranché deux fois que le côté prudent est celui
 * qu'on obtient sans rien dire — `GARDES_DE_CLE = { hook, skipOnError: false }`
 * et le paramètre `sensDeLEchec` de `createRateLimitConfig`, défaut `'ferme'`.
 * Ce cliquet n'impose AUCUNE des deux valeurs : il refuse le silence.
 *
 * ## Une garde négative doit d'abord prouver qu'elle balaie
 *
 * Un cliquet qui affirme « aucun site fautif » est VERT quand son balayage ne
 * trouve rien — y compris parce qu'il est cassé. Le premier `describe` mesure
 * donc le balayage lui-même : combien de fichiers il ouvre, combien
 * d'occurrences il compte, quels sites CONNUS il retrouve, et — la seule
 * preuve qui vaille — qu'il ROUGIT sur une source fabriquée pour être fautive
 * et se TAIT sur la même source corrigée.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  balayerConfigsDeRoute,
  releverSourceIsolee,
  RACINE_GATEWAY,
} from './rate-limit-key-route-config-sweep';

const BALAYAGE = balayerConfigsDeRoute();

const fautives = (): string[] =>
  BALAYAGE.configs.filter((c) => c.conforme === false).map((c) => c.cle).sort();

describe('Le balayage balaie bien ce qu\'il prétend balayer', () => {
  it('ouvre tout le sous-arbre du gateway, pas un répertoire', () => {
    expect(BALAYAGE.fichiersVisites).toBeGreaterThan(400);
  });

  /**
   * La BORNE DE NON-VACUITÉ. `grep -rn 'rateLimit:' src --include=*.ts`
   * (témoins exclus) rendait 50 occurrences le 2026-09-01. Un balayage qui en
   * compterait soudain trois n'accuserait personne — et resterait vert.
   */
  it('compte au moins les cinquante `rateLimit:` de production', () => {
    expect(BALAYAGE.occurrences).toBeGreaterThanOrEqual(50);
    expect(BALAYAGE.configs.length).toBe(BALAYAGE.occurrences);
  });

  /**
   * Les trois FORMES du dépôt, chacune par un site réel. Un détecteur qui
   * n'en reconnaîtrait qu'une mesurerait la popularité d'une écriture, pas
   * une propriété.
   */
  it.each([
    ['routes/posts/sounds.ts', 'nommee', 'appel de fabrique'],
    ['routes/admin/agent-topics.ts', 'nommee', 'constante partagée'],
    ['routes/account-deletion.ts', 'desactivee', 'rateLimit: false'],
    ['middleware/rate-limit.ts', 'litterale', 'littéral, dans la fabrique elle-même'],
  ])('reconnaît %s en forme %s — %s', (fichier, forme) => {
    expect(BALAYAGE.configs.some((c) => c.fichier === fichier && c.forme === forme)).toBe(true);
  });

  /**
   * Les deux routes de #4685, retrouvées par le balayage sous la forme
   * qu'elles portent APRÈS le lot : l'une par un nom, l'autre par un littéral
   * qui déclare. Le cliquet ne saurait pas dire qu'il les a vues sans ça.
   */
  it.each([
    ['routes/invitations.ts', 'nommee'],
    ['routes/auth/revoke-all-sessions.ts', 'litterale'],
  ])('%s est relevée, en forme %s', (fichier, forme) => {
    const vues = BALAYAGE.configs.filter((c) => c.fichier === fichier);
    expect(vues.map((c) => c.forme)).toEqual([forme]);
    expect(vues[0].conforme).toBe(true);
  });

  /**
   * Les trois sites de #4687, retrouvés par le balayage sous la forme qu'ils
   * portent APRÈS le lot. Ils ne se lisent PAS comme la paire de #4685 :
   * chacun sert plusieurs routes par une même fabrique (2 pour les
   * consentements, 6 pour les catégories, 3 pour les préférences unifiées),
   * et c'est justement pourquoi leur silence coûtait cher — une omission, onze
   * seaux.
   *
   * `preference-rate-limit.ts` n'apparaît pas ici : ce fichier ne contient
   * AUCUN `rateLimit:`. Il n'expose qu'une fabrique, que
   * `routes/me/preferences/unified-routes.ts` consomme — c'est là que le
   * balayage la voit, et c'est le nom qui porte la déclaration jusqu'à elle.
   */
  it.each([
    ['routes/me/consents.ts', 2],
    ['routes/me/preferences/categories.ts', 6],
    ['routes/me/preferences/unified-routes.ts', 3],
  ])('%s : ses %i configs déclarent leur sens d\'échec', (fichier, combien) => {
    const vues = BALAYAGE.configs.filter((c) => c.fichier === fichier);
    expect(vues).toHaveLength(combien);
    expect(vues.every((c) => c.forme === 'nommee')).toBe(true);
    expect(vues.filter((c) => c.declareSkipOnError === false)).toEqual([]);
    expect(vues.filter((c) => c.conforme === false)).toEqual([]);
  });

  const LITTERAL_NU = `
    export async function routesNeuves(fastify: FastifyInstance) {
      fastify.post('/geste', {
        config: { rateLimit: { max: 10, timeWindow: '1 hour' } },
      }, async () => ({ ok: true }));
    }
  `;

  it('ROUGIT sur un littéral nu fabriqué — la preuve qu\'il peut tomber', () => {
    const trouve = releverSourceIsolee(LITTERAL_NU);
    expect(trouve).toHaveLength(1);
    expect(trouve[0].forme).toBe('litterale');
    expect(trouve[0].conforme).toBe(false);
    expect(trouve[0].cle).toBe('isolee.ts#{max,timeWindow}');
  });

  /** Les trois déclarations exigées, chacune isolable pour les témoins d'aveu partiel. */
  const TROIS_DECLARATIONS: ReadonlyArray<readonly [string, string]> = [
    ['hook', "hook: 'preHandler' as const"],
    ['keyGenerator', 'keyGenerator: (r) => r.ip'],
    ['skipOnError', 'skipOnError: false'],
  ];

  const litteralPortant = (declarations: readonly string[]): string =>
    LITTERAL_NU.replace("timeWindow: '1 hour'", ["timeWindow: '1 hour'", ...declarations].join(', '));

  it('se TAIT sur le même littéral une fois les trois déclarations écrites', () => {
    const corrige = litteralPortant(TROIS_DECLARATIONS.map(([, texte]) => texte));
    const trouve = releverSourceIsolee(corrige);
    expect(trouve[0].conforme).toBe(true);
    expect([
      trouve[0].declareHook,
      trouve[0].declareKeyGenerator,
      trouve[0].declareSkipOnError,
    ]).toEqual([true, true, true]);
  });

  /**
   * L'aveu partiel ne suffit pas : les trois propriétés répondent à trois
   * questions distinctes — QUAND la config compte, CE QU'elle compte, et ce
   * qu'elle fait quand le COMPTEUR TOMBE. Une clé posée au mauvais hook lit un
   * `authContext` qui n'existe pas encore (#4347) ; un hook posé sans clé
   * compte toujours l'adresse du global ; et les deux posées sans
   * `skipOnError` héritent d'un fail-open que personne n'a choisi (#4687).
   *
   * Le témoin retire UNE déclaration sur trois, jamais deux : c'est la forme
   * réelle du défaut de #4687, et celle qu'un cliquet qui n'exigerait que deux
   * propriétés sur trois laisserait passer en restant vert.
   */
  it.each(TROIS_DECLARATIONS)(
    'ROUGIT encore quand seul %s manque des trois',
    (manquante) => {
      const sansUne = litteralPortant(
        TROIS_DECLARATIONS.filter(([nom]) => nom !== manquante).map(([, texte]) => texte)
      );
      expect(releverSourceIsolee(sansUne)[0].conforme).toBe(false);
    }
  );

  /**
   * Le détecteur lit du PROGRAMME, jamais un commentaire — sans quoi le mode
   * d'échec le plus probable de ce cliquet serait de se laisser convaincre par
   * la prose. Les trois sites de #4687 portent tous un long doc-comment sur le
   * débit, et celui de `middleware/rate-limit.ts` écrit `skipOnError` neuf fois
   * en commentaire : un détecteur naïf y verrait des configs conformes.
   */
  it("ne prend pas un `skipOnError` de COMMENTAIRE pour une déclaration", () => {
    const bavard = litteralPortant([
      "hook: 'preHandler' as const",
      'keyGenerator: (r) => r.ip',
    ]).replace(
      'export async function routesNeuves',
      '/* on hérite du skipOnError: true global, et c\'est voulu */\nexport async function routesNeuves'
    );
    const trouve = releverSourceIsolee(bavard);
    expect(trouve[0].declareSkipOnError).toBe(false);
    expect(trouve[0].conforme).toBe(false);
  });

  /**
   * La résolution d'un nom lit un texte plus large que la config : bornée
   * trop loin, elle absoudrait un littéral nu grâce à la fabrique correcte
   * écrite JUSTE EN DESSOUS. C'est le mode d'échec qui rend un cliquet
   * décoratif sans jamais le faire rougir.
   */
  it('ne déborde pas sur la déclaration voisine', () => {
    const voisinage = `
      export const CONFIG_NUE = { max: 3, timeWindow: '1 minute' };
      export const CONFIG_JUSTE = {
        max: 3,
        timeWindow: '1 minute',
        hook: 'preHandler' as const,
        skipOnError: false,
        keyGenerator: (r) => r.ip,
      };
      export async function routes(fastify: FastifyInstance) {
        fastify.post('/a', { config: { rateLimit: CONFIG_NUE } }, async () => ({}));
        fastify.post('/b', { config: { rateLimit: CONFIG_JUSTE } }, async () => ({}));
      }
    `;
    const trouves = releverSourceIsolee(voisinage);
    expect(trouves.map((c) => [c.expression, c.conforme])).toEqual([
      ['CONFIG_NUE', false],
      ['CONFIG_JUSTE', true],
    ]);
  });

  /**
   * Une ENVELOPPE porte le hook sans porter la clé, et l'appel qu'elle
   * enveloppe porte la clé sans porter le hook : c'est l'écriture réelle de
   * `routes/posts/interactions.ts`. Un détecteur qui ne suivrait que le
   * callee accuserait à tort — et un cliquet qui accuse à tort se fait
   * désarmer.
   */
  it('suit une enveloppe ET son argument', () => {
    const enveloppe = `
      export function durcir(config: object): object {
        return { ...config, hook: 'preHandler' as const, skipOnError: false };
      }
      export function cleParCompte(): object {
        return { max: 30, timeWindow: '1 minute', keyGenerator: (r) => r.ip };
      }
      export async function routes(fastify: FastifyInstance) {
        fastify.post('/a', { config: { rateLimit: durcir(cleParCompte()) } }, async () => ({}));
      }
    `;
    const trouves = releverSourceIsolee(enveloppe);
    expect(trouves).toHaveLength(1);
    expect(trouves[0].declareHook).toBe(true);
    expect(trouves[0].declareKeyGenerator).toBe(true);
    expect(trouves[0].declareSkipOnError).toBe(true);
  });

  /**
   * Le ROUGE par MUTATION, sur du texte de PRODUCTION plutôt que sur un
   * gabarit.
   *
   * Un cliquet qui ne tombe que sur des sources fabriquées pour lui atteste sa
   * propre grammaire, pas le dépôt : il resterait vert si sa résolution de
   * noms cessait d'atteindre les vraies fabriques. La mutation retire donc la
   * déclaration là où elle vit réellement — dans le corps d'une fabrique
   * (consentements, catégories) et dans un littéral de route
   * (`revoke-all-sessions`, le modèle de #4685, conforme AVANT ce lot : la
   * garde mord aussi sur ce qu'elle n'a pas écrit).
   *
   * Elle retire les LIGNES `skipOnError:` du programme et laisse les
   * commentaires intacts — ce qui prouve du même coup que la prose ne suffit
   * pas à absoudre : ces trois fichiers en parlent longuement.
   */
  const SANS_DECLARATION = /^[ \t]*(?:readonly )?skipOnError\s*:.*$/gm;

  it.each([
    ['routes/me/consents.ts', 2],
    ['routes/me/preferences/categories.ts', 6],
    ['routes/auth/revoke-all-sessions.ts', 1],
  ])('%s : retirer `skipOnError` de la source RÉELLE fait tomber ses %i configs', (fichier, combien) => {
    const source = readFileSync(join(RACINE_GATEWAY, fichier), 'utf8');

    const avant = releverSourceIsolee(source);
    expect(avant).toHaveLength(combien);
    expect(avant.filter((c) => c.conforme === false)).toEqual([]);

    const apres = releverSourceIsolee(source.replace(SANS_DECLARATION, ''));
    expect(apres).toHaveLength(combien);
    expect(apres.map((c) => c.declareSkipOnError)).toEqual(avant.map(() => false));
    expect(apres.map((c) => c.conforme)).toEqual(avant.map(() => false));

    // Ce que la mutation NE touche pas : les deux autres propriétés restent
    // déclarées. Sans cette ligne, un détecteur qui aurait perdu la résolution
    // du nom rendrait `false` partout et le témoin passerait pour probant.
    expect(apres.map((c) => [c.declareHook, c.declareKeyGenerator]))
      .toEqual(avant.map(() => [true, true]));
  });

  it("un `rateLimit: false` n'est pas un silence — il est retenu conforme", () => {
    const desactivee = `
      export async function routes(fastify: FastifyInstance) {
        fastify.post('/a', { config: { rateLimit: false } }, async () => ({}));
      }
    `;
    const trouves = releverSourceIsolee(desactivee);
    expect(trouves.map((c) => [c.forme, c.conforme])).toEqual([['desactivee', true]]);
  });
});

/**
 * La dette est VIDE, et ce tableau reste plutôt que d'être supprimé : c'est un
 * état à DÉFENDRE, pas seulement atteint. Le second `it` rougit si une entrée
 * y était ajoutée sans que la config correspondante soit RÉELLEMENT fautive —
 * une ligne périmée deviendrait sinon une autorisation permanente.
 */
const DETTE: ReadonlyArray<readonly [string, string]> = [];

describe('Toute config de débit vient d\'un nom, ou déclare ce qu\'elle fait', () => {
  it('aucune config de route ne se tait', () => {
    expect(fautives()).toEqual(DETTE.map(([cle]) => cle).sort());
  });

  it('la dette ne porte rien de déjà corrigé, ni rien qui ait disparu', () => {
    const perimees = DETTE.filter(
      ([cle]) => BALAYAGE.configs.find((c) => c.cle === cle)?.conforme !== false
    ).map(([cle]) => cle);

    expect(perimees).toEqual([]);
  });
});
