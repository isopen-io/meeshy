import { describe, expect, test } from 'bun:test';

import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';

import { nowPlayingTagsOf, registerNowPlaying, voiceNowPlayingTags, type VoiceNowPlayingSource } from './now-playing';

/**
 * **CE QUE LA CARTE DE LECTURE DIT D'UN VOCAL** (#10624) — la référence est
 * la carte Now Playing d'iOS (`ConversationAudioCoordinator+NowPlaying`) :
 * l'auteur, la conversation, la date, l'avatar de l'auteur sinon de la
 * conversation. Un vocal PROTÉGÉ ne dit que son auteur, comme la Live
 * Activity iOS (`VoicePlaybackActivityLaw`) : ni conversation, ni image.
 */

const resolve = (url: string): string => `https://gate.test${url}`;

const source = (overrides: Partial<VoiceNowPlayingSource> = {}): VoiceNowPlayingSource => ({
  carrier: { sender: { displayName: 'Nour', avatarUrl: '/a/nour.jpg' }, sentAt: '2026-10-14T09:30:00.000Z' },
  conversationTitle: 'Famille',
  conversationAvatarUrl: '/a/famille.jpg',
  message: { isViewOnce: false, isBlurred: false, isEncrypted: false },
  attachment: {},
  resolve,
  ...overrides,
});

describe('les étiquettes de lecture d’un vocal (#10624)', () => {
  test('l’auteur, la conversation, la date et l’avatar de l’auteur résolu en adresse absolue', () => {
    expect(voiceNowPlayingTags(source())).toEqual({
      sender: 'Nour',
      conversation: 'Famille',
      sentAtMs: Date.parse('2026-10-14T09:30:00.000Z'),
      artworkUrl: 'https://gate.test/a/nour.jpg',
      protected: false,
    });
  });

  test('sans avatar d’auteur, celui de la conversation ; sans aucun, pas d’image', () => {
    const sansAuteur = source({ carrier: { sender: { displayName: 'Nour', avatarUrl: null }, sentAt: '2026-10-14T09:30:00.000Z' } });
    expect(voiceNowPlayingTags(sansAuteur).artworkUrl).toBe('https://gate.test/a/famille.jpg');
    const sansRien = { ...sansAuteur, conversationAvatarUrl: undefined };
    expect(voiceNowPlayingTags(sansRien).artworkUrl).toBeNull();
  });

  test('hors conversation (un post, une story) : l’auteur seul', () => {
    const tags = voiceNowPlayingTags(source({ conversationTitle: undefined, conversationAvatarUrl: undefined }));
    expect(tags.conversation).toBeNull();
    expect(tags.sender).toBe('Nour');
  });

  test('un vocal éphémère, à vue unique, flouté ou chiffré ne dit ni sa conversation ni son image', () => {
    const protections: readonly VoiceNowPlayingSource[] = [
      source({ message: { isViewOnce: true, isBlurred: false, isEncrypted: false } }),
      source({ message: { isViewOnce: false, isBlurred: true, isEncrypted: false } }),
      source({ message: { isViewOnce: false, isBlurred: false, isEncrypted: true } }),
      source({ message: { isViewOnce: false, isBlurred: false, isEncrypted: false, expiresAt: new Date('2026-10-15') } }),
      source({ message: { isViewOnce: false, isBlurred: false, isEncrypted: false, effectFlags: MESSAGE_EFFECT_FLAGS.EPHEMERAL } }),
      source({ attachment: { isViewOnce: true } }),
    ];
    for (const protege of protections) {
      expect(voiceNowPlayingTags(protege)).toEqual({ sender: 'Nour', conversation: null, sentAtMs: null, artworkUrl: null, protected: true });
    }
  });

  test('aucun auteur lisible : rien n’est inventé', () => {
    const tags = voiceNowPlayingTags(source({ carrier: undefined, conversationAvatarUrl: undefined }));
    expect(tags).toEqual({ sender: null, conversation: 'Famille', sentAtMs: null, artworkUrl: null, protected: false });
  });
});

describe('le registre des étiquettes, lu par la coque à la lecture (#10624)', () => {
  test('une pièce enregistrée se relit par son id ; une inconnue rend null', () => {
    const tags = voiceNowPlayingTags(source());
    registerNowPlaying('att-registre', tags);
    expect(nowPlayingTagsOf('att-registre')).toEqual(tags);
    expect(nowPlayingTagsOf('att-inconnue')).toBeNull();
    expect(nowPlayingTagsOf(undefined)).toBeNull();
  });

  test('le registre est borné : les plus anciennes pièces en sortent', () => {
    const tags = voiceNowPlayingTags(source());
    registerNowPlaying('att-ancienne', tags);
    for (let i = 0; i < 300; i += 1) registerNowPlaying(`att-${i}`, tags);
    expect(nowPlayingTagsOf('att-ancienne')).toBeNull();
    expect(nowPlayingTagsOf('att-299')).toEqual(tags);
  });
});
