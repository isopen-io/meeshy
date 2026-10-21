import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { ActionConversation } from '@meeshy/shared/utils/message-action-policy';

import { attachmentDefaults, message, minutesAgo } from '@/lib/api/fixtures-base';
import type { ApiResult, HttpRequest } from '@/lib/api/http';
import { findCachedThreadMessage, messagesQueryKey } from '@/lib/api/messages';
import { sessionStore } from '@/lib/api/session';
import type { Attachment, Message } from '@/lib/api/types';
import { loadInterfaceCatalog, translate } from '@/lib/i18n-catalog';
import { loadMessagePiecesCatalog } from '@/lib/i18n-message-pieces-catalog';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { menuConversation, menuViewer } from '@/test-support/menu-viewer';

import { useMessageMenu } from './use-message-menu';

/**
 * LES SUITES DU MENU WEB (#11370, #11236, #11373) — chaque geste a un effet,
 * ou ne s'offre pas :
 * - « Transcrire » demande la transcription d'un vocal que le serveur lit, et
 *   la greffe sur la pièce du fil — jamais en bout en bout ;
 * - « Enregistrer le contact » télécharge la carte ;
 * - un fil qui porte l'avis d'activation du bout en bout ferme le menu même
 *   quand le détail servi dit encore « en clair ».
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const realFetch = globalThis.fetch;

beforeAll(async () => {
  await Promise.all([loadInterfaceCatalog('fr'), loadMessagePiecesCatalog('fr')]);
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const piece = (id: string, partial: Partial<Attachment> = {}): Attachment =>
  ({
    ...attachmentDefaults,
    id,
    messageId: 'm-1',
    fileName: `${id}.m4a`,
    originalName: `${id}.m4a`,
    mimeType: 'audio/mp4',
    fileSize: 1,
    fileUrl: `https://cdn.meeshy.me/${id}`,
    uploadedBy: 'u-other',
    createdAt: '2026-10-21T09:00:00.000Z',
    ...partial,
  }) as Attachment;

const messageWith = (attachments: readonly Attachment[], extra: Partial<Message> = {}): Message =>
  message({
    id: 'm-1',
    conversationId: 'c-a',
    senderId: 'u-other',
    content: '',
    originalLanguage: 'fr',
    createdAt: minutesAgo(5),
    translations: [],
    attachments: [...attachments],
    ...extra,
  });

let root: Root | undefined;

afterEach(() => {
  if (root !== undefined) act(() => root?.unmount());
  root = undefined;
  document.body.replaceChildren();
  globalThis.fetch = realFetch;
  sessionStore.setState({ session: { status: 'anonymous' } });
});

type MenuApi = ReturnType<typeof useMessageMenu>;
type Reply = (request: HttpRequest) => ApiResult<unknown>;

function mount(
  thread: readonly Message[],
  options: { readonly conversation?: Partial<ActionConversation>; readonly reply?: Reply } = {},
): { readonly api: () => MenuApi; readonly announced: string[]; readonly requests: HttpRequest[]; readonly queryClient: QueryClient } {
  const queryClient = new QueryClient();
  queryClient.setQueryData(messagesQueryKey('c-a'), { pages: [{ messages: [...thread], hasOlder: false, nextCursor: null }], pageParams: [undefined] });
  const requests: HttpRequest[] = [];
  const reply = options.reply ?? (() => ({ ok: true, data: null }));
  const transport = {
    request: async <T,>(request: HttpRequest): Promise<ApiResult<T>> => {
      requests.push(request);
      return reply(request) as ApiResult<T>;
    },
  };
  const announced: string[] = [];
  let latest: MenuApi | undefined;

  function Harness() {
    latest = useMessageMenu({
      conversationId: 'c-a',
      messages: thread,
      readerLanguages: ['fr'],
      readerLocale: 'fr-FR',
      viewer: menuViewer(),
      conversation: menuConversation(options.conversation),
      reply: { setReplyTarget: () => {}, setReplyToMedia: () => {} },
      announce: (text) => announced.push(text),
      queryClient,
      transport,
      source: 'gateway',
    });
    return <div data-row={thread[0]?.id} tabIndex={0} {...latest.longPress} />;
  }

  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      <QueryClientProvider client={queryClient}>
        <Harness />
      </QueryClientProvider>,
    );
  });
  act(() => {
    container.querySelector('[data-row]')?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
  });
  return {
    api: () => {
      if (latest === undefined) throw new Error('hook non monté');
      return latest;
    },
    announced,
    requests,
    queryClient,
  };
}

const offered = (api: () => MenuApi): readonly string[] => (api().menuData?.items ?? []).map((item) => item.id);

const settle = () => act(async () => {
  await new Promise((r) => setTimeout(r, 0));
});

describe('#11370 — « Transcrire » au menu d’un vocal', () => {
  test('un vocal en clair l’offre ; « Transcrire » demande la transcription de CETTE pièce et la greffe sur le fil', async () => {
    const reply: Reply = () => ({ ok: true, data: { transcription: { text: 'On se voit demain', language: 'fr', confidence: 0.9 } } });
    const { api, requests, queryClient } = mount([messageWith([piece('a-voice')])], { reply });
    expect(offered(api)).toContain('transcribe');
    await act(async () => {
      api().onMenuAction('m-1', 'transcribe');
    });
    await settle();
    expect(requests.map((r) => `${r.method} ${r.path}`)).toEqual(['POST /api/v1/attachments/a-voice/transcribe']);
    const grafted = findCachedThreadMessage(queryClient, 'c-a', 'm-1')?.attachments?.[0]?.transcription;
    expect(grafted?.transcribedText).toBe('On se voit demain');
  });

  test('mise en file : le menu l’annonce, le résultat viendra par le temps réel', async () => {
    const { api, announced, queryClient } = mount([messageWith([piece('a-voice')])], { reply: () => ({ ok: true, data: { status: 'processing' } }) });
    await act(async () => {
      api().onMenuAction('m-1', 'transcribe');
    });
    await settle();
    expect(announced).toEqual([translate('fr', 'media.audio.transcribing')]);
    expect(findCachedThreadMessage(queryClient, 'c-a', 'm-1')?.attachments?.[0]?.transcription ?? null).toBeNull();
  });

  test('un refus de la passerelle se dit', async () => {
    const { api, announced } = mount([messageWith([piece('a-voice')])], { reply: () => ({ ok: false, status: 500, error: 'boom' }) });
    await act(async () => {
      api().onMenuAction('m-1', 'transcribe');
    });
    await settle();
    expect(announced.at(-1)).toBe(translate('fr', 'media.audio.transcribe_failed'));
  });

  test('en bout en bout, ni l’entrée ni la requête : le serveur ne lit pas le vocal', async () => {
    const { api, requests } = mount([messageWith([piece('a-voice')])], { conversation: { encryptionMode: 'e2ee' } });
    expect(offered(api)).not.toContain('transcribe');
    await act(async () => {
      api().onMenuAction('m-1', 'transcribe');
    });
    expect(requests).toEqual([]);
  });

  test('un vocal déjà transcrit ne l’offre plus', () => {
    const transcription = { type: 'audio' as const, transcribedText: 'déjà', language: 'fr', confidence: 1, source: 'whisper' as const };
    const { api } = mount([messageWith([piece('a-voice', { transcription })])]);
    expect(offered(api)).not.toContain('transcribe');
  });
});

describe('#11236 — les gestes du TYPE ont un effet', () => {
  test('« Enregistrer le contact » télécharge la carte de CE message', async () => {
    const fetched: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      fetched.push(String(input));
      return new Response(new Blob(['BEGIN:VCARD'], { type: 'text/vcard' }), { status: 200, headers: { 'content-type': 'text/vcard' } });
    }) as typeof fetch;
    sessionStore.setState({
      session: { status: 'authenticated', token: 'jwt', sessionToken: 's', expiresAt: Number.MAX_SAFE_INTEGER, user: { id: 'u-viewer', username: 'moi', displayName: 'Moi' } },
    });
    const card = piece('a-card', { mimeType: 'text/vcard', fileName: 'amina.vcf', originalName: 'amina.vcf' });
    const { api } = mount([messageWith([card])]);
    expect(offered(api)).toContain('saveContact');
    await act(async () => {
      api().onMenuAction('m-1', 'saveContact');
      await new Promise((r) => setTimeout(r, 300));
    });
    expect(fetched).toEqual(['https://cdn.meeshy.me/a-card']);
  });

  test('un sondage n’offre pas « Voir les résultats » tant qu’aucun écran ne les montre (loi 4)', () => {
    const { api } = mount([messageWith([], { content: 'On dîne où ?', metadata: { poll: { question: 'On dîne où ?', options: ['Ici', 'Là'] } } })]);
    expect(api().menuContextOf(messageWith([], { content: 'x', metadata: { poll: { question: 'x' } } })).actions?.groups.primary).toContain('viewResults');
    expect(offered(api)).not.toContain('viewResults');
  });
});

describe('#11373 — le fil qui porte l’avis d’activation ferme le menu', () => {
  test('détail servi « en clair », avis `encryption-enabled` dans le fil : ni Transférer, ni Répondre, et la mention le dit', () => {
    const notice = message({
      id: 'm-notice',
      conversationId: 'c-a',
      senderId: 'p-bob',
      content: '🔒 End-to-end encryption enabled.',
      originalLanguage: 'en',
      messageType: 'system',
      metadata: { kind: 'encryption-enabled', mode: 'e2ee' },
      createdAt: minutesAgo(10),
    });
    const text = messageWith([], { content: 'Bonjour' });
    const { api } = mount([text, notice]);
    const all = offered(api);
    expect(all).not.toContain('forward');
    expect(all).not.toContain('reply');
    expect(all).toContain('e2eeNotice');
  });
});
