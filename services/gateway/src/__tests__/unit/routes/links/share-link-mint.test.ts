/**
 * Témoin dédié de `mayMintShareLink` (#4169) — le prédicat UNIQUE qui décide
 * si un acteur peut fabriquer un lien de partage pour une conversation
 * donnée, appelé par les deux portes (`POST /links` et
 * `POST /conversations/:id/new-link`). Fonction pure : ce fichier ne monte
 * ni Fastify ni Prisma, il exerce la matrice de rangs directement.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { mayMintShareLink } from '../../../../routes/links/utils/share-link-mint';

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
