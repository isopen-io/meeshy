/**
 * Témoin dédié de `mayMintShareLink` (#4169) — le prédicat UNIQUE qui décide
 * si un acteur peut fabriquer un lien de partage pour une conversation
 * donnée, appelé par les deux portes (`POST /links` et
 * `POST /conversations/:id/new-link`). Fonction pure : ce fichier ne monte
 * ni Fastify ni Prisma, il exerce la matrice de rangs directement.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { mayMintShareLink, mintConversationShareLink } from '../../../../routes/links/utils/share-link-mint';
import { findFirstHonouringWhere } from '../../../helpers/find-first-honouring-where';

describe('mayMintShareLink', () => {
  describe('conversation type: public', () => {
    it('allows a plain member — la porte est déjà fermée par l\'appartenance', () => {
      expect(mayMintShareLink({ conversationRole: 'member', platformRole: 'USER' }, { type: 'public' })).toBe(true);
    });

    it('allows even a rang illisible — public ne consulte aucun rang', () => {
      expect(mayMintShareLink({ conversationRole: null, platformRole: 'USER' }, { type: 'public' })).toBe(true);
    });
  });

  describe('conversation type: global — ADMIN ou BIGBOSS de la PLATEFORME, jamais le rang de conversation', () => {
    it('refuses a plain USER platform role', () => {
      expect(mayMintShareLink({ conversationRole: 'creator', platformRole: 'USER' }, { type: 'global' })).toBe(false);
    });

    it('refuses a conversation-level MODERATOR whose platform role is USER — le rang de conversation ne compte pas ici', () => {
      expect(mayMintShareLink({ conversationRole: 'moderator', platformRole: 'USER' }, { type: 'global' })).toBe(false);
    });

    it('allows ADMIN — critère de fin #2, BIGBOSS OU ADMIN, pas BIGBOSS seul', () => {
      expect(mayMintShareLink({ conversationRole: null, platformRole: 'ADMIN' }, { type: 'global' })).toBe(true);
    });

    it('allows BIGBOSS', () => {
      expect(mayMintShareLink({ conversationRole: null, platformRole: 'BIGBOSS' }, { type: 'global' })).toBe(true);
    });
  });

  describe('conversation type: group (et tout type non public/global) — au moins MODERATOR', () => {
    it('refuses a simple member — le témoin NÉGATIF que l\'issue exige explicitement', () => {
      expect(mayMintShareLink({ conversationRole: 'member', platformRole: 'USER' }, { type: 'group' })).toBe(false);
    });

    it('refuses an unreadable conversation role — fail-closed, jamais member par défaut', () => {
      expect(mayMintShareLink({ conversationRole: 'not-a-real-role', platformRole: 'USER' }, { type: 'group' })).toBe(false);
    });

    it('refuses no role at all', () => {
      expect(mayMintShareLink({ conversationRole: null, platformRole: 'USER' }, { type: 'group' })).toBe(false);
    });

    it('allows a MODERATOR — le plancher exact', () => {
      expect(mayMintShareLink({ conversationRole: 'moderator', platformRole: 'USER' }, { type: 'group' })).toBe(true);
    });

    it('allows an ADMIN', () => {
      expect(mayMintShareLink({ conversationRole: 'admin', platformRole: 'USER' }, { type: 'group' })).toBe(true);
    });

    it('allows the CREATOR', () => {
      expect(mayMintShareLink({ conversationRole: 'creator', platformRole: 'USER' }, { type: 'group' })).toBe(true);
    });

    it('allows a platform ADMIN with no conversation role — le bypass de conversation-authority.ts (§ "avec les droits DU CRÉATEUR")', () => {
      expect(mayMintShareLink({ conversationRole: null, platformRole: 'ADMIN' }, { type: 'group' })).toBe(true);
    });

    it('allows a platform BIGBOSS with no conversation role', () => {
      expect(mayMintShareLink({ conversationRole: null, platformRole: 'BIGBOSS' }, { type: 'group' })).toBe(true);
    });
  });

  describe('un type inconnu retombe sur le plancher général, jamais sur une autorisation par défaut', () => {
    it('refuses a member on a made-up type', () => {
      expect(mayMintShareLink({ conversationRole: 'member', platformRole: 'USER' }, { type: 'some-future-type' })).toBe(false);
    });

    it('allows a moderator on a made-up type', () => {
      expect(mayMintShareLink({ conversationRole: 'moderator', platformRole: 'USER' }, { type: 'some-future-type' })).toBe(true);
    });
  });

  // `direct` retombe ici en THÉORIE (le prédicat ne le distingue pas d'un
  // type inconnu) ; en PRATIQUE `mintConversationShareLink` refuse tout type
  // `direct` par un contrôle EXPLICITE, avant même d'appeler ce prédicat — cf.
  // `share-link-mint.ts`. Ces deux témoins prouvent que le prédicat reste
  // correct s'il était un jour atteint directement, sans dépendre de cet ordre.
  describe('conversation type: direct — filet de sécurité si jamais appelé directement', () => {
    it('refuses a plain member', () => {
      expect(mayMintShareLink({ conversationRole: 'member', platformRole: 'USER' }, { type: 'direct' })).toBe(false);
    });

    it('would allow a creator — c\'est le refus ABSOLU en amont (type direct) qui protège, pas ce prédicat', () => {
      expect(mayMintShareLink({ conversationRole: 'creator', platformRole: 'USER' }, { type: 'direct' })).toBe(true);
    });
  });
});

/**
 * #5191 — `mintConversationShareLink` résout l'appartenance/le rang de
 * l'appelant par un `where` PLAT : `{ conversationId, userId, isActive: true }`
 * (`share-link-mint.ts`, branche « conversation existante »). Les deux portes
 * qui l'appellent (`POST /links`, `POST /conversations/:id/new-link`)
 * doublaient ce `participant.findFirst` par un `mockResolvedValue` inconditionnel
 * — retirer `userId` du filtre de production ne faisait tomber aucun de leurs
 * témoins.
 *
 * L'INTRUS — un autre membre RÉEL de la même conversation, dont le rang ne
 * suffit PAS à fabriquer un lien — est semé EN PREMIER : si `userId` disparaît
 * du `where`, `findFirstHonouringWhere` rend cette ligne, et
 * `mayMintShareLink` refuse un appelant qui devrait pourtant être admis.
 */
describe('mintConversationShareLink — la garde plate (#5191)', () => {
  const CONVERSATION_ID = '507f1f77bcf86cd799439099';
  const USER_ID = 'user-moderator';
  const OTHER_USER_ID = 'user-plain-member';

  function makePrisma() {
    return {
      conversation: {
        findUnique: jest.fn<any>().mockResolvedValue({
          id: CONVERSATION_ID, type: 'group', title: 'Groupe', isActive: true, closedAt: null
        })
      },
      participant: {
        // L'intrus (simple membre, rang insuffisant) AVANT la ligne du modérateur.
        findFirst: jest.fn<any>(
          findFirstHonouringWhere([
            { id: 'part-other', userId: OTHER_USER_ID, conversationId: CONVERSATION_ID, isActive: true, role: 'member' },
            { id: 'part-mine', userId: USER_ID, conversationId: CONVERSATION_ID, isActive: true, role: 'moderator' }
          ])
        ),
        findMany: jest.fn<any>().mockResolvedValue([])
      },
      conversationShareLink: {
        findFirst: jest.fn<any>().mockResolvedValue(null),
        create: jest.fn<any>().mockResolvedValue({
          id: 'link-1', linkId: 'mshy_abc123', conversationId: CONVERSATION_ID
        })
      }
    } as any;
  }

  function makeReply() {
    const reply: any = { send: jest.fn() };
    reply.status = jest.fn().mockReturnValue(reply);
    return reply;
  }

  it('fabrique le lien pour le MODÉRATEUR authentique, jamais pour le premier participant trouvé', async () => {
    const prisma = makePrisma();
    const reply = makeReply();

    const result = await mintConversationShareLink({
      prisma,
      reply,
      log: { error: jest.fn() },
      notificationService: undefined,
      socketIOHandler: undefined,
      userId: USER_ID,
      userRole: 'USER',
      input: { conversationId: CONVERSATION_ID }
    });

    expect(result).not.toBeNull();
    expect(prisma.conversationShareLink.create).toHaveBeenCalledTimes(1);
    expect(reply.send).not.toHaveBeenCalled();
  });
});
