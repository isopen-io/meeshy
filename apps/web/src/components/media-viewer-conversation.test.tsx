import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import type { Attachment } from '@/lib/api/types';
import type { MediaCarrier } from '@/lib/view/media';

import MediaViewer from './media-viewer';

/**
 * **LA VISIONNEUSE FEUILLETTE TOUTE LA CONVERSATION (#6303, #8103).**
 *
 * Ouverte depuis l'écran « Médias, liens et documents », elle reçoit l'index
 * VISUEL de la conversation — des pièces de messages DIFFÉRENTS, paginées. Trois
 * propriétés, chacune avec son témoin : l'auteur et la date suivent la PAGE
 * (`carrierAt`) ; l'hôte est prié d'étendre la liste quand on approche du bout
 * (`onNearEnd`) sans que la page courante bouge ; et une longue liste ne charge
 * que la fenêtre ±1.
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

const photos = (count: number): readonly Attachment[] => Array.from({ length: count }, (_, i) => photo(`p${i}`));

const carrierOf = (name: string): MediaCarrier => ({
  sender: { displayName: name, avatarUrl: null },
  sentAt: '2026-09-20T10:00:00.000Z',
  caption: null,
});

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

let container: HTMLDivElement;
let root: Root;

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

type Props = Parameters<typeof MediaViewer>[0];

function render(props: Props): void {
  act(() => {
    root.render(<MediaViewer {...props} />);
  });
}

function mount(props: Omit<Props, 'onClose' | 'languages' | 'fallbackLanguage'>): (next: Partial<Props>) => void {
  container = document.createElement('div');
  container.id = 'root';
  document.body.appendChild(container);
  root = createRoot(container);
  const base: Props = { ...props, onClose: () => {}, languages: ['fr'], fallbackLanguage: 'fr' };
  render(base);
  return (next) => render({ ...base, ...next });
}

const dialog = (): HTMLElement => document.body.querySelector<HTMLElement>('[data-media-viewer]')!;

const press = (key: string): void => {
  act(() => {
    dialog().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  });
};

describe('MediaViewer — pellicule conversation-entière', () => {
  test('l’auteur du pied suit la PAGE courante, pas la première', () => {
    const names = ['Nour', 'Ali', 'Mia'];
    mount({ items: photos(3), startIndex: 0, carrierAt: (index) => carrierOf(names[index] ?? '') });
    expect(dialog().querySelector('[data-viewer-footer]')?.textContent).toContain('Nour');
    press('ArrowRight');
    expect(dialog().querySelector('[data-viewer-footer]')?.textContent).toContain('Ali');
  });

  test('approcher du bout demande la suite ; la liste étendue garde la page courante', () => {
    const reached: number[] = [];
    const rerender = mount({ items: photos(8), startIndex: 0, onNearEnd: () => reached.push(1) });
    expect(reached).toHaveLength(0);
    press('ArrowRight');
    press('ArrowRight');
    press('ArrowRight');
    press('ArrowRight');
    expect(reached).toHaveLength(0);
    press('ArrowRight');
    expect(reached.length).toBeGreaterThan(0);
    expect(dialog().getAttribute('data-viewer-index')).toBe('5');

    rerender({ items: photos(16), onNearEnd: () => reached.push(1) });
    expect(dialog().getAttribute('data-viewer-index')).toBe('5');
    expect(dialog().getAttribute('aria-label')).toContain('16');
  });

  test('sur une longue liste, seules la page courante et ses deux voisines chargent leurs octets', () => {
    mount({ items: photos(60), startIndex: 30 });
    const images = Array.from(dialog().querySelectorAll<HTMLImageElement>('[data-viewer-page] img'));
    const loaded = images.map((image) => (image.getAttribute('src') ?? '').replace(/^.*\/uploads\//u, ''));
    expect([...loaded].sort()).toEqual(['p29.jpg', 'p30.jpg', 'p31.jpg']);
  });
});
