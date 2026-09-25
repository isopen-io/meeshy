/**
 * **La première story d'un compte au courriel non vérifié passe** (#7907,
 * décision porteur révisée du 2026-09-25) — et RIEN d'autre ne passe.
 *
 * `POST /posts` est gardé par `requireEmailVerification` (#6437, ce qui SORT
 * du compte vers d'autres personnes). L'onboarding propose pourtant une story
 * dès l'inscription : sans exception, la carte promettait un geste que la
 * passerelle refusait. L'exception est bornée à UNE story, comptée côté
 * serveur sur TOUTES les stories jamais écrites par l'auteur — supprimées et
 * expirées comprises (`Post.deletedAt` est un effacement doux, les stories ne
 * sont jamais détruites) : en supprimer une ne rouvre pas le droit.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { requireEmailVerificationUnlessFirstStory } from '../../../middleware/email-verification-first-story';

const AUTHOR = '68a000000000000000000001';

type StoryRow = { readonly authorId: string; readonly type: string; readonly deletedAt: Date | null };

function makePrisma(stories: readonly StoryRow[]) {
  const findFirst = jest.fn(async (args: unknown) => {
    const where = (args as { where: Record<string, unknown> }).where;
    const match = stories.find(
      (row) =>
        row.authorId === where.authorId &&
        row.type === where.type &&
        (where.deletedAt === undefined || (where.deletedAt === null && row.deletedAt === null)),
    );
    return match ? { id: 'story-1' } : null;
  });
  return { post: { findFirst } };
}

async function mount(params: {
  readonly verified: boolean;
  readonly stories?: readonly StoryRow[];
  readonly authenticated?: boolean;
}): Promise<{ app: FastifyInstance; prisma: ReturnType<typeof makePrisma> }> {
  const prisma = makePrisma(params.stories ?? []);
  const app = Fastify({ logger: false });
  app.post(
    '/posts',
    {
      preValidation: [
        async (request: FastifyRequest) => {
          if (params.authenticated === false) return;
          Object.assign(request, {
            authContext: {
              isAuthenticated: true,
              registeredUser: { id: AUTHOR, emailVerifiedAt: params.verified ? new Date() : null },
            },
          });
        },
        requireEmailVerificationUnlessFirstStory(prisma as never),
      ],
    },
    async (_request, reply) => reply.status(201).send({ success: true }),
  );
  await app.ready();
  return { app, prisma };
}

const publish = (app: FastifyInstance, payload: Record<string, unknown>) =>
  app.inject({ method: 'POST', url: '/posts', payload });

describe('POST /posts — garde du courriel avec exception « première story »', () => {
  it('courriel non vérifié, aucune story jamais écrite : la PREMIÈRE story passe (201)', async () => {
    const { app } = await mount({ verified: false });
    const res = await publish(app, { type: 'STORY', content: 'Hello' });
    expect(res.statusCode).toBe(201);
    await app.close();
  });

  it('courriel non vérifié, une story déjà écrite : la seconde est refusée (403 EMAIL_NOT_VERIFIED)', async () => {
    const { app } = await mount({ verified: false, stories: [{ authorId: AUTHOR, type: 'STORY', deletedAt: null }] });
    const res = await publish(app, { type: 'STORY', content: 'Encore' });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('EMAIL_NOT_VERIFIED');
    await app.close();
  });

  it('une story SUPPRIMÉE compte aussi : la supprimer ne rouvre pas le droit', async () => {
    const { app } = await mount({
      verified: false,
      stories: [{ authorId: AUTHOR, type: 'STORY', deletedAt: new Date('2026-09-25T10:00:00.000Z') }],
    });
    const res = await publish(app, { type: 'STORY', content: 'Encore' });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it.each([
    ['un post', { content: 'Hello' }],
    ['un post explicite', { type: 'POST', content: 'Hello' }],
    ['un reel', { type: 'REEL', content: 'Hello' }],
    ['un statut', { type: 'STATUS', content: 'Hello' }],
  ])('courriel non vérifié : %s reste refusé (403) sans même lire la base', async (_label, payload) => {
    const { app, prisma } = await mount({ verified: false });
    const res = await publish(app, payload);
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('EMAIL_NOT_VERIFIED');
    expect(prisma.post.findFirst).not.toHaveBeenCalled();
    await app.close();
  });

  it('courriel vérifié : inchangé — post comme story passent, sans lire la base', async () => {
    const { app, prisma } = await mount({ verified: true, stories: [{ authorId: AUTHOR, type: 'STORY', deletedAt: null }] });
    expect((await publish(app, { type: 'STORY' })).statusCode).toBe(201);
    expect((await publish(app, { content: 'Hello' })).statusCode).toBe(201);
    expect(prisma.post.findFirst).not.toHaveBeenCalled();
    await app.close();
  });

  it('sans session : 401 UNAUTHORIZED, jamais l’exception', async () => {
    const { app } = await mount({ verified: false, authenticated: false });
    const res = await publish(app, { type: 'STORY' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('la lecture des stories échoue : refus (403), jamais un laissez-passer', async () => {
    const prisma = { post: { findFirst: jest.fn(async () => Promise.reject(new Error('mongo down'))) } };
    const app = Fastify({ logger: false });
    app.post(
      '/posts',
      {
        preValidation: [
          async (request: FastifyRequest) => {
            Object.assign(request, {
              authContext: { isAuthenticated: true, registeredUser: { id: AUTHOR, emailVerifiedAt: null } },
            });
          },
          requireEmailVerificationUnlessFirstStory(prisma as never),
        ],
      },
      async (_request, reply) => reply.status(201).send({ success: true }),
    );
    const res = await publish(app, { type: 'STORY' });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('EMAIL_NOT_VERIFIED');
    await app.close();
  });
});
