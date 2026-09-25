/**
 * #7882 — RÉPONDRE À UNE STORY OU À UN MOOD, C'EST LE CITER DANS UNE
 * CONVERSATION OÙ SON AUTEUR EST MEMBRE.
 *
 * `storyReplyToId` gèle l'instantané du post (contenu, emoji, vignette) dans
 * `metadata.postReplyTo` puis le diffuse aux membres de la conversation cible.
 * Sans borne, un client publiait la citation de la story d'un tiers dans une
 * conversation où ce tiers n'est pas — même défaut que #6601 pour `replyToId`.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { admitStoryReply } from '../../../services/messaging/storyReplyAdmission';

const CONVERSATION = '507f1f77bcf86cd799439a01';
const STORY = '507f1f77bcf86cd799439b01';
const AUTEUR = '507f1f77bcf86cd799439c01';

type PostRow = { id: string; authorId: string; deletedAt: Date | null } | null;
type ParticipantRow = { id: string; bannedAt: Date | null } | null;

type Calls = { post: number; participant: Array<Record<string, unknown>> };

const fauxPrisma = (post: PostRow, auteurMembre: ParticipantRow) => {
  const calls: Calls = { post: 0, participant: [] };
  const prisma = {
    post: {
      findUnique: async () => {
        calls.post += 1;
        return post;
      },
    },
    participant: {
      findFirst: async (args: { where: Record<string, unknown> }) => {
        calls.participant.push(args.where);
        return auteurMembre;
      },
    },
  };
  return { prisma, calls };
};

const storyVivante = { id: STORY, authorId: AUTEUR, deletedAt: null };
const membreActif = { id: '507f1f77bcf86cd799439d01', bannedAt: null };

describe('#7882 — admitStoryReply', () => {
  it('admet une réponse dans un DM avec l’auteur — l’auteur est membre actif', async () => {
    const { prisma, calls } = fauxPrisma(storyVivante, membreActif);
    const verdict = await admitStoryReply(prisma, { conversationId: CONVERSATION, storyReplyToId: STORY });
    expect(verdict).toEqual({ ok: true });
    expect(calls.participant).toEqual([{ conversationId: CONVERSATION, userId: AUTEUR, isActive: true }]);
  });

  it('admet une réponse dans un groupe où l’auteur est membre', async () => {
    const { prisma } = fauxPrisma(storyVivante, { id: '507f1f77bcf86cd799439d02', bannedAt: null });
    const verdict = await admitStoryReply(prisma, { conversationId: CONVERSATION, storyReplyToId: `  ${STORY}  ` });
    expect(verdict.ok).toBe(true);
  });

  it('refuse une conversation ÉTRANGÈRE — l’auteur n’y a aucune ligne de participant', async () => {
    const { prisma } = fauxPrisma(storyVivante, null);
    const verdict = await admitStoryReply(prisma, { conversationId: CONVERSATION, storyReplyToId: STORY });
    expect(verdict.ok).toBe(false);
  });

  it('refuse quand l’auteur a QUITTÉ la conversation — seule une ligne ACTIVE est demandée', async () => {
    const { prisma, calls } = fauxPrisma(storyVivante, null);
    const verdict = await admitStoryReply(prisma, { conversationId: CONVERSATION, storyReplyToId: STORY });
    expect(verdict.ok).toBe(false);
    expect(calls.participant[0]).toMatchObject({ isActive: true });
  });

  it('refuse quand l’auteur est BANNI de la conversation, même si sa ligne est restée active', async () => {
    const { prisma } = fauxPrisma(storyVivante, { id: '507f1f77bcf86cd799439d03', bannedAt: new Date() });
    const verdict = await admitStoryReply(prisma, { conversationId: CONVERSATION, storyReplyToId: STORY });
    expect(verdict.ok).toBe(false);
  });

  it('refuse une story SUPPRIMÉE, sans relire l’appartenance', async () => {
    const { prisma, calls } = fauxPrisma({ ...storyVivante, deletedAt: new Date() }, membreActif);
    const verdict = await admitStoryReply(prisma, { conversationId: CONVERSATION, storyReplyToId: STORY });
    expect(verdict.ok).toBe(false);
    expect(calls.participant).toHaveLength(0);
  });

  it('refuse une story INTROUVABLE (fail-closed)', async () => {
    const { prisma } = fauxPrisma(null, membreActif);
    const verdict = await admitStoryReply(prisma, { conversationId: CONVERSATION, storyReplyToId: STORY });
    expect(verdict.ok).toBe(false);
  });

  it('refuse un identifiant qui n’est pas un ObjectId, sans requête — Prisma lèverait', async () => {
    const { prisma, calls } = fauxPrisma(storyVivante, membreActif);
    const verdict = await admitStoryReply(prisma, { conversationId: CONVERSATION, storyReplyToId: 'post-123' });
    expect(verdict.ok).toBe(false);
    expect(calls.post).toBe(0);
  });

  it('distingue « introuvable » de « l’auteur n’est pas membre » dans `reason`', async () => {
    const introuvable = await admitStoryReply(fauxPrisma(null, null).prisma, {
      conversationId: CONVERSATION,
      storyReplyToId: STORY,
    });
    const etrangere = await admitStoryReply(fauxPrisma(storyVivante, null).prisma, {
      conversationId: CONVERSATION,
      storyReplyToId: STORY,
    });
    expect(introuvable.reason).toBeTruthy();
    expect(etrangere.reason).toBeTruthy();
    expect(introuvable.reason).not.toEqual(etrangere.reason);
  });

  it.each([undefined, null, '', '   '])('admet sans AUCUNE requête un envoi sans story citée (%p)', async (storyReplyToId) => {
    const prisma = {
      post: { findUnique: async (): Promise<PostRow> => { throw new Error('aucune requête attendue'); } },
      participant: { findFirst: async (): Promise<ParticipantRow> => { throw new Error('aucune requête attendue'); } },
    };
    const verdict = await admitStoryReply(prisma, { conversationId: CONVERSATION, storyReplyToId });
    expect(verdict).toEqual({ ok: true });
  });
});
