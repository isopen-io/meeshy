import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { attachmentDefaults } from '@/lib/api/fixtures-base';
import type { Attachment, Message } from '@/lib/api/types';
import { useReplyToPreview, type ReplyToPreview } from '@/lib/view/use-reply-preview';

import { Composer } from './composer';
import { Quote } from './message-blocks';

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  await loadInterfaceCatalog('fr');
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const photo = (partial: Partial<Attachment> = {}): Attachment =>
  ({
    ...attachmentDefaults,
    id: 'a-1',
    messageId: 'm-photo',
    fileName: 'plage.jpg',
    originalName: 'plage.jpg',
    mimeType: 'image/jpeg',
    fileSize: 2048,
    fileUrl: 'https://cdn.meeshy.me/plage.jpg',
    thumbnailUrl: 'https://cdn.meeshy.me/plage-thumb.jpg',
    width: 1200,
    height: 900,
    uploadedBy: 'u-amina',
    createdAt: '2026-11-14T09:00:00.000Z',
    ...partial,
  }) as Attachment;

const photoMessage = (partial: Partial<Message> = {}): Message =>
  ({
    id: 'm-photo',
    conversationId: 'c-a',
    senderId: 'u-amina',
    content: '',
    originalLanguage: 'fr',
    messageType: 'image',
    messageSource: 'user',
    isEdited: false,
    isViewOnce: false,
    viewOnceCount: 0,
    isBlurred: false,
    deliveredCount: 0,
    readCount: 0,
    reactionCount: 0,
    isEncrypted: false,
    translations: [],
    createdAt: new Date('2026-11-14T09:00:00.000Z'),
    sender: { displayName: 'Amina Diallo' },
    attachments: [photo()],
    ...partial,
  }) as Message;

const previewOf = (message: Message): ReplyToPreview | undefined => {
  const host = document.createElement('div');
  const root = createRoot(host);
  const captured: ReplyToPreview[] = [];
  function Harness() {
    const preview = useReplyToPreview({ message, readerLanguages: ['fr'] });
    if (preview !== undefined) captured.push(preview);
    return null;
  }
  act(() => root.render(<Harness />));
  act(() => root.unmount());
  return captured[0];
};

const mount = (html: string): HTMLDivElement => {
  const host = document.createElement('div');
  host.innerHTML = html;
  return host;
};

describe('#18392 — la bande de réponse du composeur montre l’image citée', () => {
  test('citer une photo sans légende transmet sa vignette et son genre à la bande', () => {
    const preview = previewOf(photoMessage());
    expect(preview?.excerpt).toBe('Photo');
    expect(preview?.media?.kind).toBe('image');
    expect(preview?.media?.thumbnailSrc).toBe('https://cdn.meeshy.me/plage-thumb.jpg');
  });

  test('une photo à vue unique ne transmet aucune vignette', () => {
    const preview = previewOf(photoMessage({ isViewOnce: true, content: '👁️ 🖼️' }));
    expect(preview?.media).toBeUndefined();
  });

  test('la bande peint la vignette dans une case BORNÉE, recadrée, sous le nom et le libellé', () => {
    const preview = previewOf(photoMessage());
    if (preview === undefined) throw new Error('aucune citation');
    const host = mount(renderToStaticMarkup(<Composer onSend={() => {}} replyTo={preview} />));
    const band = host.querySelector<HTMLElement>('[data-composer-reply]');
    const thumb = band?.querySelector<HTMLElement>('[data-composer-reply-thumb="image"]');
    expect(thumb?.style.width).toBe('40px');
    expect(thumb?.style.height).toBe('40px');
    expect(thumb?.className).toContain('overflow-hidden');
    const img = thumb?.querySelector('img');
    expect(img?.getAttribute('src')).toBe('https://cdn.meeshy.me/plage-thumb.jpg');
    expect(img?.getAttribute('alt')).toBe('');
    expect(img?.className).toContain('object-cover');
    expect(band?.querySelector('[data-composer-reply-glyph="image"]')).not.toBeNull();
    expect(band?.textContent).toContain('Photo');
  });

  test('le nom et l’extrait coulent dans UN paragraphe borné à deux lignes (un extrait long ne déborde plus)', () => {
    const host = mount(
      renderToStaticMarkup(<Composer onSend={() => {}} replyTo={{ author: 'Amina', excerpt: 'Une légende très longue '.repeat(12) }} />),
    );
    const flow = host.querySelector<HTMLElement>('[data-composer-reply] .line-clamp-2');
    expect(flow?.textContent).toContain('Amina');
    expect(flow?.textContent).toContain('Une légende très longue');
    expect(host.querySelector('[data-composer-reply] .truncate')).toBeNull();
  });
});

describe('#18392 — la citation gravée dans la bulle', () => {
  test('le nom et le libellé « Photo » coulent dans le MÊME paragraphe, la miniature dessous', () => {
    const quote = photoMessage() as NonNullable<Message['replyTo']>;
    const host = mount(renderToStaticMarkup(<Quote quote={quote} isMine={false} languages={['fr']} onJump={() => {}} />));
    const flow = host.querySelector<HTMLElement>('[data-quote-jump] .line-clamp-2');
    expect(flow?.textContent).toContain('Amina Diallo');
    expect(flow?.textContent).toContain('Photo');
    const frame = host.querySelector<HTMLElement>('[data-quote-frame="image"]');
    expect(frame?.style.width).toBe('132px');
    expect(frame?.style.height).toBe('99px');
  });
});
