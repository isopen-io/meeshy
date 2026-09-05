/**
 * La liste d'origines CORS a un TÉMOIN D'EFFET côté passerelle (#4480).
 *
 * ## Ce que ce témoin corrige
 *
 * Le lot L-0.5 a ajouté `:3300` aux six listes d'origines de dév, et
 * `scripts/check-makefile-workspaces.mjs` garde la PROVISION de l'oubli. Mais
 * une recherche de sous-chaîne dans un `Makefile` ne prouve pas qu'une origine
 * soit ACCEPTÉE : la règle n'avait aucun témoin d'effet.
 *
 * `unit/cors.test.ts` existe, mais construit sa PROPRE app avec `origin: true` —
 * il atteste les méthodes du préflight, jamais l'allowlist.
 *
 * ## Pourquoi les rangs `production` ET `staging`, jamais `development`
 *
 * En `development` la passerelle court-circuite tout (`origin: true`) : la garde
 * JUSTE et la garde ABSENTE y rendent le même verdict, donc un témoin posé là
 * ne peut pas tomber. Le rang qui DISCRIMINE est celui où l'allowlist décide —
 * et il y en a deux dans le dépôt, `docker-compose.staging.yml` posant lui aussi
 * `NODE_ENV=production` : le témoin balaie les deux plutôt que d'en supposer un.
 *
 * ## Pourquoi les DEUX portes
 *
 * `server.ts` (Fastify CORS) et `MeeshySocketIOManager.ts` (Socket.IO) portaient
 * deux littéraux JUMEAUX de la même règle — avec deux listes par défaut
 * différentes (12 entrées contre 4) et deux détections d'environnement
 * différentes. Une garde posée sur une porte pendant que l'autre reste ouverte
 * n'a rien gardé.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import Fastify from 'fastify';
import cors from '@fastify/cors';

import { CORS_METHODS } from '../../../config/cors-methods';
import {
  CORS_REJECTION_MESSAGE,
  DEFAULT_ALLOWED_ORIGINS,
  everyOriginIsAllowed,
  fastifyCorsOrigin,
  originIsAllowed,
  resolveAllowedOrigins,
  socketIoCorsOrigin,
} from '../../../config/cors-origins';

const SRC = path.resolve(__dirname, '..', '..', '..');

/** Les deux rangs où l'allowlist DÉCIDE — les seuls qui discriminent. */
const RANGS_QUI_DECIDENT = ['production', 'staging'] as const;

const V3 = 'http://localhost:3300';
const LEGACY = 'http://localhost:3100';
const INCONNUE = 'https://evil.example';

const envAvecListe = (nodeEnv: string | undefined, liste: string) => ({
  ...(nodeEnv === undefined ? {} : { NODE_ENV: nodeEnv }),
  CORS_ORIGINS: liste,
});

// ---------------------------------------------------------------------------
// La porte HTTP : une VRAIE app Fastify, avec le VRAI plugin.
// ---------------------------------------------------------------------------

async function porteHttp(env: Readonly<Record<string, string | undefined>>) {
  const app = Fastify({ logger: false });
  await app.register(cors, {
    origin: fastifyCorsOrigin({ env }),
    credentials: true,
    methods: CORS_METHODS,
  });
  app.get('/health', async () => ({ success: true }));
  return app;
}

async function origineServieParHttp(
  env: Readonly<Record<string, string | undefined>>,
  origin: string
): Promise<string | undefined> {
  const app = await porteHttp(env);
  try {
    const res = await app.inject({ method: 'GET', url: '/health', headers: { origin } });
    const servie = res.headers['access-control-allow-origin'];
    return typeof servie === 'string' ? servie : undefined;
  } finally {
    await app.close();
  }
}

// ---------------------------------------------------------------------------
// La porte Socket.IO : le délégué tel qu'`engine.io` l'appelle.
// ---------------------------------------------------------------------------

function verdictSocketIo(
  env: Readonly<Record<string, string | undefined>>,
  origin: string | undefined
): 'ouvert' | 'accepte' | 'refuse' {
  const regle = socketIoCorsOrigin({ env });
  if (regle === true) return 'ouvert';

  let verdict: 'accepte' | 'refuse' | 'muet' = 'muet';
  regle(origin, (err) => {
    verdict = err === null ? 'accepte' : 'refuse';
  });
  if (verdict === 'muet') throw new Error('le délégué Socket.IO n\'a pas rappelé');
  return verdict;
}

describe('la liste d\'origines CORS décide vraiment (#4480)', () => {
  describe.each(RANGS_QUI_DECIDENT)('rang %s — l\'allowlist décide', (nodeEnv) => {
    const env = envAvecListe(nodeEnv, `${LEGACY},${V3}`);

    it('porte HTTP — sert l\'origine :3300 déclarée dans CORS_ORIGINS', async () => {
      await expect(origineServieParHttp(env, V3)).resolves.toBe(V3);
    });

    it('porte HTTP — ne sert AUCUNE origine absente de la liste', async () => {
      await expect(origineServieParHttp(env, INCONNUE)).resolves.toBeUndefined();
    });

    it('porte Socket.IO — accepte :3300 et refuse ce qui n\'est pas déclaré', () => {
      expect(verdictSocketIo(env, V3)).toBe('accepte');
      expect(verdictSocketIo(env, INCONNUE)).toBe('refuse');
    });

    it('les deux portes rendent le MÊME verdict sur la MÊME liste', () => {
      for (const origin of [V3, LEGACY, INCONNUE, 'https://meeshy.me']) {
        expect({ origin, socketIo: verdictSocketIo(env, origin) }).toEqual({
          origin,
          socketIo: originIsAllowed(origin, env) ? 'accepte' : 'refuse',
        });
      }
    });

    it('ALLOWED_ORIGINS sert de repli quand CORS_ORIGINS est ABSENTE', () => {
      const repli = { NODE_ENV: nodeEnv, ALLOWED_ORIGINS: V3 };
      expect(resolveAllowedOrigins(repli)).toEqual([V3]);
      expect(originIsAllowed(V3, repli)).toBe(true);
      expect(originIsAllowed(LEGACY, repli)).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Fail-closed : l'inconnu ne doit JAMAIS ouvrir la porte.
  // -------------------------------------------------------------------------

  describe('fail-closed — l\'inconnu ferme, il n\'ouvre pas', () => {
    it('seul le mot EXACT `development` court-circuite l\'allowlist', () => {
      expect(everyOriginIsAllowed({ NODE_ENV: 'development' })).toBe(true);

      for (const nodeEnv of ['production', 'staging', 'test', 'Development', ' development ', '']) {
        expect({ nodeEnv, ouvert: everyOriginIsAllowed({ NODE_ENV: nodeEnv }) }).toEqual({
          nodeEnv,
          ouvert: false,
        });
      }
    });

    it('NODE_ENV ABSENTE ferme la porte au lieu de l\'ouvrir', () => {
      expect(everyOriginIsAllowed({})).toBe(false);
      expect(fastifyCorsOrigin({ env: {} })).not.toBe(true);
      expect(socketIoCorsOrigin({ env: {} })).not.toBe(true);
      expect(originIsAllowed(INCONNUE, {})).toBe(false);
    });

    it('une liste MALFORMÉE ne retombe pas sur les origines par défaut', () => {
      for (const liste of ['', '   ', ',,,', ' , , ']) {
        const env = envAvecListe('production', liste);
        expect({ liste, allowlist: resolveAllowedOrigins(env) }).toEqual({ liste, allowlist: [] });
        expect({ liste, meeshy: originIsAllowed('https://meeshy.me', env) }).toEqual({
          liste,
          meeshy: false,
        });
      }
    });

    it('les deux portes REFUSENT tout quand la liste déclarée est vide', async () => {
      const env = envAvecListe('production', '');
      await expect(origineServieParHttp(env, 'https://meeshy.me')).resolves.toBeUndefined();
      expect(verdictSocketIo(env, 'https://meeshy.me')).toBe('refuse');
    });

    it('les origines par défaut ne servent QUE la production, jamais localhost', () => {
      const env = { NODE_ENV: 'production' };
      expect(DEFAULT_ALLOWED_ORIGINS).toEqual([
        'https://meeshy.me',
        'https://www.meeshy.me',
        'https://gate.meeshy.me',
        'https://ml.meeshy.me',
      ]);
      expect(resolveAllowedOrigins(env)).toEqual(DEFAULT_ALLOWED_ORIGINS);
      expect(originIsAllowed(LEGACY, env)).toBe(false);
      expect(originIsAllowed(V3, env)).toBe(false);
    });

    it('une requête SANS en-tête Origin reste servie (curl, mobile, serveur)', () => {
      const env = envAvecListe('production', V3);
      expect(originIsAllowed(undefined, env)).toBe(true);
      expect(verdictSocketIo(env, undefined)).toBe('accepte');
    });

    it('le refus porte une Erreur nommée, jamais un silence', () => {
      const regle = socketIoCorsOrigin({ env: envAvecListe('production', V3) });
      expect(regle).not.toBe(true);
      if (regle === true) return;

      const rappels: Array<Error | null> = [];
      regle(INCONNUE, (err) => rappels.push(err));
      expect(rappels).toHaveLength(1);
      expect(rappels[0]).toBeInstanceOf(Error);
      expect(rappels[0]?.message).toBe(CORS_REJECTION_MESSAGE);
    });

    it('l\'origine refusée est SIGNALÉE à l\'appelant qui veut la journaliser', () => {
      const refusees: string[] = [];
      const regle = socketIoCorsOrigin({
        env: envAvecListe('production', V3),
        onRejected: (origin) => refusees.push(origin),
      });
      if (regle === true) throw new Error('la porte ne devrait pas être ouverte');

      regle(INCONNUE, () => undefined);
      regle(V3, () => undefined);
      expect(refusees).toEqual([INCONNUE]);
    });
  });

  // -------------------------------------------------------------------------
  // Une SEULE source de vérité : les deux jumelles ne peuvent plus revenir.
  // -------------------------------------------------------------------------

  describe('une seule source de vérité pour la règle d\'origine', () => {
    const PORTES = [
      path.join(SRC, 'server.ts'),
      path.join(SRC, 'socketio', 'MeeshySocketIOManager.ts'),
    ];

    it.each(PORTES)('%s lit la règle partagée et non plus l\'environnement', (porte) => {
      const source = fs.readFileSync(porte, 'utf8');

      expect({
        porte: path.relative(SRC, porte),
        litCorsOrigins: source.includes('process.env.CORS_ORIGINS'),
        litAllowedOrigins: source.includes('process.env.ALLOWED_ORIGINS'),
        importeLaRegle: source.includes("config/cors-origins"),
      }).toEqual({
        porte: path.relative(SRC, porte),
        litCorsOrigins: false,
        litAllowedOrigins: false,
        importeLaRegle: true,
      });
    });

    /**
     * L'hôte ML est le SEUL membre de `DEFAULT_ALLOWED_ORIGINS` qui n'ait aucune
     * autre affaire dans ces deux fichiers. `meeshy.me` et `www.meeshy.me`
     * vivent aussi dans la directive `frame-ancestors` du CSP, `gate.meeshy.me`
     * dans les serveurs OpenAPI : une garde posée sur eux rougirait sur du
     * juste, et la première réaction serait de la désarmer.
     */
    it.each(PORTES)('%s ne réécrit plus la liste par défaut en dur', (porte) => {
      const source = fs.readFileSync(porte, 'utf8');
      expect({
        porte: path.relative(SRC, porte),
        dupliqueLaListe: source.includes('ml.meeshy.me'),
      }).toEqual({ porte: path.relative(SRC, porte), dupliqueLaListe: false });
    });
  });
});
