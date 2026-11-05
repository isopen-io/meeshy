import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { CONSENTS_QUERY_KEY, type GrantedConsents } from '@/lib/api/consents';
import { MEDIA_CONVERSATION_ID, MEDIA_VOICE_EN_WITNESS_ID } from '@/lib/api/fixtures-media';
import { messagesOf } from '@/lib/api/fixtures';
import { appQueryClient } from '@/lib/api/query-client';
import type { Message } from '@/lib/api/types';
import { loadVoiceCatalog } from '@/lib/i18n-voice-catalog';
import { SUPPORTED_INTERFACE_LANGUAGES } from '@/lib/inline-interface-language-bootstrap.js';
import { SETTING_FOCUS_PARAM } from '@/lib/view/setting-focus';
import { ThreadMediaContext, type ThreadMediaContextValue } from '@/lib/view/thread-media-context';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { Attachments } from './attachment-blocks';

/**
 * LA NOTE SOUS MON PROPRE VOCAL (#16419) — miroir `AudioConsentNotice` (iOS,
 * `AudioStackView.swift`) : quand le consentement vocal manque, mon vocal
 * envoyé dit qu'il ne sera ni transcrit ni traduit, et un geste ouvre
 * Réglages › Voix sur la bascule qui manque. Jamais sous le vocal d'un autre,
 * jamais dans une conversation que le serveur ne lit pas, jamais sur un état
 * inconnu.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const { mount, unmountAll, click } = createActMounter();

beforeAll(async () => {
  ensureHappyDomRegistered({ url: 'http://localhost/conversations/c-1' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await Promise.all(SUPPORTED_INTERFACE_LANGUAGES.map((language) => loadVoiceCatalog(language)));
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

afterEach(() => {
  unmountAll();
  appQueryClient.removeQueries({ queryKey: CONSENTS_QUERY_KEY });
});

const voiceMessage = (): Message => {
  const message = messagesOf(MEDIA_CONVERSATION_ID).find((candidate) => candidate.id === MEDIA_VOICE_EN_WITNESS_ID);
  if (message === undefined) throw new Error('témoin vocal introuvable');
  return message;
};

const THREAD: ThreadMediaContextValue = { viewerId: 'u-moi', onReplyToMedia: () => undefined, conversationEncryptionMode: null };

const voice = (params: { readonly isMine: boolean; readonly granted?: GrantedConsents; readonly thread?: ThreadMediaContextValue }) => {
  if (params.granted !== undefined) appQueryClient.setQueryData(CONSENTS_QUERY_KEY, params.granted);
  const message = voiceMessage();
  return (
    <ThreadMediaContext.Provider value={params.thread ?? THREAD}>
      <Attachments
        attachments={message.attachments ?? []}
        languages={['fr']}
        fallbackLanguage="fr"
        mediaFrame="box"
        isMine={params.isMine}
        message={message}
      />
    </ThreadMediaContext.Provider>
  );
};

const noticeOf = (host: HTMLElement) => host.querySelector<HTMLElement>('[data-voice-consent-notice]');

describe('la note sous mon vocal quand le consentement vocal manque', () => {
  test('mon vocal, consentement vocal manquant ⇒ la note le dit et propose les réglages', async () => {
    const host = await mount(voice({ isMine: true, granted: ['data-processing', 'voice-data'] }));
    const notice = noticeOf(host);
    expect(notice).not.toBeNull();
    const action = notice?.querySelector<HTMLButtonElement>('button');
    expect(action?.style.minHeight).toBe('44px');
    expect((action?.textContent ?? '').length).toBeGreaterThan(0);
    expect((notice?.textContent ?? '').length).toBeGreaterThan((action?.textContent ?? '').length);
  });

  test('toucher la note ouvre les réglages SUR la bascule du consentement vocal', async () => {
    const host = await mount(voice({ isMine: true, granted: [] }));
    const action = noticeOf(host)?.querySelector<HTMLButtonElement>('button');
    if (action != null) await click(action);
    expect(window.location.pathname).toBe('/settings');
    expect(new URLSearchParams(window.location.search).get(SETTING_FOCUS_PARAM)).toBe('voice-profile');
  });

  test('consentement vocal effectif ⇒ aucune note', async () => {
    const host = await mount(voice({ isMine: true, granted: ['data-processing', 'voice-data', 'voice-profile'] }));
    expect(noticeOf(host)).toBeNull();
  });

  test('le vocal d’un autre ⇒ aucune note', async () => {
    const host = await mount(voice({ isMine: false, granted: [] }));
    expect(noticeOf(host)).toBeNull();
  });

  test('état des consentements inconnu ⇒ aucune note (jamais un manque deviné)', async () => {
    const host = await mount(voice({ isMine: true }));
    expect(noticeOf(host)).toBeNull();
  });

  test('conversation chiffrée de bout en bout ⇒ aucune note : le serveur ne transcrit rien', async () => {
    const host = await mount(voice({ isMine: true, granted: [], thread: { ...THREAD, conversationEncryptionMode: 'e2ee' } }));
    expect(noticeOf(host)).toBeNull();
  });
});
