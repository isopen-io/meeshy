/**
 * DELETE /posts/media/:mediaId — supprime un `PostMedia` encore EN ATTENTE.
 *
 * L'autorisation est EXACTEMENT `claimableMediaWhere(userId)` — le même
 * prédicat que `createPost`/`updatePost` utilisent pour RÉCLAMER un média.
 * Un prédicat, deux verbes (réclamer / relâcher), qui ne peuvent plus
 * diverger. Voir `services/posts/mediaOwnership.ts`.
 *
 * ─── POURQUOI UN FAUX PRISMA QUI ÉVALUE LE `where` ────────────────────────
 * La première version de ce fichier stubait `findFirst` à `null` pour les cas
 * NÉGATIFS (« média d'un autre uploadeur », « média déjà rattaché »). Ces deux
 * témoins ne mesuraient RIEN : c'est le stub qui produisait le 404, jamais le
 * prédicat. Mesuré — la route mutée en `where: { id: mediaId }`, sans aucune
 * garde de propriété, les laissait VERTS. Les gardes négatives meurent en
 * silence dès qu'on leur donne la réponse au lieu de la leur faire trouver.
 *
 * Le faux ci-dessous porte donc une LIGNE et évalue le `where` que la route
 * compose — exactement les opérateurs de `claimableMediaWhere` (égalité,
 * `AND`, `OR`, `{ isSet: false }` pour un champ ABSENT du document Mongo).
 * Retirer la garde fait alors rougir les deux cas négatifs.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';
import { claimableMediaWhere } from '../../../services/posts/mediaOwnership';

const USER_ID = '507f1f77bcf86cd799439011';
const OTHER_USER_ID = '507f1f77bcf86cd799439022';
const MEDIA_ID = '507f1f77bcf86cd799439099';

/**
 * Une ligne `PostMedia` telle que le handler TUS la crée : `postId` posé à
 * `null`, `commentId` JAMAIS écrit (donc ABSENT du document — la forme que
 * seul `{ isSet: false }` matche, et dont l'oubli a rendu tout média
 * fraîchement téléversé irréclamable en prod le 2026-07-31).
 */
interface MediaRow {
  readonly [field: string]: unknown;
  id: string;
  uploaderId: string | null;
  postId?: string | null;
  commentId?: string | null;
  fileUrl: string | null;
  thumbnailUrl: string | null;
}

function pendingMedia(overrides: Partial<MediaRow> = {}): MediaRow {
  return {
    id: MEDIA_ID,
    uploaderId: USER_ID,
    postId: null,
    fileUrl: 'https://cdn.test/file.jpg',
    thumbnailUrl: null,
    ...overrides,
  };
}

function matchesLeaf(row: MediaRow, clause: Record<string, unknown>): boolean {
  return Object.entries(clause).every(([field, expected]) => {
    const actual = (row as Record<string, unknown>)[field];
    if (expected === null) return actual === null;
    if (expected && typeof expected === 'object' && 'isSet' in (expected as object)) {
      return (expected as { isSet: boolean }).isSet ? actual !== undefined : actual === undefined;
    }
    return actual === expected;
  });
}

function matchesWhere(row: MediaRow, where: Record<string, unknown>): boolean {
  const { AND, OR, ...scalars } = where as {
    AND?: Record<string, unknown>[];
    OR?: Record<string, unknown>[];
  } & Record<string, unknown>;
  if (!matchesLeaf(row, scalars)) return false;
  if (OR && !OR.some((clause) => matchesWhere(row, clause))) return false;
  if (AND && !AND.every((clause) => matchesWhere(row, clause))) return false;
  return true;
}

function makePreValidationAuth(authenticated: boolean) {
  return async (req: FastifyRequest) => {
    if (authenticated) {
      (req as any).authContext = {
        isAuthenticated: true,
        registeredUser: { id: USER_ID, role: 'USER' },
      };
    } else {
      (req as any).authContext = null;
    }
  };
}

import { registerPostMediaRoutes } from '../media';

interface Harness {
  app: FastifyInstance;
  callOrder: string[];
  findFirst: jest.Mock;
  rowDelete: jest.Mock;
  storageDelete: jest.Mock;
}

async function buildApp(
  opts: { authenticated?: boolean; row?: MediaRow | null } = {},
): Promise<Harness> {
  const { authenticated = true, row = null } = opts;
  const app = Fastify({ logger: false });

  const callOrder: string[] = [];

  // Le faux TROUVE la ligne seulement si le `where` composé par la route la
  // désigne réellement — c'est ce qui donne du mordant aux cas négatifs.
  const findFirst = jest.fn<any>(async (args: any) => {
    if (!row) return null;
    if (!matchesWhere(row, args.where)) return null;
    return { id: row.id, fileUrl: row.fileUrl, thumbnailUrl: row.thumbnailUrl };
  });
  const rowDelete = jest.fn<any>(async () => {
    callOrder.push('row');
    return {};
  });
  const soundFindMany = jest.fn<any>(async () => []);
  const storageDelete = jest.fn<any>(async () => {
    callOrder.push('bytes');
  });

  const prisma = {
    postMedia: { findFirst, delete: rowDelete },
    sound: { findMany: soundFindMany },
  } as any;

  registerPostMediaRoutes(app, prisma, makePreValidationAuth(authenticated), {
    delete: storageDelete,
  } as any);
  await app.ready();
  return { app, callOrder, findFirst, rowDelete, storageDelete };
}

describe('DELETE /posts/media/:mediaId — non authentifié', () => {
  it('rend 401 sans contexte auth', async () => {
    const { app } = await buildApp({ authenticated: false, row: pendingMedia() });
    const res = await app.inject({ method: 'DELETE', url: `/posts/media/${MEDIA_ID}` });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe('DELETE /posts/media/:mediaId — média en attente de l’appelant', () => {
  it('rend 200, efface les OCTETS puis la LIGNE, dans cet ordre', async () => {
    const { app, callOrder, rowDelete, storageDelete } = await buildApp({ row: pendingMedia() });

    const res = await app.inject({ method: 'DELETE', url: `/posts/media/${MEDIA_ID}` });

    expect(res.statusCode).toBe(200);
    expect(storageDelete).toHaveBeenCalledWith('https://cdn.test/file.jpg');
    expect(rowDelete).toHaveBeenCalledWith({ where: { id: MEDIA_ID } });
    // Les octets AVANT la ligne : après le `delete`, plus aucune ligne ne dit
    // où ils sont.
    expect(callOrder).toEqual(['bytes', 'row']);
    await app.close();
  });

  it('interroge prisma avec EXACTEMENT le prédicat de réclamation partagé', async () => {
    const { app, findFirst } = await buildApp({ row: pendingMedia() });

    await app.inject({ method: 'DELETE', url: `/posts/media/${MEDIA_ID}` });

    // Cas 4 — la forme MongoDB `isSet:false` (champ absent du document) doit
    // être présente, pas seulement `postId: null` : c'est elle qui a rendu
    // tout média fraîchement téléversé irréclamable en prod le 2026-07-31.
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: MEDIA_ID, ...claimableMediaWhere(USER_ID) },
      select: { id: true, fileUrl: true, thumbnailUrl: true },
    });
    await app.close();
  });
});

describe('DELETE /posts/media/:mediaId — média d’un AUTRE uploadeur', () => {
  it('rend 404 et ne touche ni les octets ni la ligne', async () => {
    // La ligne EXISTE et son id est celui demandé : seul `uploaderId` diffère.
    // Sans garde de propriété, la route la trouverait et la détruirait.
    const { app, rowDelete, storageDelete } = await buildApp({
      row: pendingMedia({ uploaderId: OTHER_USER_ID }),
    });

    const res = await app.inject({ method: 'DELETE', url: `/posts/media/${MEDIA_ID}` });

    expect(res.statusCode).toBe(404);
    expect(storageDelete).not.toHaveBeenCalled();
    expect(rowDelete).not.toHaveBeenCalled();
    await app.close();
  });
});

describe('DELETE /posts/media/:mediaId — média déjà RATTACHÉ', () => {
  it('rend 404 quand `postId` est posé — plus libre, donc plus relâchable ici', async () => {
    const { app, rowDelete, storageDelete } = await buildApp({
      row: pendingMedia({ postId: '507f1f77bcf86cd799439033' }),
    });

    const res = await app.inject({ method: 'DELETE', url: `/posts/media/${MEDIA_ID}` });

    expect(res.statusCode).toBe(404);
    expect(storageDelete).not.toHaveBeenCalled();
    expect(rowDelete).not.toHaveBeenCalled();
    await app.close();
  });

  it('rend 404 quand `commentId` est posé — un média de commentaire n’est pas libre', async () => {
    const { app, rowDelete, storageDelete } = await buildApp({
      row: pendingMedia({ commentId: '507f1f77bcf86cd799439044' }),
    });

    const res = await app.inject({ method: 'DELETE', url: `/posts/media/${MEDIA_ID}` });

    expect(res.statusCode).toBe(404);
    expect(storageDelete).not.toHaveBeenCalled();
    expect(rowDelete).not.toHaveBeenCalled();
    await app.close();
  });
});
