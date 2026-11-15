/**
 * Cliquet — aucune config de débit ne peut prétendre compter un COMPTE sans
 * poser le hook qui le rend possible, et le balayage couvre TOUT `src/`.
 *
 * ## Pourquoi ce cliquet existe alors qu'un autre disait la dette soldée
 *
 * `rate-limit-key-reaches-account.test.ts` ÉNUMÈRE les fabriques de
 * `middleware/rate-limiter.ts`. Il disait vrai — de ce fichier. À un
 * caractère de là, `middleware/rate-limit.ts` portait le même défaut intact,
 * sur les neuf routes d'appels, et son doc-comment NOMMAIT les trois
 * fabriques corrigées en affirmant suivre leur patron. Un troisième site
 * (`routes/admin/agent-topics.ts`) portait la même affirmation et le même
 * défaut. **Un balayage qui cherche dans UN fichier mesure ce fichier** ;
 * une liste écrite à la main mesure ce que son auteur connaissait.
 *
 * ## Une garde négative doit d'abord prouver qu'elle balaie
 *
 * Un cliquet qui affirme « aucun site fautif » est VERT quand son balayage ne
 * trouve rien — y compris quand il ne trouve rien parce qu'il est cassé. Le
 * premier `describe` mesure donc le balayage lui-même : combien de fichiers
 * il ouvre, quels sites CONNUS il retrouve, et — la seule preuve qui vaille —
 * qu'il ROUGIT sur une source fabriquée pour être fautive et se TAIT sur la
 * même source corrigée.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { balayerConfigsDeDebit, relever, RACINE_GATEWAY } from './account-keyed-rate-limit-sweep';

const BALAYAGE = balayerConfigsDeDebit();

const cles = (predicat: (poseLeHook: boolean) => boolean): string[] =>
  BALAYAGE.configs.filter((c) => predicat(c.posePreHandler)).map((c) => c.cle).sort();

describe('Le balayage balaie bien ce qu\'il prétend balayer', () => {
  it('ouvre tout le sous-arbre du gateway, pas un répertoire', () => {
    expect(BALAYAGE.fichiersVisites).toBeGreaterThan(400);
  });

  /**
   * Les deux fichiers dont les noms diffèrent d'un caractère : c'est
   * exactement la paire que le cliquet précédent ne voyait qu'à moitié.
   */
  it('trouve des configs dans les DEUX limiteurs de `middleware/`', () => {
    const fichiers = new Set(BALAYAGE.configs.map((c) => c.fichier));
    expect(fichiers.has('middleware/rate-limit.ts')).toBe(true);
    expect(fichiers.has('middleware/rate-limiter.ts')).toBe(true);
  });

  /**
   * Le détecteur doit reconnaître les TROIS écritures du dépôt, sans quoi il
   * mesurerait la popularité d'un idiome au lieu d'une propriété : le hook
   * posé en toutes lettres, ÉPANDU depuis une constante, et posé par une
   * ENVELOPPE qui reçoit le littéral en argument.
   */
  it.each([
    ['middleware/rate-limiter.ts#posts:', 'épandage (...GARDES_DE_CLE)'],
    ['routes/posts/socialRateLimit.ts#social:write:', 'enveloppe (withUserKeyedFailClosed)'],
    ['routes/me/preferences/categories.ts#categories:', 'hook écrit en toutes lettres'],
    ['middleware/rate-limit.ts#calls:', 'clé déléguée à une fonction (resolveCallerKey)'],
  ])('reconnaît %s — %s', (cle) => {
    expect(cles((pose) => pose)).toContain(cle);
  });

  const SOURCE_FAUTIVE = `
    import { FastifyRequest } from 'fastify';
    export const limite = {
      max: 7,
      timeWindow: '1 minute',
      keyGenerator: (request: FastifyRequest) => {
        const authContext = (request as any).authContext;
        return \`neuf:\${authContext?.userId ?? \`ip:\${request.ip}\`}\`;
      },
    };
  `;

  it('ROUGIT sur une config fautive fabriquée — la preuve qu\'il peut tomber', () => {
    const trouve = relever('/x/src/neuf.ts', SOURCE_FAUTIVE, '/x/src');
    expect(trouve).toHaveLength(1);
    expect(trouve[0].compteLAppelant).toBe(true);
    expect(trouve[0].posePreHandler).toBe(false);
  });

  it('se TAIT sur la même config une fois le hook posé', () => {
    const corrigee = SOURCE_FAUTIVE.replace("max: 7,", "max: 7,\n      hook: 'preHandler' as const,");
    expect(relever('/x/src/neuf.ts', corrigee, '/x/src')[0].posePreHandler).toBe(true);
  });

  /**
   * Le limiteur MAISON (`utils/rate-limiter.ts`) est un `preHandler` par
   * construction : il n'a aucun hook à choisir. Le confondre avec le plugin
   * ferait accuser sept sites corrects (`directory/*`, `sync`, `reports`), et
   * un cliquet qui accuse à tort se fait désarmer.
   */
  it('ignore le limiteur maison, qui n\'a pas de hook à choisir', () => {
    const maison = `
      const parAppelant = createCustomRateLimiter({
        max: 30, windowMs: 60000, keyPrefix: 'dir:people:u',
        message: 'Trop de recherches.', keyGenerator: callerRateKey,
      });
    `;
    expect(relever('/x/src/maison.ts', maison, '/x/src')).toHaveLength(0);
    expect(BALAYAGE.configs.some((c) => c.fichier.startsWith('routes/directory/'))).toBe(false);
  });
});

/**
 * Les configs qui comptent l'appelant sans poser le hook pour une raison
 * MESURÉE, et non par oubli. **Il n'y en a plus aucune** depuis #4687.
 *
 * Les deux qui vivaient ici — `registerRateLimiting` (`middleware/rate-limit.ts`,
 * clé `user:`) et `registerMessageRateLimiter` (`middleware/rate-limiter.ts`,
 * clé `msg:`) — étaient des enregistrements de PLUGIN, pas des
 * `config.rateLimit` de route : `hook` y vaut pour TOUTES les routes de
 * l'instance, donc le déplacer déplacerait aussi le comptage des requêtes qui
 * n'atteignent jamais le `preHandler` — un flot non authentifié, précisément
 * ce qu'un limiteur global doit compter.
 *
 * Cette ligne d'exception les tenait pour tolérables parce qu'aucun appelant
 * de production ne les montait. Elle disait en même temps ce qui les rendait
 * COÛTEUSES : leur générateur ANNONÇAIT une clé par compte et rendait
 * l'adresse, ce qui en faisait un patron à copier — la raison exacte pour
 * laquelle les sites fautifs de #4347, #4359 et #4429 se ressemblaient tous.
 * #4687 a tranché ce que « monté nulle part » laissait ouvert : les deux sont
 * SUPPRIMÉS, et le tableau se vide au lieu de s'expliquer.
 *
 * Il reste, plutôt que d'être supprimé : c'est un état à DÉFENDRE, et le
 * second `it.each` ci-dessous rougit si une entrée y revenait sans être
 * RÉELLEMENT fautive.
 */
const ADRESSE_AU_NIVEAU_DU_PLUGIN: ReadonlyArray<readonly [string, string]> = [];

/**
 * Dette HORS TERRITOIRE — SOLDÉE par #4429.
 *
 * `routes/admin/agent-topics.ts` portait le troisième exemplaire du défaut,
 * sur une route VIVANTE (`config: { rateLimit: TEST_ROUTE_RATE_LIMIT }`), et
 * son doc-comment affirmait lui aussi la parité qu'il n'avait pas : « compté
 * par COMPTE, là où l'appelant est enfin connu — même forme que
 * `createPostRouteRateLimitConfig` ». #4429 pose `hook: 'preHandler'`
 * (explicitement — la mesure y a montré que cette route, à la différence des
 * routes d'appels, n'en dépendait pas pour séparer les comptes : sa garde vit
 * déjà en `onRequest`, la même phase que le défaut du plugin), des préfixes
 * `acct:`/`ip:` disjoints, et `skipOnError: false` DÉCLARÉ — ce dernier étant
 * le défaut RÉELLEMENT corrigé : sans lui, la config héritait en silence du
 * `skipOnError: true` du plugin global. Témoin dédié :
 * `agent-topics-test-route-counts-the-account.test.ts`.
 *
 * Ce tableau reste VIDE plutôt que supprimé — un état à DÉFENDRE, pas
 * seulement atteint : le second `it.each` ci-dessous rougirait si une entrée
 * y était ajoutée sans que la config correspondante soit RÉELLEMENT fautive.
 */
const DETTE_HORS_TERRITOIRE: ReadonlyArray<readonly [string, string]> = [];

const EXCEPTIONS = [...ADRESSE_AU_NIVEAU_DU_PLUGIN, ...DETTE_HORS_TERRITOIRE];

describe('Toute config qui compte l\'appelant pose le hook qui le rend possible', () => {
  it('aucune config de ROUTE ne compte par compte sans hook', () => {
    const attendues = EXCEPTIONS.map(([cle]) => cle).sort();
    expect(cles((pose) => pose === false)).toEqual(attendues);
  });

  /**
   * Le pendant du cliquet : une exception qui a été corrigée doit SORTIR de
   * la liste. Sans ce témoin, une ligne périmée se transformerait en
   * autorisation permanente.
   *
   * Un `it` unique, et non un `it.each` : les deux listes sont VIDES depuis
   * #4687, et `it.each([])` ÉCHOUE au chargement (« called with an empty Array
   * of table data »). Un cliquet dont la seule forme d'écriture interdit
   * l'état qu'il vise à atteindre pousse à regeler une ligne pour rester vert
   * — c'est exactement l'inverse de ce qu'il demande.
   */
  it('aucune exception listée qui ne soit encore fautive', () => {
    const perimees = EXCEPTIONS.filter(
      ([cle]) => BALAYAGE.configs.find((c) => c.cle === cle)?.posePreHandler !== false
    ).map(([cle]) => cle);

    expect(perimees).toEqual([]);
  });
});
