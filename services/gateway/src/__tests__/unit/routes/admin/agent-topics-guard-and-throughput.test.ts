/**
 * `/admin/agent/topics` — la garde, le parcours nominal, le débit, et le motif
 * qui figeait le gateway.
 *
 * ## Ce que ces témoins gardent, et pourquoi ensemble
 *
 * Les six routes ont rendu 403 à TOUT LE MONDE, BIGBOSS compris, pendant toute
 * leur vie : la garde locale lisait `request.user.role`, un champ que
 * `createUnifiedAuthMiddleware` n'écrit JAMAIS (#4156). Personne ne pouvait
 * créer, tester, modifier ni supprimer un sujet de l'agent.
 *
 * Le défaut était vert. Le double d'authentification des suites voisines
 * FABRIQUAIT `role` sur `request.user` — la forme que la production ne pose
 * pas — donc il testait le double, pas la garde.
 *
 * > La question à poser à tout témoin de garde n'est pas « passe-t-il ? » mais
 * > **« son double pose-t-il exactement ce que la production pose ? »**
 *
 * Et réparer la garde ARME un risque qui dormait derrière elle :
 * `POST /topics/:id/test` exécute des expressions régulières d'appelant sur
 * 5 000 caractères. C'est pourquoi les deux moitiés sont gardées dans le même
 * fichier — elles se livrent ensemble ou pas du tout.
 *
 * @jest-environment node
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import Fastify, { FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import jwt from 'jsonwebtoken';
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

jest.mock('../../../../services/CacheStore', () => {
  const store = new Map<string, string>();
  const mockStore = {
    get: jest.fn(async (key: string) => store.get(key) ?? null),
    set: jest.fn(async (key: string, value: string) => { store.set(key, value); }),
    del: jest.fn(async (key: string) => { store.delete(key); }),
    publish: jest.fn(async () => 1),
    isAvailable: jest.fn(() => false),
  };
  return { getCacheStore: () => mockStore, __store: store };
});

jest.mock('../../../../services/AgentHttpClient', () => ({
  AgentHttpClient: jest.fn().mockImplementation(() => ({
    invalidateCache: jest.fn<any>().mockResolvedValue({}),
  })),
}));

import { agentTopicsRoutes } from '../../../../routes/admin/agent-topics';
import { createUnifiedAuthMiddleware } from '../../../../middleware/auth';

const JWT_SECRET = 'agent-topics-witness-secret';
const TOPIC_ID = '507f1f77bcf86cd799439099';
const BIGBOSS_ID = '507f1f77bcf86cd799439011';
const OTHER_ADMIN_ID = '507f1f77bcf86cd799439012';

const CATASTROPHIC_PATTERN = '(a+)+$';

const validTopicBody = {
  slug: 'cinema',
  label: 'Cinéma',
  keywordPatterns: ['\\bfilm\\b'],
  instructionTemplate: 'Lance une discussion sur le cinéma récent.',
  searchHintTemplate: 'actualité cinéma',
};

const storedTopic: any = {
  id: TOPIC_ID,
  ...validTopicBody,
  description: null,
  examples: [],
  cooldownMinutes: 60,
  isActive: true,
};

function makePrisma(topicOverrides: Record<string, unknown> = {}): any {
  const topic = { ...storedTopic, ...topicOverrides };
  return {
    agentTopicCatalog: {
      findMany: jest.fn<any>().mockResolvedValue([topic]),
      findUnique: jest.fn<any>().mockResolvedValue(topic),
      create: jest.fn<any>().mockResolvedValue(topic),
      update: jest.fn<any>().mockResolvedValue(topic),
      delete: jest.fn<any>().mockResolvedValue(topic),
    },
  };
}

/**
 * Le double d'authentification, calqué sur `middleware/auth.ts:527-534`.
 *
 * `request.user` porte EXACTEMENT `userId`, `username`, `isAnonymous` — le rôle
 * vit dans `authContext.registeredUser`, et nulle part ailleurs. Le témoin
 * « la production ne pose pas `role` » plus bas exerce le VRAI middleware pour
 * que ce double ne puisse pas dériver en silence.
 */
function productionShapedAuth(user: { id: string; role: string }) {
  return async (request: any) => {
    request.user = { userId: user.id, username: 'admin', isAnonymous: false };
    request.authContext = {
      isAuthenticated: true,
      type: 'user',
      isAnonymous: false,
      userId: user.id,
      registeredUser: { id: user.id, role: user.role },
    };
  };
}

async function buildApp(options: {
  prisma?: any;
  authenticate?: (request: any) => Promise<void>;
  withRateLimit?: boolean;
} = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate('prisma', options.prisma ?? makePrisma());
  app.decorate(
    'authenticate',
    options.authenticate ?? productionShapedAuth({ id: BIGBOSS_ID, role: 'BIGBOSS' }),
  );
  if (options.withRateLimit) {
    await app.register(rateLimit, { global: false });
  }
  await app.register(agentTopicsRoutes);
  await app.ready();
  return app;
}

describe('/admin/agent/topics — la garde lit la matrice, jamais request.user.role', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => { await app?.close(); app = undefined; });

  it('la PRODUCTION ne pose jamais `role` sur request.user', async () => {
    // LE témoin qui empêche la classe entière de revenir. Il n'interroge aucun
    // double : il fait tourner `createUnifiedAuthMiddleware` sur une vraie
    // requête Fastify et lit ce qui en sort. Toute garde qui lira
    // `request.user.role` testera donc `undefined`, et refusera tout le monde.
    process.env.JWT_SECRET = JWT_SECRET;
    const prisma: any = {
      user: {
        findUnique: jest.fn<any>().mockResolvedValue({
          id: BIGBOSS_ID,
          username: 'bigboss',
          email: 'bigboss@test.com',
          firstName: null, lastName: null, displayName: 'Big Boss',
          bio: null, avatar: null, banner: null, phoneNumber: null,
          role: 'BIGBOSS',
          isActive: true,
          systemLanguage: 'fr', regionalLanguage: 'en', customDestinationLanguage: null,
          isOnline: true, lastActiveAt: new Date(),
          emailVerifiedAt: null, createdAt: new Date(), updatedAt: new Date(),
          deviceLocale: null, profileCompletionRate: null,
        }),
      },
      userSession: { findFirst: jest.fn<any>().mockResolvedValue(null), update: jest.fn<any>() },
      participant: { findFirst: jest.fn<any>().mockResolvedValue(null) },
    };

    let observed: Record<string, unknown> = {};
    const probe = Fastify({ logger: false });
    probe.get('/probe', { onRequest: [createUnifiedAuthMiddleware(prisma as never)] }, async (request, reply) => {
      observed = { ...((request as any).user as Record<string, unknown>) };
      return reply.send({ ok: true });
    });
    await probe.ready();

    const token = jwt.sign({ userId: BIGBOSS_ID }, JWT_SECRET, { expiresIn: '1h' });
    const res = await probe.inject({ method: 'GET', url: '/probe', headers: { authorization: `Bearer ${token}` } });
    await probe.close();

    expect(res.statusCode).toBe(200);
    expect(Object.keys(observed).sort()).toEqual(['isAnonymous', 'userId', 'username']);
    expect('role' in observed).toBe(false);
  });

  it('un BIGBOSS entre', async () => {
    app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/topics' });
    expect(res.statusCode).toBe(200);
  });

  it('un USER est refusé, et le refus NOMME la permission manquante', async () => {
    app = await buildApp({ authenticate: productionShapedAuth({ id: OTHER_ADMIN_ID, role: 'USER' }) });
    const res = await app.inject({ method: 'GET', url: '/topics' });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toContain('canManageAgent');
  });

  it('un `role` posé sur request.user n\'ouvre RIEN', async () => {
    // Le témoin adverse de la classe : si la garde revenait à lire
    // `request.user.role`, cet appel passerait à 200. Il vaut 403 parce que la
    // seule source du rôle est `authContext.registeredUser`, où l'acteur est
    // un simple USER.
    app = await buildApp({
      authenticate: async (request: any) => {
        request.user = { userId: OTHER_ADMIN_ID, username: 'imposteur', isAnonymous: false, role: 'BIGBOSS' };
        request.authContext = {
          isAuthenticated: true, type: 'user', isAnonymous: false,
          userId: OTHER_ADMIN_ID,
          registeredUser: { id: OTHER_ADMIN_ID, role: 'USER' },
        };
      },
    });
    const res = await app.inject({ method: 'GET', url: '/topics' });
    expect(res.statusCode).toBe(403);
  });
});

describe('les DEUX gardes homonymes lisent la matrice, et aucune ne lit un rôle', () => {
  // `agent.ts` et `agent-topics.ts` portaient DEUX copies divergentes du même
  // `requireAgentAdmin` : deux fichiers, deux gardes du même nom, une seule
  // morte. Un nom identique fait croire à une loi identique — la divergence ne
  // se lit pas dans « qui appelle quoi » mais dans « qui appelle la MATRICE ».
  //
  // #4284 a depuis découpé `agent.ts` (1977 lignes) en six surfaces
  // (`agent-configs.ts`, `agent-delivery-queue.ts`, `agent-llm.ts`,
  // `agent-observability.ts`, `agent-reset.ts`, `agent-roles.ts`) plus un
  // fichier partagé, `agent-shared.ts`, qui porte désormais le SEUL littéral
  // `requirePermission('canManageAgent')` de cette famille — `agent.ts` n'est
  // plus qu'un orchestrateur et ne contient plus la garde. Lire CE seul
  // fichier ne montrerait donc plus rien. La forme robuste adresse l'UNITÉ —
  // `agent.ts` et tous ses frères `agent-*.ts`, résolus par un GLOB plutôt
  // qu'une liste écrite à la main (doctrine `AppSourceGuard.unit`, #4425) —
  // pour survivre à un prochain découpage sans rougir à tort ni s'aveugler.
  //
  // `agent-topics.ts` matche lexicalement le même glob `agent-*.ts` sans être
  // un fruit de CE découpage (non touché par le commit d6432e03 de #4284) :
  // c'est la SECONDE garde homonyme que ce describe compare, pas un frère de
  // la première. L'exclure de l'unité de `agent.ts` est donc nécessaire —
  // sans elle, une régression dans les six surfaces se cacherait derrière la
  // garde toujours correcte de `agent-topics.ts`, qui ne partage que le
  // préfixe. L'exclusion se dérive de `ROUTES` lui-même (jamais d'une
  // deuxième liste écrite à la main) : un frère qui est LUI-MÊME une autre
  // unité nommée ci-dessous reste dans SA propre unité.
  const ROUTES = ['agent.ts', 'agent-topics.ts'] as const;

  function unite(fichier: (typeof ROUTES)[number]): { readonly fichier: string; readonly contenu: string }[] {
    const dir = join(__dirname, '../../../../routes/admin');
    const base = fichier.replace(/\.ts$/, '');
    const autresUnites = new Set<string>(ROUTES.filter((r) => r !== fichier));
    return readdirSync(dir)
      .filter((nom) => nom === fichier || (nom.startsWith(`${base}-`) && nom.endsWith('.ts')))
      .filter((nom) => !autresUnites.has(nom))
      .sort()
      .map((nom) => ({ fichier: nom, contenu: readFileSync(join(dir, nom), 'utf-8') }));
  }

  const unites = ROUTES.map((fichier) => ({ fichier, sources: unite(fichier) }));

  it('le balayage lit BIEN les deux unités, sans qu\'aucune ne se soit vidée', () => {
    // Une garde NÉGATIVE dont le balayage rend du vide reste verte en perdant
    // toute sa protection. Ce témoin-ci garde la garde — et la BORNE porte
    // maintenant sur le NOMBRE de fichiers résolus par le glob : `agent.ts`
    // s'est découpé en six surfaces + `agent-shared.ts` (7 frères, 8 avec
    // lui-même) ; `agent-topics.ts` reste seul. Des bornes BASSES, jamais une
    // égalité — un futur découpage qui AJOUTE un frère doit rester vert, seul
    // un glob qui s'est vidé ou dé-câblé doit rougir.
    expect(unites).toHaveLength(2);
    const parFichier = Object.fromEntries(unites.map((u) => [u.fichier, u.sources.length] as const));
    expect(parFichier['agent.ts']).toBeGreaterThanOrEqual(8);
    expect(parFichier['agent-topics.ts']).toBeGreaterThanOrEqual(1);
    for (const { sources } of unites) {
      const total = sources.reduce((n, s) => n + s.contenu.length, 0);
      expect(total).toBeGreaterThan(1000);
    }
  });

  it('chacune NOMME la permission qu\'elle exige, quelque part dans son unité', () => {
    for (const { fichier, sources } of unites) {
      const nomme = sources.some((s) => s.contenu.includes("requirePermission('canManageAgent')"));
      expect(`${fichier}: ${nomme}`).toBe(`${fichier}: true`);
    }
  });

  it('aucune ne lit un rôle sur la requête, nulle part dans son unité', () => {
    for (const { fichier, sources } of unites) {
      const litUnRole = sources.some((s) => /user\??\.role/.test(s.contenu));
      expect(`${fichier}: ${litUnRole}`).toBe(`${fichier}: false`);
    }
  });
});

describe('/admin/agent/topics — le parcours nominal, qui n\'avait jamais pu s\'exécuter', () => {
  let app: FastifyInstance | undefined;
  let prisma: any;

  beforeEach(() => { prisma = makePrisma(); });
  afterEach(async () => { await app?.close(); app = undefined; });

  it('un BIGBOSS crée, teste, modifie et supprime un sujet', async () => {
    app = await buildApp({ prisma });

    const created = await app.inject({ method: 'POST', url: '/topics', payload: validTopicBody });
    expect(created.statusCode).toBe(200);
    expect(prisma.agentTopicCatalog.create).toHaveBeenCalled();

    const tested = await app.inject({
      method: 'POST', url: `/topics/${TOPIC_ID}/test`,
      payload: { sampleText: 'un film, puis un autre film' },
    });
    expect(tested.statusCode).toBe(200);
    expect(tested.json().data.matches['\\bfilm\\b']).toBe(2);

    const patched = await app.inject({
      method: 'PATCH', url: `/topics/${TOPIC_ID}`, payload: { label: 'Ciné' },
    });
    expect(patched.statusCode).toBe(200);

    const deleted = await app.inject({ method: 'DELETE', url: `/topics/${TOPIC_ID}?hard=true` });
    expect(deleted.statusCode).toBe(200);
    expect(prisma.agentTopicCatalog.delete).toHaveBeenCalledWith({ where: { id: TOPIC_ID } });
  }, 20000);
});

describe('/admin/agent/topics — le motif qui figeait le gateway', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => { await app?.close(); app = undefined; });

  it('refuse le motif à retour arrière catastrophique à la CRÉATION', async () => {
    const prisma = makePrisma();
    app = await buildApp({ prisma });

    const res = await app.inject({
      method: 'POST', url: '/topics',
      payload: { ...validTopicBody, keywordPatterns: [CATASTROPHIC_PATTERN] },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('NESTED_QUANTIFIER');
    // Rien n'a été écrit : un motif refusé ne doit pas atteindre la base, où il
    // serait ensuite exécuté par `/test` ET par le strategist.
    expect(prisma.agentTopicCatalog.create).not.toHaveBeenCalled();
  }, 20000);

  it('refuse le même motif au PATCH — le chemin le plus facile à oublier', async () => {
    const prisma = makePrisma();
    app = await buildApp({ prisma });

    const res = await app.inject({
      method: 'PATCH', url: `/topics/${TOPIC_ID}`,
      payload: { keywordPatterns: [CATASTROPHIC_PATTERN] },
    });

    expect(res.statusCode).toBe(400);
    expect(prisma.agentTopicCatalog.update).not.toHaveBeenCalled();
  }, 20000);

  it('un motif catastrophique DÉJÀ EN BASE ne fige plus le gateway', async () => {
    // Les motifs stockés datent d'avant la certification : garder la porte sans
    // garder la salle laisserait figer avec un motif écrit hier. La route
    // répond, en NOMMANT le fautif — et le gateway sert toujours ses autres
    // requêtes pendant la mesure, ce que prouve le minuteur.
    const prisma = makePrisma({ keywordPatterns: [CATASTROPHIC_PATTERN] });
    app = await buildApp({ prisma });

    const tick = jest.fn();
    const timer = setTimeout(tick, 25);
    const res = await app.inject({
      method: 'POST', url: `/topics/${TOPIC_ID}/test`,
      payload: { sampleText: `${'a'.repeat(60)}!` },
    });
    clearTimeout(timer);

    expect(res.statusCode).toBe(200);
    expect(res.json().data.matches[CATASTROPHIC_PATTERN]).toBe(-1);
    expect(res.json().data.refused[0].code).toBe('BACKTRACKING_BUDGET');
    expect(tick).toHaveBeenCalled();

    // Et la route suivante répond normalement : la boucle d'événements a
    // survécu au motif.
    const after = await app.inject({ method: 'GET', url: '/topics' });
    expect(after.statusCode).toBe(200);
  }, 20000);
});

describe('/admin/agent/topics/:id/test — le débit, 10 par minute et par utilisateur', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => { await app?.close(); app = undefined; });

  it('laisse passer dix appels, refuse le onzième, et n\'enferme pas le voisin', async () => {
    // Le `keyGenerator` EXPLICITE est ce que ce témoin garde vraiment : sans
    // lui, la config de route hérite du seau global par IP — identique pour
    // tout le monde derrière Traefik — et « 10/min » deviendrait 10/min pour
    // la plateforme entière. Le second acteur le prouve : il passe alors que
    // le premier est déjà bloqué.
    let acteur = { id: BIGBOSS_ID, role: 'BIGBOSS' };
    app = await buildApp({
      withRateLimit: true,
      authenticate: async (request: any) => { await productionShapedAuth(acteur)(request); },
    });

    const appel = () => app!.inject({
      method: 'POST', url: `/topics/${TOPIC_ID}/test`, payload: { sampleText: 'un film' },
    });

    for (let i = 0; i < 10; i += 1) {
      expect((await appel()).statusCode).toBe(200);
    }
    const onzieme = await appel();
    expect(onzieme.statusCode).toBe(429);

    acteur = { id: OTHER_ADMIN_ID, role: 'ADMIN' };
    expect((await appel()).statusCode).toBe(200);
  }, 30000);
});
