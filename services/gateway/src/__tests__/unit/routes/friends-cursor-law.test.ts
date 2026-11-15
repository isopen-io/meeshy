/**
 * `GET /friend-requests/received|sent` sous la loi partagée du curseur (#4175).
 *
 * ## Pourquoi CES deux adresses
 *
 * L'issue distingue deux conséquences de l'`offset` et dit laquelle compte :
 * « le `count()` est le coût ; le SAUT DE LIGNE est le bug ». Un saut de ligne
 * n'apparaît que sur une collection qui BOUGE entre deux pages — une liste de
 * demandes d'ami en reçoit pendant qu'on la lit. Curseuriser une liste stable ne
 * démontrerait que la moitié tiède du critère.
 *
 * ## Ce que ces témoins mesurent, et que les témoins directs ne mesurent pas
 *
 * Ils traversent un vrai Fastify et les SCHÉMAS RÉELS. `fast-json-stringify`
 * retire toute clé qu'aucun schéma de réponse ne déclare : un `nextCursor`
 * calculé mais non déclaré est jeté au dernier mètre, et la route a l'air
 * correcte de bout en bout. Doubler `@meeshy/shared/types/api-schemas`
 * désarmerait exactement la couche qu'on mesure ici.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { type FastifyInstance } from 'fastify';

jest.mock('../../../utils/logger', () => ({
  logError: jest.fn(),
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

import { friendRequestRoutes } from '../../../routes/friends';
import { encodePageCursor, type CursorSort } from '../../../utils/cursor-pagination';
import { countIn, findManyIn } from '../../helpers/in-memory-table';

const MOI = '507f1f77bcf86cd799439011';
const AUTRUI = '507f1f77bcf86cd799439012';
const AUTH = { authorization: 'Bearer jeton' };

/** L'ordre TOTAL des deux listes — relu ici tel que la route le déclare. */
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

type Demande = Record<string, unknown>;

const demande = (id: string, minute: number, sens: 'received' | 'sent'): Demande => ({
  id,
  senderId: sens === 'received' ? AUTRUI : MOI,
  receiverId: sens === 'received' ? MOI : AUTRUI,
  status: 'pending',
  message: null,
  createdAt: at(minute),
  sender: partie(AUTRUI),
  receiver: partie(AUTRUI),
});

/**
 * `friendRequest.findMany` porte DEUX questions : la LISTE paginée, et la
 * question d'amitié que pose la garde de présence (`status: 'accepted'`). Le
 * double les distingue par la forme de l'appel — sans quoi la garde de présence
 * lirait les lignes de la liste et le compteur de requêtes mentirait.
 */
async function buildApp(rows: Demande[]): Promise<{
  app: FastifyInstance;
  comptes: () => number;
  lectures: () => number;
}> {
  let comptes = 0;
  let lectures = 0;
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });

  app.decorate('prisma', {
    user: {
      findMany: async () => [],
      findUnique: async () => ({ blockedUserIds: [] }),
    },
    friendRequest: {
      findMany: async (args: any) => {
        if (args?.where?.status === 'accepted') return [];
        lectures += 1;
        return findManyIn(rows, args);
      },
      count: async (args: any) => {
        comptes += 1;
        return countIn(rows, args);
      },
    },
  } as any);
  app.decorate('notificationService', null as any);
  app.decorate('socialEvents', null as any);
  app.decorate('authenticate', async (request: any, reply: any) => {
    if (!request.headers.authorization) {
      await reply.code(401).send({ success: false, error: 'Unauthorized' });
      return;
    }
    request.user = { userId: MOI, username: 'moi', role: 'USER' };
  });

  await app.register(friendRequestRoutes, { prefix: '' });
  await app.ready();
  return { app, comptes: () => comptes, lectures: () => lectures };
}

const lire = async (app: FastifyInstance, chemin: string, query: string) => {
  const reponse = await app.inject({ method: 'GET', url: `${chemin}${query}`, headers: AUTH });
  expect(reponse.statusCode).toBe(200);
  return reponse.json() as { data: Array<{ id: string }>; pagination: Record<string, unknown> };
};

const ids = (charge: { data: Array<{ id: string }> }) => charge.data.map((d) => d.id);

const ADRESSES = [
  ['/friend-requests/received', 'received'],
  ['/friend-requests/sent', 'sent'],
] as const;

// ─── Ce qui PART sur le fil ──────────────────────────────────────────────────

describe.each(ADRESSES)('%s — la pagination au curseur traverse le sérialiseur', (chemin, sens) => {
  const troisDemandes = () => [
    demande('d3', 30, sens),
    demande('d2', 20, sens),
    demande('d1', 10, sens),
  ];

  it('sert `nextCursor` ET `form: keyset`', async () => {
    const { app } = await buildApp(troisDemandes());

    const page = await lire(app, chemin, '?limit=2');

    expect(ids(page)).toEqual(['d3', 'd2']);
    expect(typeof page.pagination.nextCursor).toBe('string');
    expect(page.pagination.hasMore).toBe(true);
    expect(page.pagination.form).toBe('keyset');
    await app.close();
  });

  it('reprend APRÈS le curseur rendu, sans redoubler la ligne d’ancrage', async () => {
    const { app } = await buildApp(troisDemandes());

    const page1 = await lire(app, chemin, '?limit=2');
    const page2 = await lire(
      app,
      chemin,
      `?limit=2&cursor=${encodeURIComponent(page1.pagination.nextCursor as string)}`
    );

    expect(ids(page2)).toEqual(['d1']);
    expect(page2.pagination.hasMore).toBe(false);
    expect(page2.pagination.nextCursor).toBeNull();
    await app.close();
  });

  it('ne sert NI `total` NI `offset` sous un curseur', async () => {
    const { app } = await buildApp(troisDemandes());

    const page = await lire(app, chemin, '?limit=2');

    expect(page.pagination.total).toBeUndefined();
    expect(page.pagination.offset).toBeUndefined();
    await app.close();
  });

  it('relit un jeton frappé par la loi partagée — le même dialecte des deux côtés', async () => {
    const { app } = await buildApp(troisDemandes());

    const jeton = encodePageCursor(ORDRE_DEMANDES, { createdAt: at(30), id: 'd3' });
    const page = await lire(app, chemin, `?limit=5&cursor=${encodeURIComponent(jeton)}`);

    expect(ids(page)).toEqual(['d2', 'd1']);
    await app.close();
  });

  it('sert la première page sur un jeton illisible — le défilement ne se coupe pas', async () => {
    const { app } = await buildApp(troisDemandes());

    const page = await lire(app, chemin, '?limit=2&cursor=pas-un-curseur');

    expect(ids(page)).toEqual(['d3', 'd2']);
    await app.close();
  });
});

// ─── `offset` reste servi, mais `cursor` gagne ───────────────────────────────

describe.each(ADRESSES)('%s — `offset` reste un alias déprécié', (chemin, sens) => {
  const quatreDemandes = () => [
    demande('d4', 40, sens),
    demande('d3', 30, sens),
    demande('d2', 20, sens),
    demande('d1', 10, sens),
  ];

  it('sert encore un rang, avec son total — aucun client publié ne casse', async () => {
    const { app } = await buildApp(quatreDemandes());

    const page = await lire(app, chemin, '?offset=2&limit=2');

    expect(ids(page)).toEqual(['d2', 'd1']);
    expect(page.pagination).toMatchObject({ total: 4, offset: 2, limit: 2, hasMore: false });
    expect(page.pagination.form).toBe('offset');
    await app.close();
  });

  it('laisse le CURSEUR gagner quand les deux arrivent ensemble', async () => {
    const { app } = await buildApp(quatreDemandes());

    const jeton = encodePageCursor(ORDRE_DEMANDES, { createdAt: at(40), id: 'd4' });
    const page = await lire(app, chemin, `?limit=2&offset=3&cursor=${encodeURIComponent(jeton)}`);

    // Sous `offset=3` la fenêtre commencerait à `d1` ; sous le curseur elle
    // reprend après `d4`. C'est l'ancre qui décide.
    expect(ids(page)).toEqual(['d3', 'd2']);
    await app.close();
  });
});

// ─── Le `count()` quitte le chemin nominal ───────────────────────────────────

describe.each(ADRESSES)('%s — le `count()` ne se repaie plus page après page', (chemin, sens) => {
  it('ne compte AUCUNE fois la table sur une marche entière au curseur', async () => {
    const rows = Array.from({ length: 7 }, (_, i) => demande(`d${i}`, i * 10, sens));
    const { app, comptes } = await buildApp(rows);

    let cursor: string | null = null;
    const vues: string[] = [];
    for (let garde = 0; garde < 10; garde += 1) {
      const page: any = await lire(
        app,
        chemin,
        `?limit=3${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`
      );
      vues.push(...ids(page));
      cursor = page.pagination.nextCursor as string | null;
      if (!cursor) break;
    }

    expect(vues).toEqual(['d6', 'd5', 'd4', 'd3', 'd2', 'd1', 'd0']);
    expect(comptes()).toBe(0);
    await app.close();
  });

  it('compte encore sous un rang — le coût reste chez l’alias déprécié', async () => {
    const { app, comptes } = await buildApp([demande('d1', 10, sens)]);

    await lire(app, chemin, '?offset=0&limit=5');

    expect(comptes()).toBe(1);
    await app.close();
  });
});

// ─── LE témoin : le saut de ligne, sur une liste qui BOUGE ───────────────────

describe.each(ADRESSES)('%s — le SAUT DE LIGNE sur une liste qui bouge', (chemin, sens) => {
  const quatreDemandes = () => [
    demande('d4', 40, sens),
    demande('d3', 30, sens),
    demande('d2', 20, sens),
    demande('d1', 10, sens),
  ];

  it("sous OFFSET, une demande arrivée entre deux pages fait SAUTER une ligne", async () => {
    const rows = quatreDemandes();
    const { app } = await buildApp(rows);

    const page1 = await lire(app, chemin, '?offset=0&limit=2');
    rows.unshift(demande('d5', 50, sens));
    const page2 = await lire(app, chemin, '?offset=2&limit=2');

    const vues = [...ids(page1), ...ids(page2)];
    expect(vues).toEqual(['d4', 'd3', 'd3', 'd2']);
    expect(vues).not.toContain('d1');
    await app.close();
  });

  it('sous CURSEUR, la MÊME insertion ne saute ni ne redouble aucune ligne', async () => {
    const rows = quatreDemandes();
    const { app } = await buildApp(rows);

    const page1 = await lire(app, chemin, '?limit=2');
    rows.unshift(demande('d5', 50, sens));
    const page2 = await lire(
      app,
      chemin,
      `?limit=2&cursor=${encodeURIComponent(page1.pagination.nextCursor as string)}`
    );

    const vues = [...ids(page1), ...ids(page2)];
    expect(vues).toEqual(['d4', 'd3', 'd2', 'd1']);
    expect(new Set(vues).size).toBe(vues.length);
    await app.close();
  });

  it("départage les ex æquo à la milliseconde — sans quoi une page en saute une", async () => {
    // Deux demandes nées dans la MÊME milliseconde : sans `id` en second rang de
    // l'ordre, la borne `{ createdAt: { lt } }` de la page suivante les jetterait
    // TOUTES LES DEUX. C'est le défaut que porte encore la route canonique.
    const rows = [
      demande('dz', 20, sens),
      demande('dy', 20, sens),
      demande('dx', 10, sens),
    ];
    const { app } = await buildApp(rows);

    const page1 = await lire(app, chemin, '?limit=1');
    const page2 = await lire(
      app,
      chemin,
      `?limit=5&cursor=${encodeURIComponent(page1.pagination.nextCursor as string)}`
    );

    expect(ids(page1)).toEqual(['dz']);
    expect(ids(page2)).toEqual(['dy', 'dx']);
    await app.close();
  });
});

// ─── La collection paginée est bien la collection RENDUE ─────────────────────

describe.each(ADRESSES)('%s — le curseur pagine la collection RENDUE', (chemin, sens) => {
  it('ne rend jamais une page vide tant que `hasMore` promet une suite', async () => {
    const rows = Array.from({ length: 5 }, (_, i) => demande(`d${i}`, i * 10, sens));
    const { app } = await buildApp(rows);

    let cursor: string | null = null;
    const tailles: number[] = [];
    for (let garde = 0; garde < 10; garde += 1) {
      const page: any = await lire(
        app,
        chemin,
        `?limit=2${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`
      );
      tailles.push(page.data.length);
      cursor = page.pagination.nextCursor as string | null;
      if (!cursor) break;
    }

    // Le cas `/sounds/:soundId/posts` que #4175 nomme : un curseur posé sur une
    // collection INTERMÉDIAIRE rend des pages vides que le client doit
    // compenser à la main (`emptyStreak`). Ici la ligne lue EST la ligne servie.
    expect(tailles).toEqual([2, 2, 1]);
    await app.close();
  });

  it("ne lit la base qu'UNE fois par page — la ligne servie est la ligne lue", async () => {
    const rows = Array.from({ length: 3 }, (_, i) => demande(`d${i}`, i * 10, sens));
    const { app, lectures } = await buildApp(rows);

    await lire(app, chemin, '?limit=2');

    expect(lectures()).toBe(1);
    await app.close();
  });
});
