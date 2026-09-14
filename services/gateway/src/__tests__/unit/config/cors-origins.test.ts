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
  isCorsRejection,
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

/**
 * Les coques Capacitor de web-v2 sont des origines NOMMÉES du staging
 * (#5815, compagnon gateway #5651).
 *
 * Une WebView Capacitor envoie un en-tête `Origin`, contrairement à une app
 * native — et c'est l'origine VIRTUELLE de la coque, lue dans les sources
 * installées de `@capacitor` (8.5.1), jamais configurée dans ce dépôt :
 *
 *   · iOS      `capacitor://localhost` — `CAPInstanceDescriptor.m:10-11`
 *              (`DefaultScheme = "capacitor"`, `DefaultHostname = "localhost"`)
 *   · Android  `https://localhost`     — `CapConfig.java:38-39` (`hostname =
 *              "localhost"`, `androidScheme = CAPACITOR_HTTPS_SCHEME`),
 *              confirmé par `apps/web-v2/capacitor.config.ts:44`
 *              (`androidScheme: 'https'`)
 *
 * `docker-compose.staging.yml` déclare la liste effective — ce test lit le
 * FICHIER du dépôt et vérifie que `resolveAllowedOrigins` accepte bien les
 * deux origines sur cette liste, sans jamais les faire entrer dans
 * `DEFAULT_ALLOWED_ORIGINS` (la production ne les ouvre pas ici, #5651 reste
 * ouverte pour la livraison de l'APK — § 9 Q3 de la spécification #5815).
 */
describe('les coques Capacitor de la v3.1 sont des origines NOMMÉES du staging (#5815, #5651)', () => {
  const COQUE_IOS = 'capacitor://localhost';
  const COQUE_ANDROID = 'https://localhost';

  const STAGING_COMPOSE = path.resolve(
    SRC,
    '..',
    '..',
    '..',
    'infrastructure',
    'docker',
    'compose',
    'docker-compose.staging.yml'
  );

  /**
   * Lit le compose comme du TEXTE et prend la valeur déclarée pour `cle`
   * (`CORS_ORIGINS` ou `ALLOWED_ORIGINS`) — pas de parseur YAML : la forme
   * est une seule ligne `- <cle>=…`, et un parseur ajouterait une dépendance
   * pour lire une ligne. `${DOMAIN:-meeshy.me}` est la SEULE substitution
   * présente dans ce fichier ; elle est résolue littéralement.
   */
  function origineDeclareesParLeCompose(fichier: string, cle: string): string {
    const source = fs.readFileSync(fichier, 'utf8');
    const ligne = source
      .split('\n')
      .find((l) => l.trim().startsWith(`- ${cle}=`));
    if (ligne === undefined) {
      throw new Error(`${cle} absente de ${path.relative(SRC, fichier)}`);
    }
    return ligne
      .trim()
      .slice(`- ${cle}=`.length)
      .replace(/\$\{DOMAIN:-meeshy\.me\}/g, 'meeshy.me');
  }

  it('le compose de staging DÉCLARE les deux origines de coque, dans CORS_ORIGINS et dans ALLOWED_ORIGINS', () => {
    for (const cle of ['CORS_ORIGINS', 'ALLOWED_ORIGINS']) {
      const declaree = origineDeclareesParLeCompose(STAGING_COMPOSE, cle);
      const liste = resolveAllowedOrigins({ NODE_ENV: 'production', CORS_ORIGINS: declaree });
      expect({ cle, contientIos: liste.includes(COQUE_IOS), contientAndroid: liste.includes(COQUE_ANDROID) }).toEqual(
        { cle, contientIos: true, contientAndroid: true }
      );
    }
  });

  it('porte HTTP — sert exactement l\'origine de chaque coque sur la liste du compose', async () => {
    const declaree = origineDeclareesParLeCompose(STAGING_COMPOSE, 'CORS_ORIGINS');
    const env = { NODE_ENV: 'production', CORS_ORIGINS: declaree };
    await expect(origineServieParHttp(env, COQUE_IOS)).resolves.toBe(COQUE_IOS);
    await expect(origineServieParHttp(env, COQUE_ANDROID)).resolves.toBe(COQUE_ANDROID);
  });

  it('porte Socket.IO — accepte les deux coques sur la même liste', () => {
    const declaree = origineDeclareesParLeCompose(STAGING_COMPOSE, 'CORS_ORIGINS');
    const env = { NODE_ENV: 'production', CORS_ORIGINS: declaree };
    expect(verdictSocketIo(env, COQUE_IOS)).toBe('accepte');
    expect(verdictSocketIo(env, COQUE_ANDROID)).toBe('accepte');
  });

  it('rien de plus n\'entre : une tierce origine, un jumeau http:// et un jumeau de schéma sont refusés', async () => {
    const declaree = origineDeclareesParLeCompose(STAGING_COMPOSE, 'CORS_ORIGINS');
    const env = { NODE_ENV: 'production', CORS_ORIGINS: declaree };

    for (const intruse of ['https://evil.example', 'http://localhost', 'capacitor://evil.example', 'https://localhost:3100']) {
      await expect(origineServieParHttp(env, intruse)).resolves.toBeUndefined();
      expect(verdictSocketIo(env, intruse)).toBe('refuse');
    }
  });

  it('les origines de coque n\'entrent PAS dans les défauts de production', () => {
    expect(DEFAULT_ALLOWED_ORIGINS).not.toContain(COQUE_IOS);
    expect(DEFAULT_ALLOWED_ORIGINS).not.toContain(COQUE_ANDROID);
    expect(originIsAllowed(COQUE_IOS, { NODE_ENV: 'production' })).toBe(false);
    expect(originIsAllowed(COQUE_ANDROID, { NODE_ENV: 'production' })).toBe(false);
  });
});

/**
 * Un refus CORS n'est pas une panne serveur (#6591).
 *
 * Mesuré en production le 2026-09-14 : une origine absente de `CORS_ORIGINS`
 * recevait un prévol (`OPTIONS`) en **500**, journalisé en `[ERROR] Uncaught
 * error in request handler … Not allowed by CORS` — 64 lignes en 25 minutes,
 * toutes depuis des outils locaux visant l'hôte de production, zéro
 * utilisateur réel touché. La cause : `fastifyCorsOrigin` passait une `Error`
 * nue au rappel de `@fastify/cors`, que la porte relaie telle quelle au
 * gestionnaire d'erreurs global (`next(error)` → `setErrorHandler`), qui
 * n'avait aucun moyen de la distinguer d'une panne réelle.
 *
 * `isCorsRejection` est le marqueur qui permet cette distinction ; ce bloc
 * prouve qu'il fonctionne à la fois en ISOLATION (le prédicat pur) et à
 * travers la VRAIE porte HTTP (`@fastify/cors` réel, comme `porteHttp`
 * ci-dessus) — sans reconstruire le gestionnaire d'erreurs de `server.ts` :
 * `server.ts` lui-même est confronté par balayage de source, plus bas, pour
 * prouver que sa branche CORS précède bien la ligne qui journalise en ERROR.
 */
describe('un refus CORS rend un statut propre, jamais 500 ni une ligne ERROR (#6591)', () => {
  const REFUSEE = 'https://evil.example';

  it('isCorsRejection reconnaît UNIQUEMENT les erreurs produites par le refus', () => {
    const regle = fastifyCorsOrigin({ env: envAvecListe('production', V3) });
    if (regle === true) throw new Error('la porte ne devrait pas être ouverte');

    let capturee: Error | null = null;
    regle(REFUSEE, (err) => {
      capturee = err;
    });

    expect(capturee).not.toBeNull();
    expect(isCorsRejection(capturee)).toBe(true);
    expect(isCorsRejection(new Error(CORS_REJECTION_MESSAGE))).toBe(false);
    expect(isCorsRejection(new Error('panne Mongo'))).toBe(false);
    expect(isCorsRejection(null)).toBe(false);
    expect(isCorsRejection(undefined)).toBe(false);
  });

  it('la MÊME reconnaissance vaut côté Socket.IO — la porte partage le marqueur', () => {
    const regle = socketIoCorsOrigin({ env: envAvecListe('production', V3) });
    if (regle === true) throw new Error('la porte ne devrait pas être ouverte');

    let capturee: Error | null = null;
    regle(REFUSEE, (err) => {
      capturee = err;
    });

    expect(isCorsRejection(capturee)).toBe(true);
  });

  it('porte HTTP réelle — un prévol refusé rend un statut NON-5xx, sans access-control-allow-origin', async () => {
    const env = envAvecListe('production', V3);
    const app = Fastify({ logger: false });
    // L'ORDRE compte (#6591) : `@fastify/cors` enregistre lui-même une route
    // `OPTIONS *` PENDANT son enregistrement, et cette route capture le
    // gestionnaire d'erreurs alors actif — un `setErrorHandler` posé APRÈS
    // `register(cors, …)` n'est JAMAIS vu par le prévol qu'elle sert. C'est
    // exactement pourquoi le refus CORS ressortait en 500 par le repli
    // générique de Fastify en production alors que toutes les AUTRES routes
    // (enregistrées après le gestionnaire) répondaient déjà correctement.
    app.setErrorHandler(async (error, _request, reply) => {
      // La même distinction que `server.ts` : un refus CORS répond proprement,
      // jamais par le repli générique qui produirait un 500.
      if (isCorsRejection(error)) {
        return reply.code(403).send({ success: false, error: 'CORS Rejected', code: 'CORS_REJECTED' });
      }
      return reply.code(500).send({ success: false, error: 'Internal Server Error' });
    });
    await app.register(cors, { origin: fastifyCorsOrigin({ env }), credentials: true, methods: CORS_METHODS });
    app.get('/health', async () => ({ success: true }));

    try {
      const res = await app.inject({
        method: 'OPTIONS',
        url: '/health',
        headers: { origin: REFUSEE, 'access-control-request-method': 'GET' },
      });

      expect(res.headers['access-control-allow-origin']).toBeUndefined();
      expect(res.statusCode).toBeLessThan(500);
      expect(res.statusCode).not.toBe(500);
      expect(JSON.parse(res.body)).toMatchObject({ success: false, code: 'CORS_REJECTED' });
    } finally {
      await app.close();
    }
  });

  it('porte HTTP réelle — une origine AUTORISÉE n\'est pas affectée par le gestionnaire CORS', async () => {
    const env = envAvecListe('production', V3);
    const app = Fastify({ logger: false });
    app.setErrorHandler(async (error, _request, reply) => {
      if (isCorsRejection(error)) return reply.code(403).send({ success: false, error: 'CORS Rejected' });
      return reply.code(500).send({ success: false, error: 'Internal Server Error' });
    });
    await app.register(cors, { origin: fastifyCorsOrigin({ env }), credentials: true, methods: CORS_METHODS });
    app.get('/health', async () => ({ success: true }));

    try {
      const res = await app.inject({
        method: 'OPTIONS',
        url: '/health',
        headers: { origin: V3, 'access-control-request-method': 'GET' },
      });

      expect(res.headers['access-control-allow-origin']).toBe(V3);
      expect(res.statusCode).toBeLessThan(300);
    } finally {
      await app.close();
    }
  });

  it('DOCUMENTE le piège d\'ordre : `setErrorHandler` posé APRÈS `register(cors, …)` reste invisible au prévol', async () => {
    // Ce témoin prouve la CAUSE du 500, pas le correctif : il enregistre le
    // gestionnaire dans l'ORDRE FAUTIF (celui que `server.ts` portait avant
    // #6591) pour que personne ne réordonne les deux enregistrements de
    // production sans comprendre pourquoi ça rouvrirait le bug.
    const env = envAvecListe('production', V3);
    const app = Fastify({ logger: false });
    await app.register(cors, { origin: fastifyCorsOrigin({ env }), credentials: true, methods: CORS_METHODS });
    app.setErrorHandler(async (error, _request, reply) => {
      if (isCorsRejection(error)) return reply.code(403).send({ success: false, error: 'CORS Rejected' });
      return reply.code(500).send({ success: false, error: 'Internal Server Error' });
    });
    app.get('/health', async () => ({ success: true }));

    try {
      const res = await app.inject({
        method: 'OPTIONS',
        url: '/health',
        headers: { origin: REFUSEE, 'access-control-request-method': 'GET' },
      });

      // Le repli de FASTIFY LUI-MÊME (pas le nôtre) — la preuve que notre
      // gestionnaire n'a jamais été consulté pour cette route.
      expect(res.statusCode).toBe(500);
      expect(JSON.parse(res.body)).not.toMatchObject({ code: 'CORS_REJECTED' });
    } finally {
      await app.close();
    }
  });
});

/**
 * `server.ts` REND ce que le bloc ci-dessus prouve en isolation — balayé
 * depuis le FICHIER réel, pas recopié (cf. la leçon « un témoin qui ne peut
 * pas tomber n'est pas un témoin » de `services/gateway/CLAUDE.md`).
 */
describe('server.ts branche isCorsRejection AVANT la ligne qui journalise en ERROR (#6591)', () => {
  const SOURCE = fs.readFileSync(path.join(SRC, 'server.ts'), 'utf8');

  it('importe isCorsRejection depuis la règle partagée', () => {
    expect(SOURCE).toContain("from './config/cors-origins'");
    expect(SOURCE).toMatch(/isCorsRejection/);
  });

  it('le setErrorHandler teste isCorsRejection AVANT logger.error(\'Uncaught error', () => {
    const debutHandler = SOURCE.indexOf('setErrorHandler(async (error, request, reply)');
    const testCors = SOURCE.indexOf('isCorsRejection(error)', debutHandler);
    const ligneErreur = SOURCE.indexOf("logger.error('Uncaught error in request handler'", debutHandler);

    expect(debutHandler).toBeGreaterThan(-1);
    expect(testCors).toBeGreaterThan(-1);
    expect(ligneErreur).toBeGreaterThan(-1);
    expect(testCors).toBeLessThan(ligneErreur);
  });

  it('la branche CORS répond sans passer par le repli 500 générique', () => {
    const debutHandler = SOURCE.indexOf('setErrorHandler(async (error, request, reply)');
    const testCors = SOURCE.indexOf('isCorsRejection(error)', debutHandler);
    const finBranche = SOURCE.indexOf('}', SOURCE.indexOf('{', testCors));
    const brancheCors = SOURCE.slice(testCors, finBranche);

    expect(brancheCors).toMatch(/reply\.code\(403\)/);
    expect(brancheCors).not.toMatch(/code\(500\)/);
  });

  /**
   * Le piège d'ordre, confronté au FICHIER réel — pas seulement documenté par
   * le témoin d'isolation ci-dessus. `@fastify/cors` enregistre sa propre
   * route `OPTIONS *` PENDANT `register(cors, …)`, et cette route capture le
   * gestionnaire d'erreurs alors actif : posé APRÈS, `setErrorHandler` n'est
   * JAMAIS vu par un prévol refusé, quelle que soit sa branche interne — c'est
   * la cause RÉELLE du 500 mesuré en production, indépendante de la branche
   * `isCorsRejection` posée plus haut dans ce fichier.
   */
  it('`setErrorHandler` est posé AVANT `register(cors, …)` — sans quoi le prévol ne le voit jamais', () => {
    const poseGestionnaire = SOURCE.indexOf('this.server.setErrorHandler(');
    const enregistreCors = SOURCE.indexOf('this.server.register(cors,');

    expect(poseGestionnaire).toBeGreaterThan(-1);
    expect(enregistreCors).toBeGreaterThan(-1);
    expect(poseGestionnaire).toBeLessThan(enregistreCors);
  });
});
