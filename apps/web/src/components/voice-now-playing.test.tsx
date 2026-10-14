import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { messagesOf } from '@/lib/api/fixtures';
import { MEDIA_CONVERSATION_ID, MEDIA_VOICE_EN_WITNESS_ID } from '@/lib/api/fixtures-media';
import { nowPlayingTagsOf } from '@/lib/view/now-playing';
import { ThreadMediaContext } from '@/lib/view/thread-media-context';

import { Attachments } from './attachment-blocks';

/**
 * **LA BULLE D'UN VOCAL DÉCRIT CE VOCAL À LA CARTE DE LECTURE** (#10624) —
 * l'`<audio>` porte l'id de sa pièce, et la bulle enregistre son auteur, sa
 * conversation, sa date et l'avatar : la coque les relit quand il joue.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(() => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

describe('la bulle vocale décrit son vocal (#10624)', () => {
  test('dans le fil : l’auteur, la conversation, la date et l’avatar absolu', () => {
    const message = messagesOf(MEDIA_CONVERSATION_ID).find((m) => m.id === MEDIA_VOICE_EN_WITNESS_ID);
    const voice = message?.attachments?.[0];
    if (message === undefined || voice === undefined) throw new Error('témoin introuvable');
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
      root.render(
        <ThreadMediaContext.Provider value={{ viewerId: 'u-me', onReplyToMedia: () => {}, conversationTitle: 'Famille', conversationAvatarUrl: undefined }}>
          <Attachments
            attachments={[voice]}
            languages={['fr']}
            fallbackLanguage="fr"
            mediaFrame="box"
            message={message}
            carrier={{ caption: null, sender: { displayName: 'Nour', avatarUrl: 'https://cdn.test/nour.jpg' }, sentAt: '2026-10-14T09:30:00.000Z' }}
          />
        </ThreadMediaContext.Provider>,
      );
    });
    expect(container.querySelector('audio')?.dataset.npAttachment).toBe(voice.id);
    expect(nowPlayingTagsOf(voice.id)).toEqual({
      sender: 'Nour',
      conversation: 'Famille',
      sentAtMs: Date.parse('2026-10-14T09:30:00.000Z'),
      artworkUrl: 'https://cdn.test/nour.jpg',
      protected: false,
    });
    act(() => root.unmount());
    container.remove();
  });
});
