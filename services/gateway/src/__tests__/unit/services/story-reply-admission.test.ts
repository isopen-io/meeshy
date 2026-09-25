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
import type { StoryReplyPrisma } from '../../../services/messaging/storyReplyAdmission';

const CONVERSATION = '507f1f77bcf86cd799439a01';
const STORY = '507f1f77bcf86cd799439b01';
const AUTEUR = '507f1f77bcf86cd799439c01';
const LECTEUR = '507f1f77bcf86cd799439c02';
const EXPEDITEUR_PARTICIPANT = '507f1f77bcf86cd799439e01';

type Visibility = 'PUBLIC' | 'FRIENDS' | 'PRIVATE' | 'ONLY' | 'EXCEPT' | 'COMMUNITY';
type PostRow = {
  id: string;
  authorId: string;
  deletedAt: Date | null;
  visibility: Visibility;
  visibilityUserIds: string[];
  expiresAt: Date | null;
} | null;
type ParticipantRow = { id: string; bannedAt: Date | null } | null;

type Calls = { post: number; participant: Array<Record<string, unknown>> };

type Monde = {
  readonly expediteurUserId?: string | null;
  readonly amis?: boolean;
  readonly typeConversation?: string | null;
};

const fauxPrisma = (post: PostRow, auteurMembre: ParticipantRow, monde: Monde = {}) => {
  const calls: Calls = { post: 0, participant: [] };
  const expediteurUserId = monde.expediteurUserId === undefined ? LECTEUR : monde.expediteurUserId;
  const typeConversation = monde.typeConversation === undefined ? 'direct' : monde.typeConversation;
  const prisma = {
    conversation: {
      findUnique: async () => (typeConversation === null ? null : { id: CONVERSATION, type: typeConversation }),
    },
    post: {
      findUnique: async () => {
        calls.post += 1;
        return post;
      },
    },
    participant: {
      findUnique: async () => ({ id: EXPEDITEUR_PARTICIPANT, userId: expediteurUserId }),
      findFirst: async (args: { where: Record<string, unknown> }) => {
        calls.participant.push(args.where);
        return auteurMembre;
      },
      findMany: async () => [],
    },
    friendRequest: {
      findFirst: async () => (monde.amis ? { id: '507f1f77bcf86cd799439f01' } : null),
    },
    postMention: { findUnique: async () => null },
    communityMember: { findMany: async () => [], findFirst: async () => null },
    postComment: { findFirst: async () => null },
  };
  return { prisma: prisma as unknown as StoryReplyPrisma, calls };
};

const storyVivante: PostRow = {
  id: STORY,
  authorId: AUTEUR,
  deletedAt: null,
  visibility: 'PUBLIC',
  visibilityUserIds: [],
  expiresAt: null,
};
const storyAmis: PostRow = { ...storyVivante!, visibility: 'FRIENDS' };
const membreActif = { id: '507f1f77bcf86cd799439d01', bannedAt: null };

const admettre = (prisma: StoryReplyPrisma, storyReplyToId: string | null | undefined) =>
  admitStoryReply(prisma, {
    conversationId: CONVERSATION,
    senderParticipantId: EXPEDITEUR_PARTICIPANT,
    storyReplyToId,
  });

describe('#7882 — admitStoryReply', () => {
  it('admet une réponse dans un DM avec l’auteur — l’auteur est membre actif', async () => {
    const { prisma, calls } = fauxPrisma(storyVivante, membreActif);
    const verdict = await admettre(prisma, STORY);
    expect(verdict).toEqual({ ok: true });
    expect(calls.participant).toEqual([{ conversationId: CONVERSATION, userId: AUTEUR, isActive: true }]);
  });

  it('admet un identifiant entouré d’espaces dans le DM de l’auteur', async () => {
    const { prisma } = fauxPrisma(storyVivante, membreActif);
    const verdict = await admettre(prisma, `  ${STORY}  `);
    expect(verdict.ok).toBe(true);
  });

  describe('#7951 — seule la conversation DIRECTE de l’auteur admet la réponse', () => {
    it.each(['group', 'public', 'global', 'broadcast'])(
      'refuse une conversation `%s` même quand l’auteur en est membre actif',
      async (typeConversation) => {
        const { prisma, calls } = fauxPrisma(storyVivante, membreActif, { typeConversation });
        const verdict = await admettre(prisma, STORY);
        expect(verdict).toEqual({ ok: false, reason: 'Une réponse à une story ne vit que dans la conversation directe de son auteur' });
        expect(calls.participant).toHaveLength(0);
      },
    );

    it('refuse une conversation INTROUVABLE (fail-closed)', async () => {
      const { prisma } = fauxPrisma(storyVivante, membreActif, { typeConversation: null });
      const verdict = await admettre(prisma, STORY);
      expect(verdict.ok).toBe(false);
    });

    it('refuse le DM d’un tiers — l’auteur n’y est pas', async () => {
      const { prisma } = fauxPrisma(storyVivante, null);
      const verdict = await admettre(prisma, STORY);
      expect(verdict).toEqual({ ok: false, reason: 'L’auteur de la story citée n’est pas membre de cette conversation' });
    });

    it('refuse l’AUTEUR qui cite sa propre story dans un DM — l’autre participant n’est pas l’auteur', async () => {
      const { prisma } = fauxPrisma(storyVivante, membreActif, { expediteurUserId: AUTEUR });
      const verdict = await admettre(prisma, STORY);
      expect(verdict).toEqual({ ok: false, reason: 'L’interlocuteur de cette conversation n’est pas l’auteur de la story citée' });
    });

    it('distingue les quatre raisons de refus', async () => {
      const raisons = await Promise.all([
        admettre(fauxPrisma(null, membreActif).prisma, STORY),
        admettre(fauxPrisma(storyVivante, membreActif, { typeConversation: 'group' }).prisma, STORY),
        admettre(fauxPrisma(storyVivante, null).prisma, STORY),
        admettre(fauxPrisma(storyVivante, membreActif, { expediteurUserId: AUTEUR }).prisma, STORY),
      ]);
      expect(new Set(raisons.map((v) => v.reason)).size).toBe(4);
    });
  });

  it('refuse une conversation ÉTRANGÈRE — l’auteur n’y a aucune ligne de participant', async () => {
    const { prisma } = fauxPrisma(storyVivante, null);
    const verdict = await admettre(prisma, STORY);
    expect(verdict.ok).toBe(false);
  });

  it('refuse quand l’auteur a QUITTÉ la conversation — seule une ligne ACTIVE est demandée', async () => {
    const { prisma, calls } = fauxPrisma(storyVivante, null);
    const verdict = await admettre(prisma, STORY);
    expect(verdict.ok).toBe(false);
    expect(calls.participant[0]).toMatchObject({ isActive: true });
  });

  it('refuse quand l’auteur est BANNI de la conversation, même si sa ligne est restée active', async () => {
    const { prisma } = fauxPrisma(storyVivante, { id: '507f1f77bcf86cd799439d03', bannedAt: new Date() });
    const verdict = await admettre(prisma, STORY);
    expect(verdict.ok).toBe(false);
  });

  it('refuse une story SUPPRIMÉE, sans relire l’appartenance', async () => {
    const { prisma, calls } = fauxPrisma({ ...storyVivante!, deletedAt: new Date() }, membreActif);
    const verdict = await admettre(prisma, STORY);
    expect(verdict.ok).toBe(false);
    expect(calls.participant).toHaveLength(0);
  });

  it('refuse une story INTROUVABLE (fail-closed)', async () => {
    const { prisma } = fauxPrisma(null, membreActif);
    const verdict = await admettre(prisma, STORY);
    expect(verdict.ok).toBe(false);
  });

  it('refuse un identifiant qui n’est pas un ObjectId, sans requête — Prisma lèverait', async () => {
    const { prisma, calls } = fauxPrisma(storyVivante, membreActif);
    const verdict = await admettre(prisma, 'post-123');
    expect(verdict.ok).toBe(false);
    expect(calls.post).toBe(0);
  });

  it('distingue « introuvable » de « l’auteur n’est pas membre » dans `reason`', async () => {
    const introuvable = await admettre(fauxPrisma(null, null).prisma, STORY);
    const etrangere = await admettre(fauxPrisma(storyVivante, null).prisma, STORY);
    expect(introuvable.reason).toBeTruthy();
    expect(etrangere.reason).toBeTruthy();
    expect(introuvable.reason).not.toEqual(etrangere.reason);
  });

  it.each([undefined, null, '', '   '])('admet sans AUCUNE requête un envoi sans story citée (%p)', async (storyReplyToId) => {
    const interdit = async (): Promise<never> => { throw new Error('aucune requête attendue'); };
    const prisma = {
      conversation: { findUnique: interdit },
      post: { findUnique: interdit },
      participant: { findUnique: interdit, findFirst: interdit, findMany: interdit },
    } as unknown as StoryReplyPrisma;
    const verdict = await admettre(prisma, storyReplyToId);
    expect(verdict).toEqual({ ok: true });
  });

  describe('l’expéditeur doit avoir le droit de VOIR la story citée', () => {
    it('refuse un NON-AMI qui cite une story FRIENDS, même si l’auteur est membre du groupe', async () => {
      const { prisma } = fauxPrisma(storyAmis, membreActif, { amis: false });
      const verdict = await admettre(prisma, STORY);
      expect(verdict).toEqual({ ok: false, reason: 'La story citée n’est pas visible par l’expéditeur' });
    });

    it('admet un AMI qui cite une story FRIENDS', async () => {
      const { prisma } = fauxPrisma(storyAmis, membreActif, { amis: true });
      const verdict = await admettre(prisma, STORY);
      expect(verdict).toEqual({ ok: true });
    });

    it('refuse un expéditeur ANONYME (sans userId), même sur une story PUBLIC — fail-closed', async () => {
      const { prisma } = fauxPrisma(storyVivante, membreActif, { expediteurUserId: null });
      const verdict = await admettre(prisma, STORY);
      expect(verdict).toEqual({ ok: false, reason: 'La story citée n’est pas visible par l’expéditeur' });
    });

    it('laisse l’AUTEUR passer la borne d’audience de sa propre story PRIVATE — c’est la borne DM qui tranche', async () => {
      const { prisma } = fauxPrisma({ ...storyVivante!, visibility: 'PRIVATE' }, membreActif, { expediteurUserId: AUTEUR });
      const verdict = await admettre(prisma, STORY);
      expect(verdict.reason).not.toEqual('La story citée n’est pas visible par l’expéditeur');
    });

    it('ne révèle pas l’appartenance de l’auteur à qui ne voit pas la story', async () => {
      const { prisma, calls } = fauxPrisma(storyAmis, membreActif, { amis: false });
      await admettre(prisma, STORY);
      expect(calls.participant).toHaveLength(0);
    });
  });
});
