import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { ActionConversation } from '@meeshy/shared/utils/message-action-policy';

import { message, minutesAgo } from '@/lib/api/fixtures-base';
import type { Message } from '@/lib/api/types';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { loadMessagePiecesCatalog } from '@/lib/i18n-message-pieces-catalog';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { menuViewer } from '@/test-support/menu-viewer';

import type { DeviceTranslationPorts } from './device-translation-request';
import type { MenuViewer } from './message-actions';
import { useMessageMenu } from './use-message-menu';

/**
 * #11210 — LE LECTEUR EST EXPLICITE. Le hook reçoit qui lit (son compte, son
 * rôle de plateforme, son rôle dans la conversation, sa permission d'écrire)
 * et le régime de la conversation ; il n'en déduit plus rien — le compte ne se
 * lit plus dans « peut mettre en favori », la modération ne lui arrive plus en
 * booléen calculé par l'écran.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  await Promise.all([loadInterfaceCatalog('fr'), loadMessagePiecesCatalog('fr')]);
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const row = (overrides: Partial<Message> & { readonly id: string }): Message =>
  message({
    conversationId: 'c-a',
    senderId: 'u-other',
    content: `texte ${overrides.id}`,
    originalLanguage: 'fr',
    translations: [],
    createdAt: minutesAgo(5),
    ...overrides,
  });

const THEIRS = row({ id: 'm-theirs' });
const MINE = row({ id: 'm-mine', senderId: 'u-viewer' });
const FAILED = row({ id: 'cid_failed', senderId: 'u-viewer' });
const LINK = row({ id: 'm-link', content: 'Le programme : https://meeshy.me/programme.' });
const PLACE = row({
  id: 'm-place',
  content: '',
  messageType: 'location',
  metadata: { location: { latitude: 48.8566, longitude: 2.3522, name: 'Hôtel de Ville', address: 'Place de l’Hôtel de Ville, Paris' } },
});
const MESSAGES = [THEIRS, MINE, FAILED, LINK, PLACE];

type MenuApi = ReturnType<typeof useMessageMenu>;

let container: HTMLDivElement;
let root: Root;

afterEach(() => {
  act(() => root.unmount());
  document.body.replaceChildren();
});

function mount(
  options: {
    readonly viewer?: Partial<MenuViewer>;
    readonly conversation?: Partial<ActionConversation>;
    readonly deviceTranslation?: DeviceTranslationPorts;
  } = {},
) {
  const retried: string[] = [];
  const announced: string[] = [];
  const queryClient = new QueryClient();
  let latest!: MenuApi;
  function Harness() {
    latest = useMessageMenu({
      conversationId: 'c-a',
      messages: MESSAGES,
      readerLanguages: ['fr'],
      readerLocale: 'fr-FR',
      viewer: menuViewer(options.viewer),
      conversation: { type: 'group', encryptionMode: null, isActive: true, ...options.conversation },
      reply: { setReplyTarget: () => {}, setReplyToMedia: () => {}, beginEdit: () => {} },
      send: { retry: (id) => retried.push(id), failed: (id) => id === 'cid_failed' },
      announce: (text) => announced.push(text),
      queryClient,
      transport: { request: async () => ({ ok: true, data: null as never }) },
      ...(options.deviceTranslation === undefined ? {} : { deviceTranslation: options.deviceTranslation }),
    });
    return (
      <>
        {MESSAGES.map((m) => (
          <div key={m.id} data-row={m.id} tabIndex={0} {...latest.longPress} />
        ))}
      </>
    );
  }
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() =>
    root.render(
      <QueryClientProvider client={queryClient}>
        <Harness />
      </QueryClientProvider>,
    ),
  );
  const open = (id: string) =>
    act(() => {
      container.querySelector(`[data-row="${id}"]`)?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    });
  return { api: () => latest, open, retried, announced };
}

const ids = (api: MenuApi): readonly string[] => api.menuData?.items.map((item) => item.id) ?? [];

describe('useMessageMenu — le lecteur est explicite', () => {
  test('le compte vient du lecteur : un inscrit épingle et modifie, sans que l’écran dise « favori »', () => {
    const { api } = mount();
    expect(api().pinOf('m-theirs')?.action).toBe('pin');
    expect(api().editOf('m-mine')).not.toBeNull();
  });

  test('un lecteur sans compte n’épingle, ne modifie ni ne supprime rien', () => {
    const { api } = mount({ viewer: { hasAccount: false, isAnonymous: true, platformRole: null } });
    expect(api().pinOf('m-theirs')).toBeNull();
    expect(api().editOf('m-mine')).toBeNull();
    expect(api().deleteOf('m-mine')).toBeNull();
  });

  test('un USER ne retire pas le message d’un autre ; un MODERATOR de plateforme, si', () => {
    const user = mount();
    user.open('m-theirs');
    expect(ids(user.api())).not.toContain('remove');
    act(() => root.unmount());
    const moderator = mount({ viewer: { platformRole: 'MODERATOR' } });
    moderator.open('m-theirs');
    expect(ids(moderator.api())).toContain('remove');
  });

  test('« Retirer » ouvre la demande de motif — rien d’autre ne s’offre dans ce geste', () => {
    const { api, open } = mount({ viewer: { conversationRole: 'admin' } });
    open('m-theirs');
    act(() => api().onMenuAction('m-theirs', 'remove'));
    expect(api().deleteRequest).toEqual({ messageIds: ['m-theirs'], offer: { forEveryone: false, forMe: false, remove: true } });
  });

  test('en bout en bout, mon message ne se modifie pas : il partirait en clair', () => {
    const { api } = mount({ conversation: { encryptionMode: 'e2ee' } });
    expect(api().editOf('m-mine')).toBeNull();
  });

  test('un envoi en échec offre « Réessayer » en tête, et le geste relance cet envoi', () => {
    const { api, open, retried } = mount();
    open('cid_failed');
    expect(ids(api())[0]).toBe('retry');
    act(() => api().onMenuAction('cid_failed', 'retry'));
    expect(retried).toEqual(['cid_failed']);
  });
});

describe('useMessageMenu — les gestes du TYPE', () => {
  let restore = () => {};
  afterEach(() => restore());

  const stubWindow = () => {
    const opened: string[] = [];
    const written: string[] = [];
    const openDescriptor = Object.getOwnPropertyDescriptor(window, 'open');
    const clipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    Object.defineProperty(window, 'open', {
      configurable: true,
      value: (url: string) => {
        opened.push(url);
        return null;
      },
    });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: (text: string) => {
          written.push(text);
          return Promise.resolve();
        },
      },
    });
    restore = () => {
      if (openDescriptor === undefined) delete (window as { open?: unknown }).open;
      else Object.defineProperty(window, 'open', openDescriptor);
      if (clipboard === undefined) delete (navigator as { clipboard?: unknown }).clipboard;
      else Object.defineProperty(navigator, 'clipboard', clipboard);
    };
    return { opened, written };
  };

  test('un lien s’ouvre hors de Meeshy, et se copie avec son annonce', async () => {
    const { opened, written } = stubWindow();
    const { api, open, announced } = mount();
    open('m-link');
    expect(ids(api()).slice(0, 3)).toEqual(['reply', 'openLink', 'copyLink']);
    act(() => api().onMenuAction('m-link', 'openLink'));
    expect(opened).toEqual(['https://meeshy.me/programme']);
    await act(async () => api().onMenuAction('m-link', 'copyLink'));
    await act(async () => new Promise((r) => setTimeout(r, 0)));
    expect(written).toEqual(['https://meeshy.me/programme']);
    expect(announced).toEqual(['Lien copié']);
  });

  test('un lieu s’ouvre dans une carte, et son adresse se copie', async () => {
    const { opened, written } = stubWindow();
    const { api, announced } = mount();
    act(() => api().onMenuAction('m-place', 'openInMaps'));
    expect(opened[0]?.startsWith('https://maps.apple.com/?ll=48.85660,2.35220')).toBe(true);
    await act(async () => api().onMenuAction('m-place', 'copyAddress'));
    await act(async () => new Promise((r) => setTimeout(r, 0)));
    expect(written).toEqual(['Place de l’Hôtel de Ville, Paris']);
    expect(announced).toEqual(['Adresse copiée']);
  });
});

describe('useMessageMenu — « Traduire sur l’appareil » mène à la traduction de l’appareil (#11210, revue)', () => {
  const ports = (granted: boolean) => {
    const offered: { readonly ids: readonly string[]; readonly mode: string | null; readonly viewerId: string; readonly languages: readonly string[] }[] = [];
    const settings: number[] = [];
    const deviceTranslation: DeviceTranslationPorts = {
      granted: async () => granted,
      offer: async (_queryClient, params) => {
        offered.push({
          ids: params.messages.map((m) => m.id),
          mode: params.conversationEncryptionMode,
          viewerId: params.viewerId,
          languages: params.preferredLanguages,
        });
      },
      openSettings: () => settings.push(1),
    };
    return { deviceTranslation, offered, settings };
  };
  const settle = () => act(async () => new Promise((r) => setTimeout(r, 0)));

  test('accordée, l’appareil reçoit CE message, avec le régime de la conversation et le Prisme du lecteur — et le geste le dit', async () => {
    const { deviceTranslation, offered, settings } = ports(true);
    const { api, open, announced } = mount({ conversation: { encryptionMode: 'e2ee' }, deviceTranslation });
    open('m-theirs');
    expect(ids(api())).toContain('translateOnDevice');
    act(() => api().onMenuAction('m-theirs', 'translateOnDevice'));
    await settle();
    expect(offered).toEqual([{ ids: ['m-theirs'], mode: 'e2ee', viewerId: 'u-viewer', languages: ['fr'] }]);
    expect(settings).toEqual([]);
    expect(announced).toEqual(['Traduction demandée à cet appareil']);
  });

  test('sans accord, rien ne se télécharge : le geste mène aux réglages où l’accord se donne, et le dit', async () => {
    const { deviceTranslation, offered, settings } = ports(false);
    const { api, announced } = mount({ conversation: { encryptionMode: 'e2ee' }, deviceTranslation });
    act(() => api().onMenuAction('m-theirs', 'translateOnDevice'));
    await settle();
    expect(offered).toEqual([]);
    expect(settings).toEqual([1]);
    expect(announced).toEqual(['Activez « Traduire sur cet appareil » dans les réglages']);
  });
});
