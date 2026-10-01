import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import type { Attachment } from '@/lib/api/types';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import type { MediaCarrier } from '@/lib/view/media';
import { NO_MEDIA_OFFERS, type MediaPageOffers, type MediaViewerPage } from '@/lib/view/media-viewer-actions';

import MediaViewer from './media-viewer';

/**
 * **#8879 — LA VISIONNEUSE DE MÉDIAS PORTE LE CHROME COMMUN DES PLEIN ÉCRANS**
 * (`docs/product/visionneuse-plein-ecran.md`) : la croix EN FIN de barre haute,
 * l'auteur et l'heure en haut, « Enregistrer » DANS le menu « … », Réagir et
 * Créer en rail à droite, « Répondre… » en capsule sous la légende — et ce
 * qu'elles déclenchent est l'action EXISTANTE de l'hôte, pas une seconde.
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

const carrier: MediaCarrier = {
  sender: { displayName: 'Nour Haddad', avatarUrl: null },
  sentAt: '2026-09-20T10:13:00.000Z',
  caption: { text: 'Le port au coucher du soleil', language: 'fr', translated: false },
};

const ALL: MediaPageOffers = { save: true, react: true, reply: true, compose: true };

const pageOf = (attachment: Attachment, offers: MediaPageOffers, onReply?: () => void): MediaViewerPage => ({
  attachment,
  messageId: '65f0a1b2c3d4e5f6a7b8c9d0',
  conversationId: 'c-a',
  offers,
  ...(onReply === undefined ? {} : { onReply }),
});

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

async function mount(params: { readonly offers: MediaPageOffers; readonly onReply?: () => void; readonly onClose?: () => void; readonly withCarrier?: boolean }): Promise<HTMLElement> {
  const items = [photo('a'), photo('b')];
  container = document.createElement('div');
  container.id = 'root';
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(
      <MediaViewer
        items={items}
        startIndex={0}
        onClose={params.onClose ?? (() => {})}
        languages={['fr']}
        fallbackLanguage="fr"
        {...(params.withCarrier === false ? {} : { carrier })}
        actionsAt={(index) => pageOf(items[index]!, params.offers, params.onReply)}
      />,
    );
  });
  await act(async () => {
    await import('./viewer-media-actions');
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return document.body.querySelector<HTMLElement>('[data-media-viewer]')!;
}

describe('MediaViewer — le chrome commun des plein écrans (#8879)', () => {
  test('la croix est EN FIN de barre haute, après l’identité de l’auteur (heure comprise)', async () => {
    const dialog = await mount({ offers: ALL, onReply: () => {} });
    const top = dialog.querySelector('[data-viewer-top-bar]')!;
    const identity = top.querySelector('[data-viewer-identity]')!;
    const exit = top.querySelector('[data-viewer-exit="close"]')!;
    expect(identity.textContent).toContain('Nour Haddad');
    expect(identity.querySelector('time[datetime="2026-09-20T10:13:00.000Z"]')).not.toBeNull();
    expect(exit.getAttribute('aria-label')).toBe('Fermer');
    expect(identity.compareDocumentPosition(exit) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  test('l’auteur n’est plus répété dans le pied : le pied garde la ligne de cotes et la légende', async () => {
    const dialog = await mount({ offers: ALL, onReply: () => {} });
    const bottom = dialog.querySelector('[data-viewer-bottom-bar]')!;
    expect(bottom.hasAttribute('data-viewer-footer')).toBe(true);
    expect(bottom.querySelector('[data-viewer-identity]') === null).toBe(true);
    expect(bottom.textContent).not.toContain('Nour Haddad');
    expect(bottom.querySelector('[data-viewer-caption-text]')?.textContent).toBe('Le port au coucher du soleil');
    expect(bottom.textContent).toContain('800 × 600');
  });

  test('toucher la croix appelle le rappel de fermeture de l’hôte', async () => {
    const closed: number[] = [];
    const dialog = await mount({ offers: ALL, onClose: () => closed.push(1) });
    act(() => {
      dialog.querySelector<HTMLButtonElement>('[data-viewer-exit="close"]')!.click();
    });
    expect(closed).toEqual([1]);
  });

  test('« Répondre… » est une capsule sous la légende, et appelle l’action de réponse de l’hôte', async () => {
    const replies: number[] = [];
    const dialog = await mount({ offers: ALL, onReply: () => replies.push(1) });
    const capsule = dialog.querySelector<HTMLButtonElement>('[data-viewer-bottom-bar] [data-viewer-reply]')!;
    expect(capsule.textContent).toContain('Répondre');
    act(() => {
      capsule.click();
    });
    expect(replies).toEqual([1]);
    expect(dialog.querySelector('[data-viewer-action="reply"]')).toBeNull();
  });

  test('un hôte qui ne sait pas répondre n’a pas de capsule (loi 4)', async () => {
    const dialog = await mount({ offers: { ...ALL, reply: false } });
    expect(dialog.querySelector('[data-viewer-reply]')).toBeNull();
  });

  test('Réagir et Créer forment le rail vertical à droite de la légende ; Enregistrer n’y est pas', async () => {
    const dialog = await mount({ offers: ALL, onReply: () => {} });
    const rail = dialog.querySelector('[data-viewer-bottom-bar] [data-viewer-rail]')!;
    const actions = Array.from(rail.querySelectorAll('[data-viewer-action]')).map((el) => el.getAttribute('data-viewer-action'));
    expect(actions).toEqual(['react', 'compose']);
    expect(rail.getAttribute('aria-label')).toBe('Réagir');
  });

  test('« Enregistrer » vit DANS le menu « … » de la barre haute', async () => {
    const dialog = await mount({ offers: ALL, onReply: () => {} });
    const top = dialog.querySelector('[data-viewer-top-bar]')!;
    expect(top.querySelector('[data-viewer-menu-item="save"]')).toBeNull();
    act(() => {
      top.querySelector<HTMLButtonElement>('[data-viewer-menu-button]')!.click();
    });
    const item = top.querySelector('[data-viewer-menu-item="save"]')!;
    expect(item.textContent).toContain('Enregistrer');
  });

  test('une page qui n’offre rien n’a ni menu, ni rail, ni capsule', async () => {
    const dialog = await mount({ offers: NO_MEDIA_OFFERS });
    expect(dialog.querySelector('[data-viewer-menu-button]')).toBeNull();
    expect(dialog.querySelector('[data-viewer-rail]')).toBeNull();
    expect(dialog.querySelector('[data-viewer-reply]')).toBeNull();
  });

  test('UNE seule région vivante annonce les issues, à la racine de la couche', async () => {
    const dialog = await mount({ offers: ALL, onReply: () => {} });
    expect(dialog.querySelectorAll('[role="status"]')).toHaveLength(1);
  });

  test('la pellicule marque la page active d’une bordure de l’encre du média (iOS), les autres d’un filet', async () => {
    const dialog = await mount({ offers: ALL });
    const [active, other] = Array.from(dialog.querySelectorAll<HTMLElement>('[data-filmstrip-item]'));
    expect(active!.getAttribute('style')).toContain('var(--color-on-media)');
    expect(other!.getAttribute('style')).toContain('var(--color-media-hairline)');
  });

  test('un glissé vers le bas au-delà du seuil ferme (le même geste que story et réel)', async () => {
    const closed: number[] = [];
    const dialog = await mount({ offers: ALL, onClose: () => closed.push(1) });
    const stage = dialog.querySelector<HTMLElement>('.media-viewer-track-frame')!;
    const pointer = (type: string, y: number) =>
      new PointerEvent(type, { bubbles: true, cancelable: true, clientX: 100, clientY: y, pointerId: 1, pointerType: 'touch', isPrimary: true });
    act(() => {
      stage.dispatchEvent(pointer('pointerdown', 100));
      stage.dispatchEvent(pointer('pointermove', 280));
      stage.dispatchEvent(pointer('pointerup', 280));
    });
    expect(closed).toEqual([1]);
  });

  test('un toucher qui a glissé ne bascule pas le plein cadre', async () => {
    const dialog = await mount({ offers: ALL });
    const stage = dialog.querySelector<HTMLElement>('.media-viewer-track-frame')!;
    const pointer = (type: string, x: number) =>
      new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: 100, pointerId: 1, pointerType: 'touch', isPrimary: true });
    act(() => {
      stage.dispatchEvent(pointer('pointerdown', 100));
      stage.dispatchEvent(pointer('pointermove', 130));
      stage.dispatchEvent(pointer('pointerup', 130));
      stage.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(dialog.querySelector('[data-viewer-top-bar]')!.getAttribute('data-chrome-yields')).toBe('shown');
  });

  test('un tap sur le plateau fait céder le chrome : barres inertes ET invisibles', async () => {
    const dialog = await mount({ offers: ALL, onReply: () => {} });
    act(() => {
      dialog.querySelector('.media-viewer-track-frame')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    const bars = Array.from(dialog.querySelectorAll<HTMLElement>('[data-viewer-top-bar], [data-viewer-bottom-bar]'));
    expect(bars).toHaveLength(2);
    expect(bars.map((bar) => bar.getAttribute('data-chrome-yields'))).toEqual(['hidden', 'hidden']);
    expect(bars.every((bar) => bar.hasAttribute('inert'))).toBe(true);
  });
});
