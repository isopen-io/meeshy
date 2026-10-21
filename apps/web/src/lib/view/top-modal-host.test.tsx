import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { NotificationToastHost } from '@/components/notification-toast';
import { loadNotificationRowCatalog } from '@/lib/i18n-notification-row-catalog';
import { inAppBannerStore } from '@/lib/notifications/in-app-banner';
import type { NotificationRecord } from '@/lib/notifications/record';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

/**
 * **LA BANNIÈRE IN-APP RESTE TOUCHABLE AU-DESSUS D'UNE FEUILLE MODALE**
 * (#10539). Sous un `<dialog>` ouvert par `showModal()`, tout ce qui n'est pas
 * son descendant est inerte et recouvert : la bannière, portée par `<body>`,
 * ne se voyait ni ne se touchait. Elle vit désormais DANS la modale du dessus,
 * montrée en `popover` — la couche supérieure du navigateur, hors du rognage de
 * la feuille.
 *
 * happy-dom ne connaît ni `dialog:modal` ni l'API Popover : le témoin les lui prête,
 * à la lettre de ce que fait le navigateur (`showModal()` rend le dialogue
 * modal, `close()` le rend ordinaire). Ce qu'il mesure, c'est OÙ la bannière
 * vit ; qu'elle se PEIGNE au-dessus se vérifie au navigateur.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

const modals = new WeakSet<Element>();
const shown: Element[] = [];
type Patched = { showModal: () => void; close: () => void };
let originals: Patched | null = null;
let queryAll: Document['querySelectorAll'] | null = null;

beforeAll(async () => {
  ensureHappyDomRegistered({ url: 'http://localhost/chats' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadNotificationRowCatalog('fr');
  const proto = HTMLDialogElement.prototype as unknown as Patched;
  const { showModal, close } = proto;
  originals = { showModal, close };
  const query = document.querySelectorAll;
  queryAll = query;
  document.querySelectorAll = ((selector: string) =>
    selector === 'dialog:modal'
      ? [...query.call(document, 'dialog')].filter((dialog) => modals.has(dialog) && (dialog as HTMLDialogElement).open)
      : query.call(document, selector)) as Document['querySelectorAll'];
  proto.showModal = function (this: HTMLDialogElement) {
    modals.add(this);
    showModal.call(this);
  };
  proto.close = function (this: HTMLDialogElement) {
    modals.delete(this);
    close.call(this);
  };
  (HTMLElement.prototype as unknown as { showPopover: () => void }).showPopover = function (this: HTMLElement) {
    shown.push(this);
  };
});

afterAll(async () => {
  if (originals !== null) Object.assign(HTMLDialogElement.prototype, originals);
  if (queryAll !== null) document.querySelectorAll = queryAll;
  delete (HTMLElement.prototype as unknown as { showPopover?: () => void }).showPopover;
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const record: NotificationRecord = {
  id: 'n1',
  type: 'new_message',
  title: 'Grace',
  content: 'Tu viens ?',
  actor: { id: 'u-grace', username: 'grace', displayName: 'Grace', avatar: null },
  context: { conversationId: 'c1', conversationTitle: 'Grace', conversationType: 'direct' },
  metadata: {},
  state: { isRead: false, createdAt: '2026-09-30T09:59:58.000Z' },
};

let container: HTMLDivElement | null = null;
let root: Root | null = null;
const dialogs: HTMLDialogElement[] = [];

async function settle(): Promise<void> {
  for (let i = 0; i < 3; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

async function showBanner(): Promise<void> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    inAppBannerStore.setState({ current: record });
    root?.render(<NotificationToastHost />);
  });
  await settle();
}

async function openModal(attributes: Readonly<Record<string, string>> = {}): Promise<HTMLDialogElement> {
  const dialog = document.createElement('dialog');
  Object.entries(attributes).forEach(([name, value]) => dialog.setAttribute(name, value));
  document.body.appendChild(dialog);
  dialogs.push(dialog);
  dialog.showModal();
  await settle();
  return dialog;
}

afterEach(async () => {
  act(() => {
    root?.unmount();
    inAppBannerStore.setState({ current: null });
  });
  container?.remove();
  dialogs.splice(0).forEach((dialog) => dialog.remove());
  shown.length = 0;
  await settle();
});

const banner = (): HTMLElement | null => document.querySelector<HTMLElement>('[data-in-app-banner="n1"]');

describe('la bannière in-app et les feuilles modales', () => {
  test('sans modale : sur `<body>`, hors de la couche supérieure — rien ne change', async () => {
    await showBanner();
    expect(banner()?.parentElement?.parentElement).toBe(document.body);
    expect(banner()?.parentElement?.popover ?? null).toBeNull();
    expect(shown).toHaveLength(0);
  });

  test('une feuille modale s’ouvre : la bannière passe DEDANS, en popover, avec son lien', async () => {
    await showBanner();
    const before = banner();
    const sheet = await openModal();

    expect(sheet.contains(banner())).toBe(true);
    expect(banner()).toBe(before);
    expect(banner()?.parentElement?.popover).toBe('manual');
    expect(shown).toContain(banner()?.parentElement as Element);
    expect(banner()?.querySelector('a[href="/c/c1"]')).not.toBeNull();
  });

  test('la bannière arrive SOUS une modale déjà ouverte : elle naît dedans', async () => {
    const sheet = await openModal();
    await showBanner();
    expect(sheet.contains(banner())).toBe(true);
  });

  test('deux modales : celle du dessus la porte ; refermées, la bannière revient sur `<body>` sans être remontée', async () => {
    await showBanner();
    const before = banner();
    const below = await openModal();
    const above = await openModal();
    expect(above.contains(banner())).toBe(true);

    above.close();
    await settle();
    expect(below.contains(banner())).toBe(true);

    below.close();
    await settle();
    expect(banner()).toBe(before);
    expect(banner()?.parentElement?.parentElement).toBe(document.body);
    expect(banner()?.parentElement?.popover ?? null).toBeNull();
  });

  test('une modale retirée du document sans être refermée ne garde pas la bannière', async () => {
    await showBanner();
    const sheet = await openModal();
    sheet.remove();
    await settle();
    expect(banner()?.isConnected).toBe(true);
    expect(banner()?.parentElement?.parentElement).toBe(document.body);
  });

  test('l’appel tient la couche supérieure : la bannière reste sur `<body>`, sous lui, comme avant', async () => {
    await showBanner();
    await openModal();
    await openModal({ 'data-call-stage': '' });
    expect(banner()?.parentElement?.parentElement).toBe(document.body);
  });
});
