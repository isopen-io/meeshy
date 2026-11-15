/**
 * La chaîne ENTIÈRE de `sticker:library-updated` (#16515), prise par la route
 * RÉELLE et le service RÉEL : seul le `prisma` et la couche Socket.IO sont des
 * doubles.
 *
 * Le témoin frère du service (`StickerLibrary.announce.test.ts`) prouve que
 * l'écrivain ANNONCE. Il ne peut rien dire du câblage : `meStickersRoutes`
 * construit sa bibliothèque par défaut lui-même, et un `announce` qu'on
 * oublierait de lui passer laisserait le service muet avec ses sept témoins
 * verts. C'est la règle du dépôt — « poser au moins un témoin de SURFACE » —
 * et le `options.library` que les autres suites injectent est précisément ce
 * qui court-circuite le site à garder.
 *
 * Le verbe choisi est le RETRAIT : c'est le seul chemin d'écriture qui ne
 * passe ni par multipart ni par sharp, donc le moins cher à faire traverser
 * en entier.
 *
 * @jest-environment node
 */
import Fastify, { type FastifyInstance } from 'fastify';
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { meStickersRoutes } from '../routes/me/stickers';

const ALICE = '65f0c0ffee0000000000a11c';
const STICKER = '65f0c0ffee00000000000001';

type Emission = { readonly room: string; readonly event: string; readonly payload: unknown };

const buildApp = async () => {
  const emissions: Emission[] = [];
  const rows = [{ id: STICKER, userId: ALICE, filePath: `stickers/${ALICE}/file-1.png` }];

  const prisma = {
    userSticker: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        rows.find((row) => Object.entries(where).every(([key, value]) => (row as Record<string, unknown>)[key] === value)) ?? null,
      delete: async ({ where }: { where: { id: string } }) => {
        const index = rows.findIndex((row) => row.id === where.id);
        return rows.splice(index, 1)[0];
      },
    },
  };

  const app = Fastify({ logger: false });
  app.decorate('prisma', prisma as never);
  app.decorate('socketIOHandler', {
    getManager: () => ({
      getIO: () => ({
        to: (room: string) => ({
          emit: (event: string, payload: unknown) => void emissions.push({ room, event, payload }),
        }),
      }),
    }),
  } as never);
  app.decorate('authenticate', (async (request: { authContext?: unknown }) => {
    request.authContext = { type: 'user', isAnonymous: false, isAuthenticated: true, userId: ALICE, hasFullAccess: true, registeredUser: { id: ALICE } };
  }) as never);

  // Aucun `options.library` : c'est la construction PAR DÉFAUT qu'on garde.
  await app.register(meStickersRoutes, { prefix: '/me' });
  await app.ready();
  return { app, emissions, rows };
};

describe('DELETE /me/stickers/:stickerId — la route câble la diffusion', () => {
  let app: FastifyInstance | null = null;

  beforeEach(() => {
    app = null;
  });

  afterEach(async () => {
    await app?.close();
  });

  it('pose `sticker:library-updated` sur la room personnelle du compte', async () => {
    const built = await buildApp();
    app = built.app;

    const response = await built.app.inject({ method: 'DELETE', url: `/me/stickers/${STICKER}` });

    expect(response.statusCode).toBe(200);
    expect(built.rows).toEqual([]);
    expect(built.emissions).toEqual([
      {
        room: ROOMS.user(ALICE),
        event: SERVER_EVENTS.STICKER_LIBRARY_UPDATED,
        payload: expect.objectContaining({ userId: ALICE, change: 'removed', stickerId: STICKER }),
      },
    ]);
  });

  /** Rien à retirer ⇒ rien à annoncer : un non-événement diffusé enverrait les autres appareils réconcilier du vide. */
  it('ne diffuse rien quand le sticker n’existe pas', async () => {
    const built = await buildApp();
    app = built.app;

    const response = await built.app.inject({ method: 'DELETE', url: '/me/stickers/65f0c0ffee00000000000999' });

    expect(response.statusCode).toBe(404);
    expect(built.emissions).toEqual([]);
  });
});
