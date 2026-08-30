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
 * Les DEUX seules configs du dépôt qui comptent l'appelant sans poser le hook
 * pour une raison MESURÉE, et non par oubli.
 *
 * Toutes deux sont des enregistrements de PLUGIN (`fastify.register(rateLimit,
 * …)`), pas des `config.rateLimit` de route : `hook` y vaut pour TOUTES les
 * routes de l'instance, donc le déplacer déplacerait aussi le comptage des
 * requêtes qui n'atteignent jamais le `preHandler` — un flot non authentifié,
 * précisément ce qu'un limiteur global doit compter. C'est le raisonnement
 * qu'écrit déjà `registerGlobalRateLimiter`, le seul des trois qui soit monté.
 *
 * Et les deux ci-dessous ne sont montées NULLE PART (mesuré : aucun appelant
 * de production). Leur générateur ANNONCE pourtant une clé par compte, ce qui
 * en fait un patron à copier — la raison exacte pour laquelle les trois sites
 * fautifs de ce lot se ressemblaient. Ils restent donc NOMMÉS ici plutôt
 * qu'ignorés.
 */
const ADRESSE_AU_NIVEAU_DU_PLUGIN: ReadonlyArray<readonly [string, string]> = [
  ['middleware/rate-limit.ts#user:', 'registerRateLimiting — plugin global, monté nulle part'],
  ['middleware/rate-limiter.ts#msg:', 'registerMessageRateLimiter — plugin global, monté nulle part'],
];

/**
 * Dette HORS TERRITOIRE de ce lot, nommée plutôt qu'ignorée.
 *
 * `routes/admin/agent-topics.ts` porte le troisième exemplaire du défaut, sur
 * une route VIVANTE (`config: { rateLimit: TEST_ROUTE_RATE_LIMIT }`, l. 293) —
 * et son doc-comment affirme lui aussi la parité qu'il n'a pas : « compté par
 * COMPTE, là où l'appelant est enfin connu — même forme que
 * `createPostRouteRateLimitConfig` ». Il n'est pas corrigé ici parce qu'il est
 * hors du territoire de ce lot ; l'inscrire fait rougir le cliquet le jour où
 * quelqu'un le corrige sans retirer sa ligne, ce qui rend le nettoyage
 * VISIBLE au lieu de silencieux.
 */
const DETTE_HORS_TERRITOIRE: ReadonlyArray<readonly [string, string]> = [
  ['routes/admin/agent-topics.ts#agent-topics:test:', 'POST /admin/agent/topics/test — à livrer'],
];

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
   */
  it.each(EXCEPTIONS)('%s est encore fautive — sinon retirer sa ligne (%s)', (cle) => {
    const config = BALAYAGE.configs.find((c) => c.cle === cle);
    expect(config).toBeDefined();
    expect(config?.posePreHandler).toBe(false);
  });
});
