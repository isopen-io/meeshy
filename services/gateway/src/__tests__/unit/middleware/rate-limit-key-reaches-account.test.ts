/**
 * Une clé de débit « par compte » qui s'évalue AVANT l'authentification est
 * une clé par ADRESSE — et derrière Traefik, une clé unique pour tout le monde.
 *
 * `@fastify/rate-limit` applique `config.rateLimit` au hook `onRequest` par
 * défaut. `onRequest` court AVANT `preValidation`, donc avant que
 * `unifiedAuth` ne pose `authContext` sur la requête : un `keyGenerator` qui
 * lit `request.authContext?.userId` reçoit `undefined` et retombe sur son
 * repli — ici `ip:${request.ip}`. Une limite annoncée « par compte » compte
 * alors par ADRESSE, et se trompe dans les deux sens : plusieurs comptes
 * derrière une même sortie (opérateur mobile, bureau, NAT) se partagent un
 * crédit prévu pour un seul, et un même compte disposant de plusieurs
 * adresses en obtient autant de crédits.
 *
 * Précision qui a coûté une rectification : `trustProxy` EST posé depuis
 * #4137 (`config/trust-proxy.ts`, un maillon par défaut), donc `request.ip`
 * est l'adresse réelle de l'appelant et non celle du conteneur Traefik. Les
 * doc-comments antérieurs à #4137 disent le contraire ; les croire menait à
 * décrire ce repli comme « un seul seau pour la plateforme », ce qu'il n'est
 * plus. Le défaut de HOOK, lui, est mesuré ci-dessous et reste entier.
 *
 * Mesuré sur le vrai plugin, pas déduit : sans `hook`, le `keyGenerator` voit
 * `authContext === undefined` ; avec `hook: 'preHandler'`, il voit le compte.
 *
 * Le second défaut voyage avec le premier : `registerGlobalRateLimiter` pose
 * `skipOnError: true`, une valeur GLOBALE qu'@fastify/rate-limit fusionne par
 * `Object.assign` dans chaque `config.rateLimit` qui ne la redéclare pas. Un
 * Redis indisponible fait donc échouer le limiteur dans le sens OUVERT — la
 * panne du gardien devient l'absence de garde, exactement le motif que #4184
 * vient de fermer sur le limiteur de renvoi.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';
import {
  createContactChangeRateLimitConfig,
  createDirectoryRouteRateLimitConfig,
  createPostRouteRateLimitConfig,
  createSoundRouteRateLimitConfig,
  createSignalProtocolRateLimitConfig,
} from '../../../middleware/rate-limiter';
import { meRouteRateLimitConfig } from '../../../routes/me/get-me';

const COMPTE = 'u-4184';

/** Monte une route avec la config donnée et rend la clé RÉELLEMENT calculée. */
async function cleCalculee(config: Record<string, unknown>): Promise<string> {
  const vues: string[] = [];
  const app = Fastify({ logger: false });
  await app.register(rateLimit, { global: false });

  const espionne = {
    ...config,
    keyGenerator: (request: unknown) => {
      const rendue = (config.keyGenerator as (r: unknown) => string)(request);
      vues.push(rendue);
      return rendue;
    },
  };

  app.post(
    '/geste',
    {
      preValidation: [
        async (request: { authContext?: unknown }) => {
          request.authContext = { userId: COMPTE };
        },
      ],
      config: { rateLimit: espionne },
    },
    async () => ({ ok: true })
  );

  await app.ready();
  await app.inject({ method: 'POST', url: '/geste', payload: {} });
  await app.close();

  return vues[0] ?? '(keyGenerator jamais appelé)';
}

describe("La clé de débit du changement de contact atteint le COMPTE (#4184)", () => {
  it.each(['initiate', 'verify', 'resend'] as const)(
    'la clé de %s porte le userId, jamais une adresse partagée',
    async (type) => {
      const cle = await cleCalculee(
        createContactChangeRateLimitConfig(type) as Record<string, unknown>
      );

      expect(cle).toContain(COMPTE);
      expect(cle).not.toContain('ip:');
    }
  );

  /**
   * Le hook est la CAUSE, la clé est le symptôme. Ce témoin-ci tombe même si
   * quelqu'un « corrige » la clé en la fabriquant autrement (un décodage de
   * jeton à la main, par exemple) : ce qu'on veut garder, c'est que le
   * limiteur s'exécute APRÈS l'authentification.
   */
  it.each(['initiate', 'verify', 'resend'] as const)(
    '%s déclare hook: preHandler — la cause, pas seulement le symptôme',
    (type) => {
      const cfg = createContactChangeRateLimitConfig(type) as Record<string, unknown>;
      expect(cfg.hook).toBe('preHandler');
    }
  );

  /**
   * `skipOnError: true` est posé GLOBALEMENT et fusionné par `Object.assign`
   * dans toute config qui ne le redéclare pas. Sans cette ligne, un Redis
   * indisponible ouvre les trois gestes en grand.
   */
  it.each(['initiate', 'verify', 'resend'] as const)(
    "%s échoue FERMÉ — la panne du gardien n'est pas l'absence de garde",
    (type) => {
      const cfg = createContactChangeRateLimitConfig(type) as Record<string, unknown>;
      expect(cfg.skipOnError).toBe(false);
    }
  );
});

/**
 * La LOI, et ce qui ne la respecte pas encore.
 *
 * Toute fabrique dont le `keyGenerator` lit `authContext` prétend compter par
 * COMPTE. Sans `hook: 'preHandler'`, elle compte par adresse partagée — donc
 * elle ment, et le mensonge est pire qu'une absence de plafond : il rend une
 * limite basse applicable à toute la plateforme.
 *
 * Les fabriques non conformes sont NOMMÉES ci-dessous plutôt qu'ignorées. Le
 * troisième `it` rougit le jour où l'une d'elles est corrigée sans sortir de
 * la liste : le nettoyage devient visible au lieu d'être silencieux. Motif
 * emprunté à `no-silent-query-fallback-guard.test.ts`, même contrainte
 * multi-agents, même solution.
 */
const CONFORMES: ReadonlyArray<readonly [string, Record<string, unknown>]> = [
  ['contact-change:initiate', createContactChangeRateLimitConfig('initiate') as Record<string, unknown>],
  ['contact-change:verify', createContactChangeRateLimitConfig('verify') as Record<string, unknown>],
  ['contact-change:resend', createContactChangeRateLimitConfig('resend') as Record<string, unknown>],
  ['me:read', meRouteRateLimitConfig as unknown as Record<string, unknown>],
  ['directory:search', createDirectoryRouteRateLimitConfig('search') as Record<string, unknown>],
  ['directory:resolve', createDirectoryRouteRateLimitConfig('resolve') as Record<string, unknown>],
  ['posts:create', createPostRouteRateLimitConfig('create') as Record<string, unknown>],
  ['posts:like', createPostRouteRateLimitConfig('like') as Record<string, unknown>],
  ['sounds:upload', createSoundRouteRateLimitConfig('upload') as Record<string, unknown>],
  ['sounds:stream', createSoundRouteRateLimitConfig('stream') as Record<string, unknown>],
  ['signal:keys_get', createSignalProtocolRateLimitConfig('keys_get') as Record<string, unknown>],
  ['signal:keys_post', createSignalProtocolRateLimitConfig('keys_post') as Record<string, unknown>],
  ['signal:session_establish', createSignalProtocolRateLimitConfig('session_establish') as Record<string, unknown>],
];

/**
 * La dette est SOLDÉE (#4347) — la liste reste, vide, et le troisième `it`
 * la garde ainsi : une entrée qu'on y remettrait devrait être fautive pour
 * que le témoin passe. Retirer la liste plutôt que la vider retirerait aussi
 * ce qui empêche la dette de revenir sans qu'on le remarque.
 */
const DETTE: ReadonlyArray<readonly [string, Record<string, unknown>]> = [];

describe('Toute fabrique qui prétend compter par compte le fait vraiment', () => {
  it.each(CONFORMES)('%s : hook preHandler et échec fermé', (_nom, cfg) => {
    expect(cfg.hook).toBe('preHandler');
    expect(cfg.skipOnError).toBe(false);
  });

  it('la liste de dette ne contient rien de déjà corrigé', () => {
    const perimees = DETTE.filter(([, cfg]) => cfg.hook === 'preHandler').map(([nom]) => nom);
    expect(perimees).toEqual([]);
  });
});
