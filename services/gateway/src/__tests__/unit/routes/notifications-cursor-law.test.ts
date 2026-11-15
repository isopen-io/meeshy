/**
 * `GET /notifications` sous la loi partagée du curseur (#4175).
 *
 * ## Pourquoi ces témoins traversent un vrai Fastify
 *
 * `notifications-routes.test.ts` appelle les handlers DIRECTEMENT, ce qui
 * mesure ce que le handler CALCULE. Ici on mesure ce qui PART : `fast-json-stringify`
 * retire toute clé qu'aucun schéma de réponse ne déclare, et une pagination
 * calculée mais non déclarée est sérialisée puis jetée au dernier mètre — la
 * route a l'air correcte de bout en bout et le client ne reçoit rien. Les
 * schémas partagés ne sont donc PAS doublés ici : les doubler désarmerait
 * précisément la couche que ces témoins mesurent.
 *
 * ## Ce que la table VIVANTE prouve, et qu'aucune page figée ne peut prouver
 *
 * Un double qui rend une page toute faite passe aussi bien sous un curseur juste
 * que sous un curseur faux. Et sur une collection FIGÉE, offset et curseur
 * rendent exactement la même chose : la différence — le SAUT DE LIGNE — n'existe
 * que si une ligne arrive ENTRE les deux pages. Le témoin de contraste fait donc
 * deux marches sur la MÊME inbox vivante et montre laquelle perd une ligne.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { type FastifyInstance } from 'fastify';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() }) },
}));

import { notificationRoutes } from '../../../routes/notifications';
import { encodePageCursor, type CursorSort } from '../../../utils/cursor-pagination';
import { countIn, findManyIn } from '../../helpers/in-memory-table';

const USER_ID = 'aabbccddeeff001122334455';

/** L'ordre TOTAL de l'inbox — celui que la route déclare, relu ici tel quel. */
const ORDRE_INBOX: CursorSort = [
  { field: 'createdAt', direction: 'desc', kind: 'date' },
  { field: 'id', direction: 'desc', kind: 'string' },
];

const at = (minute: number) => new Date(Date.UTC(2024, 0, 1, 12, minute, 0));

type Ligne = Record<string, unknown>;

const notification = (id: string, minute: number, extra: Ligne = {}): Ligne => ({
  id,
  userId: USER_ID,
  type: 'new_message',
  priority: 'normal',
  title: null,
  subtitle: null,
  content: `contenu ${id}`,
  actor: null,
  context: {},
  metadata: {},
  isRead: false,
  readAt: null,
  createdAt: at(minute),
  expiresAt: null,
  delivery: { emailSent: false, pushSent: false },
  ...extra,
});

/** Le jeton HISTORIQUE de `utils/keyset-cursor.ts`, tel qu'un client en vol le porte. */
const jetonHistorique = (createdAt: Date, id: string): string =>
  Buffer.from(JSON.stringify({ createdAt: createdAt.toISOString(), id }), 'utf8').toString('base64url');

/** L'inbox est passée par RÉFÉRENCE : `rows.push(...)` entre deux appels est vu. */
async function buildApp(rows: Ligne[]): Promise<{ app: FastifyInstance; comptes: () => number }> {
  let comptes = 0;
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });

  app.decorate('authenticate', async (request: any) => {
    request.user = { userId: USER_ID };
  });
  app.decorate('prisma', {
    notification: {
      findMany: (args: any) => Promise.resolve(findManyIn(rows, args)),
      count: (args: any) => {
        comptes += 1;
        return Promise.resolve(countIn(rows, args));
      },
      groupBy: () => Promise.resolve([]),
      findUnique: () => Promise.resolve(null),
      deleteMany: () => Promise.resolve({ count: 0 }),
    },
  } as any);
  app.decorate('notificationService', {
    getUnreadCount: () => Promise.resolve(rows.length),
  } as any);

  await app.register(notificationRoutes);
  await app.ready();
  return { app, comptes: () => comptes };
}

const lire = async (app: FastifyInstance, query: string) => {
  const reponse = await app.inject({ method: 'GET', url: `/notifications${query}` });
  expect(reponse.statusCode).toBe(200);
  return reponse.json() as { data: Array<{ id: string }>; pagination: Record<string, unknown> };
};

const ids = (charge: { data: Array<{ id: string }> }) => charge.data.map((n) => n.id);

// ─── Ce qui PART sur le fil ──────────────────────────────────────────────────

describe('la pagination au curseur traverse le sérialiseur', () => {
  it('sert `nextCursor` ET `form: keyset` — un `nextCursor` seul ne dit pas ce qu’il est', async () => {
    const { app } = await buildApp([notification('n3', 30), notification('n2', 20), notification('n1', 10)]);

    const page = await lire(app, '?limit=2');

    expect(ids(page)).toEqual(['n3', 'n2']);
    expect(typeof page.pagination.nextCursor).toBe('string');
    expect(page.pagination.hasMore).toBe(true);
    expect(page.pagination.form).toBe('keyset');
    await app.close();
  });

  it("DIT `form: offset` quand la page a été servie par un rang — c'est l'aveu du saut", async () => {
    const { app } = await buildApp([notification('n2', 20), notification('n1', 10)]);

    const page = await lire(app, '?offset=1&limit=1');

    expect(ids(page)).toEqual(['n1']);
    expect(page.pagination.form).toBe('offset');
    expect(page.pagination.total).toBe(2);
    await app.close();
  });

  it('ne sert NI `total` NI `offset` sous un curseur — la question ne se repose pas', async () => {
    const rows = [notification('n3', 30), notification('n2', 20), notification('n1', 10)];
    const { app } = await buildApp(rows);

    const page1 = await lire(app, '?limit=1');
    const page2 = await lire(app, `?limit=1&cursor=${encodeURIComponent(page1.pagination.nextCursor as string)}`);

    expect(page2.pagination.total).toBeUndefined();
    expect(page2.pagination.offset).toBeUndefined();
    await app.close();
  });
});

// ─── Le dialecte de la loi partagée ──────────────────────────────────────────

describe('le curseur est celui de la loi partagée', () => {
  it('relit un jeton frappé par `encodePageCursor` — le même dialecte des deux côtés', async () => {
    const rows = [notification('n3', 30), notification('n2', 20), notification('n1', 10)];
    const { app } = await buildApp(rows);

    const jeton = encodePageCursor(ORDRE_INBOX, { createdAt: at(30), id: 'n3' });
    const page = await lire(app, `?limit=5&cursor=${encodeURIComponent(jeton)}`);

    expect(ids(page)).toEqual(['n2', 'n1']);
    await app.close();
  });

  it("relit le jeton HISTORIQUE d'un client déjà en train de défiler", async () => {
    const rows = [notification('n3', 30), notification('n2', 20), notification('n1', 10)];
    const { app } = await buildApp(rows);

    const page = await lire(app, `?limit=5&cursor=${encodeURIComponent(jetonHistorique(at(30), 'n3'))}`);

    expect(ids(page)).toEqual(['n2', 'n1']);
    await app.close();
  });

  it("ignore un jeton frappé sous un AUTRE ordre plutôt que de reprendre à côté", async () => {
    const rows = [notification('n3', 30), notification('n2', 20), notification('n1', 10)];
    const { app } = await buildApp(rows);

    const ordreInverse: CursorSort = [
      { field: 'createdAt', direction: 'asc', kind: 'date' },
      { field: 'id', direction: 'asc', kind: 'string' },
    ];
    const jeton = encodePageCursor(ordreInverse, { createdAt: at(30), id: 'n3' });
    const page = await lire(app, `?limit=5&cursor=${encodeURIComponent(jeton)}`);

    expect(ids(page)).toEqual(['n3', 'n2', 'n1']);
    await app.close();
  });

  it('sert la première page sur un jeton illisible — le défilement ne se coupe pas', async () => {
    const { app } = await buildApp([notification('n2', 20), notification('n1', 10)]);

    const page = await lire(app, '?limit=1&cursor=pas-un-curseur');

    expect(ids(page)).toEqual(['n2']);
    await app.close();
  });
});

// ─── `offset` reste servi, mais `cursor` gagne ───────────────────────────────

describe('`offset` reste un alias, `cursor` gagne quand les deux arrivent', () => {
  it("ne saute pas le rang demandé par `offset` — un rang et une ancre ne décrivent pas la même fenêtre", async () => {
    const rows = [notification('n4', 40), notification('n3', 30), notification('n2', 20), notification('n1', 10)];
    const { app } = await buildApp(rows);

    const jeton = encodePageCursor(ORDRE_INBOX, { createdAt: at(40), id: 'n4' });
    const page = await lire(app, `?limit=2&offset=3&cursor=${encodeURIComponent(jeton)}`);

    // Sous `offset=3`, la fenêtre commencerait à `n1`. Sous le curseur, elle
    // reprend après `n4`. C'est l'ancre qui décide.
    expect(ids(page)).toEqual(['n3', 'n2']);
    await app.close();
  });

  it('laisse le mode offset intact — total compté, rang rendu', async () => {
    const { app } = await buildApp([notification('n2', 20), notification('n1', 10)]);

    const page = await lire(app, '?offset=0&limit=5');

    expect(ids(page)).toEqual(['n2', 'n1']);
    expect(page.pagination).toMatchObject({ total: 2, offset: 0, limit: 5, hasMore: false });
    await app.close();
  });
});

// ─── Le `count()` quitte le chemin nominal ───────────────────────────────────

describe('le `count()` ne se repaie plus page après page', () => {
  it("ne compte AUCUNE fois la table sur une marche entière au curseur", async () => {
    const rows = Array.from({ length: 7 }, (_, i) => notification(`n${i}`, i * 10));
    const { app, comptes } = await buildApp(rows);

    let cursor: string | null = null;
    const vues: string[] = [];
    for (let garde = 0; garde < 10; garde += 1) {
      const page: any = await lire(
        app,
        `?limit=3${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`
      );
      vues.push(...ids(page));
      cursor = page.pagination.nextCursor as string | null;
      if (!cursor) break;
    }

    expect(vues).toEqual(['n6', 'n5', 'n4', 'n3', 'n2', 'n1', 'n0']);
    expect(comptes()).toBe(0);
    await app.close();
  });

  it('compte encore sur le chemin `offset` — le coût reste chez l’alias déprécié', async () => {
    const { app, comptes } = await buildApp([notification('n1', 10)]);

    await lire(app, '?offset=0&limit=5');

    expect(comptes()).toBe(1);
    await app.close();
  });
});

// ─── LE témoin : le saut de ligne, sur une inbox qui BOUGE ───────────────────

describe('le SAUT DE LIGNE — ce que le curseur corrige et que l’offset ne peut pas', () => {
  const inboxDeQuatre = () => [
    notification('n4', 40),
    notification('n3', 30),
    notification('n2', 20),
    notification('n1', 10),
  ];

  it("sous OFFSET, une notification arrivée entre deux pages fait SAUTER une ligne", async () => {
    const rows = inboxDeQuatre();
    const { app } = await buildApp(rows);

    const page1 = await lire(app, '?offset=0&limit=2');
    rows.unshift(notification('n5', 50));
    const page2 = await lire(app, '?offset=2&limit=2');

    const vues = [...ids(page1), ...ids(page2)];
    expect(vues).toEqual(['n4', 'n3', 'n3', 'n2']);
    expect(vues).not.toContain('n1');
    await app.close();
  });

  it('sous CURSEUR, la MÊME insertion ne saute ni ne redouble aucune ligne', async () => {
    const rows = inboxDeQuatre();
    const { app } = await buildApp(rows);

    const page1 = await lire(app, '?limit=2');
    rows.unshift(notification('n5', 50));
    const page2 = await lire(
      app,
      `?limit=2&cursor=${encodeURIComponent(page1.pagination.nextCursor as string)}`
    );

    const vues = [...ids(page1), ...ids(page2)];
    expect(vues).toEqual(['n4', 'n3', 'n2', 'n1']);
    expect(new Set(vues).size).toBe(vues.length);
    await app.close();
  });

  it('garde la visibilité sous le curseur — une page suivante ne réélargit rien', async () => {
    const rows = [
      notification('n4', 40),
      notification('n3', 30, { isRead: true }),
      notification('n2', 20, { expiresAt: new Date(Date.now() - 60_000) }),
      notification('n1', 10),
    ];
    const { app } = await buildApp(rows);

    const page1 = await lire(app, '?limit=1&unreadOnly=true');
    const page2 = await lire(
      app,
      `?limit=5&unreadOnly=true&cursor=${encodeURIComponent(page1.pagination.nextCursor as string)}`
    );

    expect(ids(page1)).toEqual(['n4']);
    expect(ids(page2)).toEqual(['n1']);
    await app.close();
  });
});
