import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { BannerDetailFooter } from '@/components/notification-banner-detail';
import { ConversationPreviewSheet } from '@/components/conversation-preview-sheet';
import { TargetLink } from '@/components/notification-row';
import { loadNotificationRowCatalog } from '@/lib/i18n-notification-row-catalog';
import { createRouter, navigate, useParams } from '@/lib/router';
import { openSendSheet, sendSheetStore, type SendSheetRequest } from '@/lib/send/send-sheet-store';
import { closeProfilePeek, peekProfile, registerProfilePeekHost, useProfilePeek } from '@/lib/view/profile-peek';
import { useBackDismiss, type BackDismissOptions } from '@/lib/view/use-back-dismiss';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { conversationPreviewStore, openConversationPreview } from './conversation-preview';
import { openNotificationTarget, previewNotificationConversation } from './open-target';
import { decodeNotification } from './record';
import { listenNotificationTaps, NOTIFICATION_CLICKED_MESSAGE } from './tap-navigation';

/**
 * **OUVRIR UNE CONVERSATION DEPUIS UNE NOTIFICATION REFERME CE QUI LA
 * RECOUVRIRAIT** (#10539, retour porteur 2026-10-13).
 *
 * Story, réels et composer sont des ROUTES : naviguer les démonte, et le
 * premier témoin le garde. Ce qui ne partait PAS, ce sont les couches posées
 * PAR-DESSUS une adresse — et quatre cas les laissaient en place : la même
 * conversation (l'adresse ne change pas, `navigate` ne fait rien), les
 * feuilles de la coquille, les couches de la liste restée montée sur grand
 * écran, et l'aperçu tiré de la bannière, ouvert sous la surface en cours.
 *
 * Les couches de ces témoins sont de VRAIES couches (`useBackDismiss`, le
 * crochet que toute feuille, tout menu et la visionneuse traversent), montées
 * là où la coquille monte les siennes : à côté de l'écran, hors de sa clé.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered({ url: 'http://localhost/chats' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadNotificationRowCatalog('fr');
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

type LayerSpec = { readonly name: string; readonly options?: BackDismissOptions };

const shell: { open: (layer: LayerSpec) => void } = { open: () => undefined };

function Layer({ name, options, onClose }: LayerSpec & { readonly onClose: () => void }) {
  useBackDismiss(onClose, options);
  return <div data-layer={name} />;
}

function ShellLayers() {
  const [layers, setLayers] = useState<readonly LayerSpec[]>([]);
  shell.open = (layer) => setLayers((open) => [...open, layer]);
  return (
    <>
      {layers.map((layer) => (
        <Layer key={layer.name} {...layer} onClose={() => setLayers((open) => open.filter((other) => other.name !== layer.name))} />
      ))}
    </>
  );
}

function ProfilePeekProbe() {
  const username = useProfilePeek();
  return username === null ? null : <div data-profile-peek={username} />;
}

function ThreadStub() {
  const { conversation } = useParams<'/c/$conversation'>();
  return <main data-thread={conversation} />;
}

const TABLE = {
  list: { pattern: '/chats', screen: () => Promise.resolve({ default: () => <ul data-list /> }) },
  story: { pattern: '/story/$post', screen: () => Promise.resolve({ default: () => <div role="dialog" data-story style={{ position: 'fixed', inset: 0, zIndex: 200 }} /> }) },
  thread: { pattern: '/c/$conversation', screen: () => Promise.resolve({ default: ThreadStub }) },
} as const;

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let releaseProfileHost: () => void = () => undefined;

async function settle(): Promise<void> {
  for (let i = 0; i < 5; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

async function mountAt(path: string): Promise<HTMLDivElement> {
  navigate(path, true);
  releaseProfileHost = registerProfilePeekHost();
  const { Router } = createRouter(TABLE, () => null);
  const host = document.createElement('div');
  document.body.appendChild(host);
  container = host;
  root = createRoot(host);
  act(() =>
    root?.render(
      <Router
        wrap={(screen) => (
          <>
            {screen}
            <ShellLayers />
            <ProfilePeekProbe />
            <TargetLink target={{ route: 'thread', params: { conversation: 'c1' } }} className="" style={{}} onClick={() => undefined}>
              Awa
            </TargetLink>
          </>
        )}
        skeleton={<div data-route-pending />}
      />,
    ),
  );
  await settle();
  return host;
}

afterEach(async () => {
  act(() => root?.unmount());
  container?.remove();
  container = null;
  root = null;
  releaseProfileHost();
  closeProfilePeek();
  sendSheetStore.getState().close();
  conversationPreviewStore.setState({ conversationId: null });
  await settle();
  navigate('/chats', true);
});

async function openLayer(layer: LayerSpec): Promise<void> {
  act(() => shell.open(layer));
  await settle();
}

async function open(url: string): Promise<void> {
  act(() => openNotificationTarget(url));
  await settle();
}

const marked = (): boolean => typeof (window.history.state as { backDismiss?: unknown } | null)?.backDismiss === 'string';

const sendRequest = { payload: { kind: 'text', text: 'bonjour' }, intent: 'share' } as unknown as SendSheetRequest;

describe('ouvrir une conversation depuis une notification', () => {
  test('story → notification → le fil est à l’écran, la story n’y est plus', async () => {
    const host = await mountAt('/story/s1');
    expect(host.querySelector('[data-story]')).not.toBeNull();

    await act(async () => {
      host.querySelector<HTMLAnchorElement>('a[href="/c/c1"]')?.click();
    });
    await settle();

    expect(host.querySelector('[data-thread="c1"]')).not.toBeNull();
    expect(host.querySelector('[data-story]')).toBeNull();
  });

  test('MÊME conversation : l’adresse ne change pas, la couche ouverte se referme quand même et rend son entrée', async () => {
    const host = await mountAt('/c/c1');
    await openLayer({ name: 'profil' });
    expect(host.querySelector('[data-layer="profil"]')).not.toBeNull();
    expect(marked()).toBe(true);

    await act(async () => {
      host.querySelector<HTMLAnchorElement>('a[href="/c/c1"]')?.click();
    });
    await settle();

    expect(host.querySelector('[data-layer="profil"]')).toBeNull();
    expect(host.querySelector('[data-thread="c1"]')).not.toBeNull();
    expect(window.location.pathname).toBe('/c/c1');
    expect(marked()).toBe(false);
  });

  test('une feuille de la COQUILLE survit à l’écran : elle se referme, et UN retour ramène à l’écran d’origine sans entrée fantôme', async () => {
    const host = await mountAt('/chats');
    const before = window.history.length;
    await openLayer({ name: 'envoi' });
    expect(window.history.length).toBe(before + 1);

    await open('/c/c1');

    expect(host.querySelector('[data-layer="envoi"]')).toBeNull();
    expect(host.querySelector('[data-thread="c1"]')).not.toBeNull();
    expect(window.history.length).toBe(before + 1);

    await act(async () => {
      window.history.back();
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
    await settle();
    expect(window.location.pathname).toBe('/chats');
    expect(marked()).toBe(false);
    expect(host.querySelector('[data-list]')).not.toBeNull();
    expect(host.querySelector('[data-layer]')).toBeNull();
  });

  test('grand écran : deux couches empilées sur la liste restée montée se referment toutes les deux', async () => {
    const host = await mountAt('/chats');
    await openLayer({ name: 'details' });
    await openLayer({ name: 'fiche' });
    expect(host.querySelectorAll('[data-layer]')).toHaveLength(2);

    await open('/c/c1');

    expect(host.querySelectorAll('[data-layer]')).toHaveLength(0);
    expect(host.querySelector('[data-thread="c1"]')).not.toBeNull();
  });

  test('une couche dont l’ouverture vit dans l’adresse (sans entrée d’historique) se referme aussi', async () => {
    const host = await mountAt('/c/c1');
    await openLayer({ name: 'adressee', options: { history: false } });

    await open('/c/c1');

    expect(host.querySelector('[data-layer="adressee"]')).toBeNull();
  });

  test('les magasins de la coquille se vident : feuille d’envoi, profil, aperçu', async () => {
    const host = await mountAt('/c/c1');
    act(() => {
      openSendSheet(sendRequest);
      peekProfile('awa');
      openConversationPreview('c9');
    });
    expect(host.querySelector('[data-profile-peek="awa"]')).not.toBeNull();

    await open('/c/c1');

    expect(sendSheetStore.getState().request).toBeNull();
    expect(host.querySelector('[data-profile-peek]')).toBeNull();
    expect(conversationPreviewStore.getState().conversationId).toBeNull();
  });

  test('l’appel en cours et la retouche d’un brouillon TIENNENT : une couche `held` ne se referme pas', async () => {
    const host = await mountAt('/c/c1');
    await openLayer({ name: 'appel', options: { held: true } });

    await open('/c/c2');

    expect(host.querySelector('[data-thread="c2"]')).not.toBeNull();
    expect(host.querySelector('[data-layer="appel"]')).not.toBeNull();
  });

  test('la bannière système (service worker) passe par le même site', async () => {
    const host = await mountAt('/c/c1');
    await openLayer({ name: 'visionneuse' });
    const listeners: ((event: { data: unknown }) => void)[] = [];
    listenNotificationTaps({ container: { addEventListener: (_type, listener) => void listeners.push(listener) }, navigate: openNotificationTarget });

    act(() => listeners.forEach((listener) => listener({ data: { type: NOTIFICATION_CLICKED_MESSAGE, url: '/c/c1' } })));
    await settle();

    expect(host.querySelector('[data-layer="visionneuse"]')).toBeNull();
  });

  test('la pilule « Répondre » de la bannière passe par le même site', async () => {
    const host = await mountAt('/chats');
    await openLayer({ name: 'details' });
    const record = decodeNotification({
      id: 'n1',
      type: 'new_message',
      title: 'Awa',
      content: 'Salut',
      actor: { id: 'u-awa', username: 'awa', displayName: 'Awa', avatar: null },
      context: { conversationId: 'c1', conversationType: 'direct', contentDetail: { location: { latitude: 1, longitude: 2, name: 'Ici' } } },
      metadata: {},
      state: { isRead: false, createdAt: '2026-10-01T08:00:00.000Z' },
    });
    if (record === null) throw new Error('notification illisible');
    const pills = document.createElement('div');
    document.body.appendChild(pills);
    const pillsRoot = createRoot(pills);
    act(() => pillsRoot.render(<BannerDetailFooter notification={record} accent="#6366f1" language="fr" onDone={() => undefined} onPlayingChange={() => undefined} />));

    await act(async () => {
      pills.querySelector<HTMLButtonElement>('[data-banner-action="reply"]')?.click();
    });
    await settle();

    expect(host.querySelector('[data-layer="details"]')).toBeNull();
    expect(host.querySelector('[data-thread="c1"]')).not.toBeNull();
    act(() => pillsRoot.unmount());
    pills.remove();
  });
});

describe('tirer l’aperçu depuis la bannière', () => {
  test('referme la surface en cours, et l’aperçu, arrivé plus tard, reprend son entrée d’historique sans être refermé par elle', async () => {
    const host = await mountAt('/chats');
    await openLayer({ name: 'visionneuse' });
    const withLayer = window.history.length;
    /* Un navigateur POSTE la traversée de `history.back()` (HTML, « traverse
       the history by a delta ») ; happy-dom la joue sur-le-champ. Le témoin lui
       rend son délai, sans quoi la fenêtre mesurée n'existe pas. */
    const back = window.history.back;
    window.history.back = () => void setTimeout(() => back.call(window.history), 0);

    act(() => previewNotificationConversation('c1'));
    expect(host.querySelector('[data-layer="visionneuse"]')).toBeNull();
    expect(conversationPreviewStore.getState().conversationId).toBe('c1');

    /* Le chunk de l'aperçu arrive APRÈS le commit qui a refermé la
       visionneuse, et avant qu'un retour rendu par elle n'ait abouti : c'est
       la fenêtre où ce retour refermait l'aperçu à peine ouvert. */
    await Promise.resolve();
    act(() => shell.open({ name: 'apercu' }));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    await settle();

    window.history.back = back;

    expect(host.querySelector('[data-layer="apercu"]')).not.toBeNull();
    expect(window.history.length).toBe(withLayer);
    expect(marked()).toBe(true);
  });

  test('l’aperçu enferme les étages de l’écran recouvert : `#root` isolé tant qu’il vit, même déjà inerte', async () => {
    const appRoot = document.createElement('div');
    appRoot.id = 'root';
    appRoot.setAttribute('inert', '');
    document.body.appendChild(appRoot);
    const host = document.createElement('div');
    document.body.appendChild(host);
    const sheetRoot = createRoot(host);

    act(() =>
      sheetRoot.render(
        <ConversationPreviewSheet conversationId="c1" onClose={() => undefined}>
          <p>fil</p>
        </ConversationPreviewSheet>,
      ),
    );
    await settle();
    expect(appRoot.style.isolation).toBe('isolate');

    act(() => sheetRoot.unmount());
    await settle();
    expect(appRoot.style.isolation).toBe('');
    expect(appRoot.hasAttribute('inert')).toBe(true);
    host.remove();
    appRoot.remove();
  });
});
