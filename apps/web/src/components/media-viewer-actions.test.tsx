import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import type { Attachment } from '@/lib/api/types';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { NO_MEDIA_OFFERS, type MediaPageOffers, type MediaViewerPage } from '@/lib/view/media-viewer-actions';

import MediaViewer from './media-viewer';

/**
 * **#6303 — LA VISIONNEUSE DU FIL : UNE PELLICULE QUI GRANDIT SANS PERDRE SA
 * PAGE, ET DES ACTIONS QUI N'EXISTENT QUE SI LA PAGE LES OFFRE.**
 */
const photo = (id: string): Attachment =>
  ({
    id,
    messageId: `m-${id}`,
    fileName: `${id}.jpg`,
    originalName: `${id}.jpg`,
    mimeType: 'image/jpeg',
    fileSize: 4096,
    fileUrl: `/uploads/${id}.jpg`,
    width: 800,
    height: 600,
    uploadedBy: 'u',
    isAnonymous: false,
    isViewOnce: false,
    isBlurred: false,
    createdAt: '2026-09-20T10:00:00.000Z',
  }) as unknown as Attachment;

const photos = (ids: readonly string[]): readonly Attachment[] => ids.map(photo);

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadInterfaceCatalog('fr');
});

afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

let container: HTMLDivElement;
let root: Root;

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

type Props = Parameters<typeof MediaViewer>[0];

function mount(props: Omit<Props, 'onClose' | 'languages' | 'fallbackLanguage'>): (next: Partial<Props>) => void {
  container = document.createElement('div');
  container.id = 'root';
  document.body.appendChild(container);
  root = createRoot(container);
  const base: Props = { ...props, onClose: () => {}, languages: ['fr'], fallbackLanguage: 'fr' };
  const render = (next: Props): void => {
    act(() => {
      root.render(<MediaViewer {...next} />);
    });
  };
  render(base);
  return (next) => render({ ...base, ...next });
}

const dialog = (): HTMLElement => document.body.querySelector<HTMLElement>('[data-media-viewer]')!;

const press = (key: string): void => {
  act(() => {
    dialog().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  });
};

/** Le chunk des actions est chargé à la demande : on laisse `lazy()` se résoudre. */
async function settle(): Promise<void> {
  await act(async () => {
    await import('./viewer-media-actions');
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

const pageOf = (attachment: Attachment, offers: MediaPageOffers, onReply?: () => void): MediaViewerPage => ({
  attachment,
  messageId: '65f0a1b2c3d4e5f6a7b8c9d0',
  conversationId: 'c-a',
  offers,
  ...(onReply === undefined ? {} : { onReply }),
});

describe('MediaViewer — la page se suit par son identité', () => {
  test('des pages plus anciennes arrivent par le DÉBUT : la pièce regardée reste à l’écran', () => {
    const rerender = mount({ items: photos(['c', 'd']), startIndex: 1 });
    expect(dialog().getAttribute('data-viewer-attachment')).toBe('d');

    rerender({ items: photos(['a', 'b', 'c', 'd']) });
    expect(dialog().getAttribute('data-viewer-attachment')).toBe('d');
    expect(dialog().getAttribute('data-viewer-index')).toBe('3');
    expect(dialog().querySelector('[data-filmstrip-item][aria-current="true"]')?.getAttribute('data-attachment')).toBe('d');
  });

  test('approcher du DÉBUT demande les pages plus anciennes', () => {
    const asked: number[] = [];
    mount({ items: photos(['a', 'b', 'c', 'd', 'e', 'f', 'g']), startIndex: 6, onNearStart: () => asked.push(1) });
    expect(asked).toHaveLength(0);
    press('ArrowLeft');
    press('ArrowLeft');
    press('ArrowLeft');
    expect(asked).toHaveLength(0);
    press('ArrowLeft');
    expect(asked.length).toBeGreaterThan(0);
  });
});

describe('MediaViewer — les actions de la page (#6303)', () => {
  const ALL: MediaPageOffers = { save: true, react: true, reply: true, compose: true };

  test('une page qui offre tout : Enregistrer dans « … » en haut, Réagir · Créer en rail, Répondre en capsule', async () => {
    const items = photos(['a']);
    mount({ items, startIndex: 0, actionsAt: () => pageOf(items[0]!, ALL, () => {}) });
    await settle();
    const actions = Array.from(dialog().querySelectorAll('[data-viewer-action]')).map((el) => el.getAttribute('data-viewer-action'));
    expect(actions).toEqual(['react', 'compose']);
    act(() => {
      dialog().querySelector<HTMLButtonElement>('[data-viewer-menu-button]')!.click();
    });
    expect(dialog().querySelector('[data-viewer-menu-item="save"]')?.textContent).toContain('Enregistrer');
    expect(dialog().querySelector('[data-viewer-reply]')?.textContent).toContain('Répondre');
    expect(dialog().querySelector('[data-viewer-action="compose"]')?.getAttribute('aria-label')).toBe('Créer avec ce média');
  });

  test('une page protégée n’offre rien : aucun bouton, aucun chunk demandé', async () => {
    const items = photos(['a']);
    mount({ items, startIndex: 0, actionsAt: () => pageOf(items[0]!, NO_MEDIA_OFFERS) });
    await settle();
    expect(dialog().querySelectorAll('[data-viewer-action]')).toHaveLength(0);
    expect(dialog().querySelector('[data-viewer-rail]') === null).toBe(true);
  });

  test('sans hôte d’actions, la visionneuse reste nue', async () => {
    mount({ items: photos(['a', 'b']), startIndex: 0 });
    await settle();
    expect(dialog().querySelectorAll('[data-viewer-action]')).toHaveLength(0);
  });

  test('« Réagir » ouvre la traînée d’émojis ; « Répondre » remet la main à l’hôte', async () => {
    const items = photos(['a']);
    const replied: number[] = [];
    mount({ items, startIndex: 0, actionsAt: () => pageOf(items[0]!, { ...NO_MEDIA_OFFERS, react: true, reply: true }, () => replied.push(1)) });
    await settle();
    expect(dialog().querySelector('[data-viewer-reactions]')).toBeNull();
    act(() => {
      dialog().querySelector<HTMLButtonElement>('[data-viewer-action="react"]')!.click();
    });
    expect(dialog().querySelectorAll('[data-viewer-reactions] button').length).toBeGreaterThan(0);
    expect(dialog().querySelector('[data-viewer-action="react"]')?.getAttribute('aria-pressed')).toBe('true');
    act(() => {
      dialog().querySelector<HTMLButtonElement>('[data-viewer-reply]')!.click();
    });
    expect(replied).toEqual([1]);
  });

  test('choisir un émoji referme la traînée et rend le focus à « Réagir » ; sans connexion, l’échec est dit', async () => {
    const items = photos(['a']);
    mount({ items, startIndex: 0, actionsAt: () => pageOf(items[0]!, { ...NO_MEDIA_OFFERS, react: true }) });
    await settle();
    act(() => {
      dialog().querySelector<HTMLButtonElement>('[data-viewer-action="react"]')!.click();
    });
    await act(async () => {
      dialog().querySelector<HTMLButtonElement>('[data-viewer-reactions] button')!.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(dialog().querySelector('[data-viewer-reactions]')).toBeNull();
    expect(document.activeElement?.getAttribute('data-viewer-action')).toBe('react');
    expect(dialog().querySelector('[data-viewer-notice="media.viewer.offline"]')?.textContent).toBe('Hors ligne — réessayez une fois connecté');
  });

  test('un tap sur une action ne bascule pas le plateau en plein cadre', async () => {
    const items = photos(['a']);
    mount({ items, startIndex: 0, actionsAt: () => pageOf(items[0]!, { ...NO_MEDIA_OFFERS, react: true }) });
    await settle();
    act(() => {
      dialog().querySelector<HTMLButtonElement>('[data-viewer-action="react"]')!.click();
    });
    expect(dialog().querySelector('[data-viewer-bottom-bar]')?.getAttribute('data-chrome-yields')).toBe('shown');
    expect(dialog().querySelector('[data-viewer-top-bar]')?.getAttribute('data-chrome-yields')).toBe('shown');
  });
});
