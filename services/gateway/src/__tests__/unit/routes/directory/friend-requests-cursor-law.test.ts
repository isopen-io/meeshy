/**
 * `GET /directory/friend-requests` sous la loi partagée du curseur (#4900).
 *
 * ## Pourquoi CETTE adresse, alors que son alias est déjà couvert
 *
 * `friends-cursor-law.test.ts` prouve le départage des ex æquo sur
 * `/friend-requests/received|sent` — les alias DÉPRÉCIÉS, curseurisés par #4175.
 * Leur successeur CANONIQUE, lui, bornait sa page par `{ createdAt: { lt } }`
 * seul : toute demande née dans la même milliseconde que la dernière ligne
 * servie était jetée de la page suivante, et n'apparaissait sur AUCUNE page.
 *
 * L'alias était donc, depuis `5bcbdefee6`, plus correct que la route qui doit
 * lui survivre — une inversion à laquelle un plan de dépréciation ne s'attend
 * jamais. Hériter du témoin de l'alias ne l'aurait pas montré : c'est la ROUTE
 * CANONIQUE qui doit porter sa propre preuve.
 *
 * ## Ce que ces témoins mesurent, et que ceux du cœur ne mesurent pas
 *
 * Ils traversent un vrai Fastify et le SCHÉMA RÉEL de la route.
 * `fast-json-stringify` retire toute clé qu'aucun schéma de réponse ne déclare :
 * un `nextCursor` calculé mais non déclaré est jeté au dernier mètre, et la
 * route a l'air correcte de bout en bout. Lire le handler ne l'aurait pas dit.
 *
 * La table est un TABLEAU VIVANT (`helpers/in-memory-table`) : la clause est
 * APPLIQUÉE et le tri REJOUÉ à chaque lecture, sans quoi un curseur faux
 * passerait aussi bien qu'un curseur juste.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { type FastifyInstance } from 'fastify';

jest.mock('../../../../utils/logger', () => ({ logError: jest.fn() }));
jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() }) },
}));
jest.mock('../../../../utils/rate-limiter.js', () => ({
  createCustomRateLimiter: () => ({ middleware: () => async () => undefined }),
}));

/**
 * La loi de VISIBILITÉ de la présence est doublée — ce n'est pas ce qu'on mesure
 * ici, et `servirParties` la consulte sur chaque ligne servie. Une carte vide
 * masque tout : la ligne SERVIE reste la ligne LUE, ce que le dernier bloc
 * vérifie explicitement.
 */
jest.mock('../../../../services/PresenceVisibilityService', () => ({
  getPresenceVisibilityService: () => ({ resolveForTargets: async () => new Map() }),
}));

import { directoryFriendRequestsRoutes } from '../../../../routes/directory/friend-requests';
import {
  decodePageCursor,
  encodePageCursor,
  type CursorSort,
} from '../../../../utils/cursor-pagination';
import { findManyIn, type TableRow } from '../../../helpers/in-memory-table';

const PREFIXE = '/api/v1/directory';
const MOI = '507f1f77bcf86cd799439011';
const AUTRUI = '507f1f77bcf86cd799439012';

/** L'ordre TOTAL de la liste — relu ici tel que la route doit le déclarer. */
const ORDRE_DEMANDES: CursorSort = [
  { field: 'createdAt', direction: 'desc', kind: 'date' },
  { field: 'id', direction: 'desc', kind: 'string' },
];

const at = (minute: number) => new Date(Date.UTC(2024, 0, 1, 12, minute, 0));

const partie = (id: string) => ({
  id,
  username: 'alice',
  firstName: 'Alice',
  lastName: 'Smith',
  displayName: 'Alice S.',
  avatar: null,
  isOnline: false,
  lastActiveAt: null,
});

const demande = (id: string, minute: number): TableRow => ({
  id,
  senderId: AUTRUI,
  receiverId: MOI,
  status: 'pending',
  message: null,
  createdAt: at(minute),
  sender: partie(AUTRUI),
  receiver: partie(MOI),
});

/**
 * Le double de table N'INTERPRÈTE que les formes qu'une page au curseur produit
 * et JETTE sur toute autre — un filtre qu'il ignorerait passerait le témoin au
 * vert sans être appliqué. Le filtre texte (`contains`) en fait partie : le
 * témoin qui l'exerce ne veut pas des LIGNES mais du `where`, et se lit donc
 * contre une table MUETTE (`repondre`), ce qui est exactement ce qu'il assert.
 */
async function buildApp(
  rows: TableRow[],
  repondre: ((args: unknown) => TableRow[]) | null = null
): Promise<{
  app: FastifyInstance;
  lectures: () => number;
  dernierWhere: () => unknown;
}> {
  let lectures = 0;
  let dernierWhere: unknown = null;
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });

  app.decorate('prisma', {
    friendRequest: {
      findMany: async (args: any) => {
        lectures += 1;
        dernierWhere = args?.where;
        return repondre ? repondre(args) : findManyIn(rows, args);
      },
    },
  } as never);
  app.decorate('notificationService', null);
  app.decorate('socialEvents', null);
  app.decorate('authenticate', async (request: any) => {
    request.user = { userId: MOI };
    request.authContext = {
      isAuthenticated: true,
      type: 'user',
      userId: MOI,
      registeredUser: { id: MOI, role: 'USER' },
    };
  });

  await app.register(directoryFriendRequestsRoutes, { prefix: PREFIXE });
  await app.ready();
  return { app, lectures: () => lectures, dernierWhere: () => dernierWhere };
}

type Charge = {
  data: Array<{ id: string }>;
  pagination: { hasMore: boolean; nextCursor: string | null; limit: number };
};

const lire = async (app: FastifyInstance, query: string): Promise<Charge> => {
  const reponse = await app.inject({ method: 'GET', url: `${PREFIXE}/friend-requests${query}` });
  expect(reponse.statusCode).toBe(200);
  return reponse.json() as Charge;
};

const ids = (charge: Charge) => charge.data.map((d) => d.id);

const avecCurseur = (jeton: string, limite: number) =>
  `?limit=${limite}&cursor=${encodeURIComponent(jeton)}`;

// ─── LE témoin : les ex æquo à la milliseconde ───────────────────────────────

describe('/directory/friend-requests — le SAUT DE LIGNE des ex æquo', () => {
  it('départage les ex æquo à la milliseconde — sans quoi une page en saute une', async () => {
    // Deux demandes nées dans la MÊME milliseconde. Sans `id` en second rang de
    // l'ordre, la borne `{ createdAt: { lt } }` de la page suivante les jette
    // TOUTES LES DEUX — et `dy` n'apparaît alors sur aucune page.
    const rows = [demande('dz', 20), demande('dy', 20), demande('dx', 10)];
    const { app } = await buildApp(rows);

    const page1 = await lire(app, '?limit=1');
    const page2 = await lire(app, avecCurseur(page1.pagination.nextCursor as string, 5));

    expect(ids(page1)).toEqual(['dz']);
    expect(ids(page2)).toEqual(['dy', 'dx']);
    await app.close();
  });

  it('sert chaque ligne UNE fois sur une marche entière qui traverse un ex æquo', async () => {
    const rows = [
      demande('d5', 50),
      demande('t2', 30),
      demande('t1', 30),
      demande('d2', 20),
      demande('d1', 10),
    ];
    const { app } = await buildApp(rows);

    let cursor: string | null = null;
    const vues: string[] = [];
    for (let garde = 0; garde < 10; garde += 1) {
      const page = await lire(app, cursor === null ? '?limit=2' : avecCurseur(cursor, 2));
      vues.push(...ids(page));
      cursor = page.pagination.nextCursor;
      if (cursor === null) break;
    }

    expect(vues).toEqual(['d5', 't2', 't1', 'd2', 'd1']);
    expect(new Set(vues).size).toBe(vues.length);
    await app.close();
  });

  it("ne saute ni ne redouble une ligne quand la liste BOUGE entre deux pages", async () => {
    const rows = [demande('d4', 40), demande('d3', 30), demande('d2', 20), demande('d1', 10)];
    const { app } = await buildApp(rows);

    const page1 = await lire(app, '?limit=2');
    rows.unshift(demande('d5', 50));
    const page2 = await lire(app, avecCurseur(page1.pagination.nextCursor as string, 2));

    const vues = [...ids(page1), ...ids(page2)];
    expect(vues).toEqual(['d4', 'd3', 'd2', 'd1']);
    expect(new Set(vues).size).toBe(vues.length);
    await app.close();
  });
});

// ─── Ce qui PART sur le fil : un jeton OPAQUE, déclaré au schéma ─────────────

describe('/directory/friend-requests — le jeton servi est OPAQUE', () => {
  const troisDemandes = () => [demande('d3', 30), demande('d2', 20), demande('d1', 10)];

  it('sert un `nextCursor` que la loi partagée relit — et que le sérialiseur laisse passer', async () => {
    const { app } = await buildApp(troisDemandes());

    const page = await lire(app, '?limit=2');

    expect(page.pagination.hasMore).toBe(true);
    expect(typeof page.pagination.nextCursor).toBe('string');
    expect(decodePageCursor(page.pagination.nextCursor, ORDRE_DEMANDES)).toEqual({
      createdAt: at(20).toISOString(),
      id: 'd2',
    });
    await app.close();
  });

  it("n'est plus un identifiant LISIBLE — un client ne peut ni le lire ni le fabriquer", async () => {
    const { app } = await buildApp(troisDemandes());

    const page = await lire(app, '?limit=2');

    // La propriété 2 de la loi : « ce n'est pas un identifiant lisible ». Un
    // horodatage ISO en clair se date, se comprend, se fabrique.
    expect(Number.isNaN(new Date(page.pagination.nextCursor as string).getTime())).toBe(true);
    await app.close();
  });

  it('rend `nextCursor: null` sur la page finale — un aller-retour qui ne rapporte rien', async () => {
    const { app } = await buildApp(troisDemandes());

    const page = await lire(app, '?limit=5');

    expect(ids(page)).toEqual(['d3', 'd2', 'd1']);
    expect(page.pagination.hasMore).toBe(false);
    expect(page.pagination.nextCursor).toBeNull();
    await app.close();
  });

  it('relit un jeton frappé par la loi partagée — le même dialecte des deux côtés', async () => {
    const { app } = await buildApp(troisDemandes());

    const jeton = encodePageCursor(ORDRE_DEMANDES, { createdAt: at(30), id: 'd3' });
    const page = await lire(app, avecCurseur(jeton, 5));

    expect(ids(page)).toEqual(['d2', 'd1']);
    await app.close();
  });
});

// ─── La compatibilité des jetons EN VOL ──────────────────────────────────────

describe('/directory/friend-requests — le jeton HISTORIQUE reste servi', () => {
  const troisDemandes = () => [demande('d3', 30), demande('d2', 20), demande('d1', 10)];

  it("reprend sur l'horodatage ISO qu'un client a PERSISTÉ — pas de retour à la page 1", async () => {
    const { app } = await buildApp(troisDemandes());

    const page = await lire(app, avecCurseur(at(30).toISOString(), 5));

    expect(ids(page)).toEqual(['d2', 'd1']);
    await app.close();
  });

  it('rend en échange un jeton TOTAL — la transition ne dure qu’une page', async () => {
    const { app } = await buildApp([
      demande('d4', 40),
      demande('d3', 30),
      demande('d2', 20),
      demande('d1', 10),
    ]);

    const page = await lire(app, avecCurseur(at(40).toISOString(), 2));

    expect(ids(page)).toEqual(['d3', 'd2']);
    expect(decodePageCursor(page.pagination.nextCursor, ORDRE_DEMANDES)).toEqual({
      createdAt: at(20).toISOString(),
      id: 'd2',
    });
    await app.close();
  });

  it('refuse un curseur illisible AVANT la requête — le contrat de #4254 tient', async () => {
    const { app, lectures } = await buildApp(troisDemandes());

    const reponse = await app.inject({
      method: 'GET',
      url: `${PREFIXE}/friend-requests?cursor=hier-soir`,
    });

    expect(reponse.statusCode).toBe(400);
    expect(lectures()).toBe(0);
    await app.close();
  });

  it("refuse un jeton frappé sous un AUTRE ordre — la propriété 3 ne se perd pas", async () => {
    const { app, lectures } = await buildApp(troisDemandes());

    // Le même couple de champs, mais montant : la fenêtre qu'il décrit n'est pas
    // celle de cette route. Le servir sous une clause de reprise que son ordre
    // ne gouverne pas sauterait des lignes en silence.
    const ordreMontant: CursorSort = [
      { field: 'createdAt', direction: 'asc', kind: 'date' },
      { field: 'id', direction: 'asc', kind: 'string' },
    ];
    const jeton = encodePageCursor(ordreMontant, { createdAt: at(30), id: 'd3' });

    const reponse = await app.inject({
      method: 'GET',
      url: `${PREFIXE}/friend-requests${avecCurseur(jeton, 5)}`,
    });

    expect(reponse.statusCode).toBe(400);
    expect(lectures()).toBe(0);
    await app.close();
  });
});

// ─── La clause de reprise est ET-isée, jamais substituée ─────────────────────

describe('/directory/friend-requests — la reprise est ET-isée avec les gardes', () => {
  it("garde l'identité du lecteur ET le filtre texte sous le curseur", async () => {
    const { app, dernierWhere } = await buildApp([], () => []);

    const jeton = encodePageCursor(ORDRE_DEMANDES, { createdAt: at(30), id: 'd3' });
    const reponse = await app.inject({
      method: 'GET',
      url: `${PREFIXE}/friend-requests?direction=received&status=pending&q=ali&limit=5&cursor=${encodeURIComponent(jeton)}`,
    });

    expect(reponse.statusCode).toBe(200);
    const where = JSON.stringify(dernierWhere());
    expect(where).toContain('receiverId');
    expect(where).toContain('pending');
    expect(where).toContain('ali');
    // Une branche PAR clé de tri : la seconde est celle qui départage.
    expect(where).toContain('"id":{"lt":"d3"}');
    await app.close();
  });
});

// ─── Le curseur pagine la collection RENDUE ──────────────────────────────────

describe('/directory/friend-requests — le curseur pagine la collection RENDUE', () => {
  it('ne rend jamais une page vide tant que `hasMore` promet une suite', async () => {
    const rows = Array.from({ length: 5 }, (_, i) => demande(`d${i}`, i * 10));
    const { app } = await buildApp(rows);

    let cursor: string | null = null;
    const tailles: number[] = [];
    for (let garde = 0; garde < 10; garde += 1) {
      const page = await lire(app, cursor === null ? '?limit=2' : avecCurseur(cursor, 2));
      expect(page.data.length).toBeGreaterThan(0);
      tailles.push(page.data.length);
      cursor = page.pagination.nextCursor;
      if (cursor === null) break;
    }

    expect(tailles).toEqual([2, 2, 1]);
    await app.close();
  });

  it("ne lit la base qu'UNE fois par page — la ligne servie est la ligne lue", async () => {
    const rows = Array.from({ length: 3 }, (_, i) => demande(`d${i}`, i * 10));
    const { app, lectures } = await buildApp(rows);

    const page = await lire(app, '?limit=2');

    expect(lectures()).toBe(1);
    expect(page.data.length).toBe(2);
    await app.close();
  });
});
