/**
 * La porte S5 du compteur d'acces, et le hook qui l'alimente (#4275).
 *
 * Ce que ces temoins protegent :
 *
 * 1. **Le hook compte le MOTIF de route, pas l'URL appelee.** C'est ce qui
 *    borne la cardinalite : `request.url` porte les identifiants et la chaine
 *    de requete, donc une cle par appelant. Le temoin appelle `/things/42` et
 *    exige de lire `/things/:id` — et exige surtout que `42` n'apparaisse
 *    NULLE PART dans la charge.
 * 2. **Les refus sont comptes aussi.** Un 401 sur une adresse depreciee reste
 *    la preuve qu'un binaire installe l'appelle encore. La question du lot est
 *    « qui appelle ? », jamais « qui reussit ? » — un compteur qui n'observe
 *    que les succes rendrait un zero pour une route que tout le parc appelle
 *    sans jeton valide.
 * 3. **La porte se mesure sur les six roles.** Les deux permissions exigees ne
 *    se distinguent qu'en ANALYST et MODERATOR : un temoin qui n'essaie que
 *    BIGBOSS et USER passerait au vert avec une seule des deux.
 * 4. **La charge porte ses angles morts et son drapeau `instrumented`.** Un
 *    zero servi sans eux a l'autorite d'une mesure sans en avoir la valeur.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';

import { routeUsageAdminRoutes } from '../../../../routes/admin/route-usage';
import { registerRouteUsageHook } from '../../../../plugins/route-usage.plugin';
import {
  RouteUsageCounter,
  setRouteUsageCounterForTests,
  type InstantaneUsage,
} from '../../../../services/route-usage.service';

/** Ce que la ROUTE sert : l'instantane, plus la portee et sa troncature. */
type ChargeServie = InstantaneUsage & {
  readonly scope: string;
  readonly entriesTotal: number;
  readonly entriesTruncated: boolean;
};

const PREFIXE = '/api/v1/admin';
const SURVEILLEE = { method: 'GET', route: '/api/v1/things/:id', issue: 4181 } as const;

let compteur: RouteUsageCounter;
let ouverts: FastifyInstance[] = [];

/**
 * Le harnais monte le hook GLOBAL sur l'instance racine — comme `server.ts` —
 * plus deux routes ordinaires et la route S5. `authenticate` est un stub qui
 * pose l'`authContext` du role demande : c'est l'AUTORISATION qu'on mesure, et
 * elle lit la VRAIE matrice (`permissionsService`), jamais une copie.
 */
async function monter(options: { role?: string | null } = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!options.role) {
      await reply.status(401).send({ success: false, error: 'Authentification requise' });
      return;
    }
    (request as unknown as { authContext: unknown }).authContext = {
      isAuthenticated: true,
      isAnonymous: false,
      userId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
      registeredUser: { id: 'aaaaaaaaaaaaaaaaaaaaaaaa', role: options.role },
    };
  });

  registerRouteUsageHook(app, compteur);

  app.get('/api/v1/things/:id', async () => ({ ok: true }));
  app.post('/api/v1/protegee', { onRequest: [app.authenticate] }, async () => ({ ok: true }));
  await app.register(routeUsageAdminRoutes, { prefix: PREFIXE });

  await app.ready();
  ouverts.push(app);
  return app;
}

async function lire(app: FastifyInstance, query = ''): Promise<ChargeServie> {
  const res = await app.inject({ method: 'GET', url: `${PREFIXE}/route-usage${query}` });
  expect(res.statusCode).toBe(200);
  return res.json().data as ChargeServie;
}

beforeEach(() => {
  compteur = new RouteUsageCounter({ watched: [SURVEILLEE], instanceId: 'gw-test' });
  setRouteUsageCounterForTests(compteur);
});

afterEach(async () => {
  await Promise.all(ouverts.map((app) => app.close()));
  ouverts = [];
  setRouteUsageCounterForTests(null);
});

// ───────────────────────────────────────────────────────────────────────────
// La porte S5
// ───────────────────────────────────────────────────────────────────────────

describe('GET /api/v1/admin/route-usage — la porte S5', () => {
  it('refuse un appelant sans identite', async () => {
    const app = await monter({ role: null });
    const res = await app.inject({ method: 'GET', url: `${PREFIXE}/route-usage` });
    expect([401, 403]).toContain(res.statusCode);
  });

  it.each(['BIGBOSS', 'ADMIN', 'AUDIT'])('laisse passer %s', async (role) => {
    const app = await monter({ role });
    const res = await app.inject({ method: 'GET', url: `${PREFIXE}/route-usage` });
    expect(res.statusCode).toBe(200);
  });

  it.each(['ANALYST', 'MODERATOR', 'USER'])('refuse %s', async (role) => {
    // ANALYST porte `canViewAnalytics` sans `canAccessAdmin`, MODERATOR
    // l'inverse : ces deux roles sont les SEULS qui distinguent l'intersection
    // exigee d'une seule des deux permissions.
    const app = await monter({ role });
    const res = await app.inject({ method: 'GET', url: `${PREFIXE}/route-usage` });
    expect(res.statusCode).toBe(403);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Ce que le hook compte
// ───────────────────────────────────────────────────────────────────────────

describe('Le hook onResponse — ce qu’il compte et ce qu’il refuse de retenir', () => {
  it('compte le MOTIF de route, jamais l’URL appelee', async () => {
    const app = await monter({ role: 'ADMIN' });
    await app.inject({ method: 'GET', url: '/api/v1/things/507f1f77bcf86cd799439011' });

    const vu = await lire(app);
    expect(vu.entries.some((e) => e.route === '/api/v1/things/:id')).toBe(true);
    // L'identifiant appele ne doit apparaitre NULLE PART : c'est lui qui ferait
    // une cle par appelant, et c'est lui qui ferait de ce compteur un journal.
    expect(JSON.stringify(vu)).not.toContain('507f1f77bcf86cd799439011');
  });

  it('ventile par plateforme et par version depuis les en-tetes du client', async () => {
    const app = await monter({ role: 'ADMIN' });
    await app.inject({
      method: 'GET',
      url: '/api/v1/things/1',
      headers: { 'x-meeshy-platform': 'ios', 'x-meeshy-version': '1.4.2' },
    });
    await app.inject({
      method: 'GET',
      url: '/api/v1/things/2',
      headers: { 'x-app-platform': 'android', 'x-app-version': '2.0.1' },
    });

    const vu = await lire(app);
    expect(vu.entries.some((e) => e.platform === 'ios' && e.version === '1.4.2')).toBe(true);
    // `X-App-*` est la porte de version, `X-Meeshy-*` la telemetrie : deux
    // contrats distincts que le compteur lit tous les deux, pour qu'un
    // renommage d'un cote n'eteigne pas la mesure en silence.
    expect(vu.entries.some((e) => e.platform === 'android' && e.version === '2.0.1')).toBe(true);
  });

  it('compte un appel REFUSE comme un appel', async () => {
    // Un 401 sur une adresse depreciee prouve qu'un binaire installe l'appelle
    // encore. Un compteur qui n'observerait que les succes rendrait zero pour
    // une route que tout le parc appelle sans jeton valide — et ce zero
    // autoriserait son retrait.
    const anonyme = await monter({ role: null });
    const res = await anonyme.inject({ method: 'POST', url: '/api/v1/protegee' });
    expect(res.statusCode).toBe(401);

    // `?scope=all` parce que `/protegee` n'est pas une adresse SURVEILLEE : la
    // portee par defaut ne sert que celles-la.
    const admin = await monter({ role: 'ADMIN' });
    const vu = await lire(admin, '?scope=all');
    expect(vu.entries.some((e) => e.method === 'POST' && e.route === '/api/v1/protegee')).toBe(true);
  });

  it('declare le compteur INSTRUMENTE une fois le hook pose', async () => {
    const app = await monter({ role: 'ADMIN' });
    expect((await lire(app)).instrumented).toBe(true);
  });

  it('reconcilie la liste surveillee avec la table de routage REELLE', async () => {
    compteur = new RouteUsageCounter({
      watched: [SURVEILLEE, { method: 'GET', route: '/api/v1/adresse/disparue', issue: 4181 }],
    });
    setRouteUsageCounterForTests(compteur);

    const app = await monter({ role: 'ADMIN' });
    const vu = await lire(app);

    expect(vu.reconciled).toBe(true);
    expect(vu.watched.find((w) => w.route === SURVEILLEE.route)?.matched).toBe(true);
    // Un motif ecrit dans la liste et plus monte rendrait un zero PARFAIT pour
    // une raison qui n'a rien a voir avec les appelants. Il ressort ici comme
    // une alarme, jamais comme une autorisation de retrait.
    expect(vu.watched.find((w) => w.route === '/api/v1/adresse/disparue')?.matched).toBe(false);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Ce que la charge servie doit dire
// ───────────────────────────────────────────────────────────────────────────

describe('La charge servie — un zero qui s’explique', () => {
  it('sert la route surveillee a zero AVANT tout appel', async () => {
    const app = await monter({ role: 'ADMIN' });
    const vu = await lire(app);

    const suivie = vu.watched.find((w) => w.route === SURVEILLEE.route);
    expect(suivie?.count).toBe(0);
    expect(suivie?.matched).toBe(true);
    // « observee, jamais appelee » — et pas « jamais observee ».
    expect(suivie?.lastSeenAt).toBeNull();
  });

  it('porte ses angles morts dans la meme charge que ses chiffres', async () => {
    const app = await monter({ role: 'ADMIN' });
    const vu = await lire(app);
    expect(vu.blindSpots.join(' ')).toContain('web-et-android-ne-posent-aucun-en-tete-de-version');
    expect(vu.blindSpots.join(' ')).toContain('cache-navigateur-et-service-worker');
  });

  it('dit sur quelle instance et depuis quand il observe', async () => {
    const app = await monter({ role: 'ADMIN' });
    const vu = await lire(app);
    expect(vu.instanceId).toBe('gw-test');
    expect(typeof vu.observedForMs).toBe('number');
  });


  it('ne sert PAS la table entiere par defaut', async () => {
    // Mesure sur une instance saturee : 118 666 entrees, 16 Mo de JSON, 154 ms
    // de composition. Une lecture d'administration qui coute cela est un bug au
    // sens de ce depot. Le defaut sert ce qui DECIDE d'un retrait — les adresses
    // surveillees — et rien d'autre.
    const app = await monter({ role: 'ADMIN' });
    for (let i = 0; i < 300; i++) {
      compteur.record({ method: 'GET', routePattern: `/api/v1/bruit${i}` });
    }
    await app.inject({ method: 'GET', url: '/api/v1/things/1' });

    const vu = await lire(app);
    expect(vu.scope).toBe('watched');
    expect(vu.entries.every((e) => e.route === SURVEILLEE.route)).toBe(true);
  });

  it('sert la table entiere sur `?scope=all`, PLAFONNEE et en le DISANT', async () => {
    const app = await monter({ role: 'ADMIN' });
    for (let i = 0; i < 300; i++) {
      compteur.record({ method: 'GET', routePattern: `/api/v1/bruit${i}` });
    }

    const vu = await lire(app, '?scope=all&limit=25');
    expect(vu.scope).toBe('all');
    expect(vu.entries).toHaveLength(25);
    // Une liste coupee EN SILENCE serait un faux zero de plus : celui qui lit
    // vingt-cinq lignes doit savoir qu'il y en avait trois cents.
    expect(vu.entriesTruncated).toBe(true);
    expect(vu.entriesTotal).toBeGreaterThan(25);
  });

  it('plafonne `?limit=` a une borne dure, et ignore une valeur absurde', async () => {
    // Le compteur doit pouvoir DEPASSER la borne servie, sinon le temoin
    // atteste un plafond qu'il n'atteint jamais : la premiere version de
    // celui-ci n'enregistrait que 40 routes et restait VERTE sous la mutation
    // « retirer le Math.min ».
    compteur = new RouteUsageCounter({ watched: [SURVEILLEE], maxKeysPerSlice: 20_000 });
    setRouteUsageCounterForTests(compteur);
    const app = await monter({ role: 'ADMIN' });
    for (let i = 0; i < 6_000; i++) {
      compteur.record({ method: 'GET', routePattern: `/api/v1/bruit${i}` });
    }

    // `limit` vient de l'appelant : sans borne, il rouvre exactement le cout
    // que la portee par defaut vient de fermer.
    const enorme = await lire(app, '?scope=all&limit=999999999');
    expect(enorme.entries).toHaveLength(5_000);
    expect(enorme.entriesTruncated).toBe(true);

    // Une valeur absurde retombe sur le defaut, jamais sur une liste vide :
    // servir zero ligne serait, ici encore, un faux zero.
    const absurde = await lire(app, '?scope=all&limit=-3');
    expect(absurde.entries).toHaveLength(500);
  });

  it('force la portee surveillee quand une issue est demandee', async () => {
    const app = await monter({ role: 'ADMIN' });
    for (let i = 0; i < 50; i++) {
      compteur.record({ method: 'GET', routePattern: `/api/v1/bruit${i}` });
    }
    // Demander le lot d'une issue et recevoir la table entiere serait une
    // reponse a une autre question.
    const vu = await lire(app, '?scope=all&issue=4181');
    expect(vu.scope).toBe('watched');
    expect(vu.entries.every((e) => e.route === SURVEILLEE.route)).toBe(true);
  });

  it('restreint la charge a un lot par `?issue=`', async () => {
    compteur = new RouteUsageCounter({
      watched: [SURVEILLEE, { method: 'GET', route: '/api/v1/autre/lot', issue: 4155 }],
    });
    setRouteUsageCounterForTests(compteur);

    const app = await monter({ role: 'ADMIN' });
    await app.inject({ method: 'GET', url: '/api/v1/things/9' });

    const vu = await lire(app, '?issue=4181');
    expect(vu.watched.map((w) => w.route)).toEqual([SURVEILLEE.route]);
    // Le filtre par lot ne sert QUE les adresses de ce lot : la charge complete
    // porte une ligne par adresse montee et par origine, et une console qui
    // repond « peut-on retirer ces vingt-huit routes ? » n'a pas a la charger.
    expect(vu.entries.every((e) => e.route === SURVEILLEE.route)).toBe(true);
  });
});
