import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { attachmentDefaults } from '@/lib/api/fixtures-base';
import type { Attachment, Message } from '@/lib/api/types';
import type { PlacedMessage } from '@/lib/grouping';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { Bubble } from './bubble';
import { FocalRow } from './focal-row';

/**
 * TOUCHER UN MESSAGE PROTÉGÉ EN MONTRE LE CONTENU (#8008, demande porteur du
 * 2026-09-26) — la matrice texte ou média × flouté ou vue unique × Script,
 * Focal, Bulles × mien ou reçu × déjà ouvert, jouée sur les VRAIS hôtes du fil.
 *
 * - un TEXTE flouté se montre en clair à sa place ;
 * - un TEXTE à vue unique s'affiche en clair, consommé au toucher ;
 * - un MÉDIA flouté ou à vue unique ouvre DIRECTEMENT la visionneuse plein
 *   écran sur CE média, déflouté — jamais un dévoilement dans la rangée suivi
 *   d'un second toucher. À la fermeture, une vue unique est consommée ;
 * - rien du contenu n'est dans le document avant le toucher.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(() => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const mounter = createActMounter();
afterEach(() => {
  mounter.unmountAll();
  document.body.replaceChildren();
});

const SECRET = 'SECRET-TEXTE-8008';
const PHOTO_URL = 'https://cdn.test/secret-photo.jpg';
const VIDEO_URL = 'https://cdn.test/secret-clip.mp4';

const sender = {
  id: 'p-amina',
  conversationId: 'c-8008',
  userId: 'u-amina',
  displayName: 'Amina Diallo',
  type: 'user',
  role: 'member',
  language: 'fr',
  permissions: {
    canSendMessages: true,
    canSendFiles: true,
    canSendImages: true,
    canSendVideos: true,
    canSendAudios: true,
    canSendLocations: true,
    canSendLinks: true,
  },
  isActive: true,
  joinedAt: new Date('2026-01-01T00:00:00.000Z'),
  isOnline: false,
} as const satisfies Message['sender'];

const messageOf = (partial: Partial<Message>): Message => ({
  id: 'm-8008',
  conversationId: 'c-8008',
  senderId: 'u-amina',
  content: '',
  originalLanguage: 'fr',
  messageType: 'text',
  messageSource: 'user',
  isEdited: false,
  isViewOnce: false,
  maxViewOnceCount: 1,
  viewOnceCount: 0,
  isBlurred: false,
  deliveredCount: 1,
  readCount: 0,
  reactionCount: 0,
  isEncrypted: false,
  createdAt: new Date('2026-09-26T09:00:00.000Z'),
  updatedAt: new Date('2026-09-26T09:00:00.000Z'),
  timestamp: new Date('2026-09-26T09:00:00.000Z'),
  translations: [],
  sender,
  ...partial,
});

const photo = (id: string, extra: Partial<Attachment> = {}): Attachment => ({
  ...attachmentDefaults,
  id,
  messageId: 'm-8008',
  fileName: `${id}.jpg`,
  originalName: `${id}.jpg`,
  mimeType: 'image/jpeg',
  fileSize: 2048,
  fileUrl: `${PHOTO_URL}?${id}`,
  width: 1200,
  height: 800,
  uploadedBy: 'u-amina',
  createdAt: '2026-09-26T09:00:00.000Z',
  ...extra,
});

const clip = (id: string, extra: Partial<Attachment> = {}): Attachment => ({
  ...photo(id),
  mimeType: 'video/mp4',
  fileUrl: VIDEO_URL,
  duration: 7000,
  ...extra,
});

type Skin = 'script' | 'focal' | 'bulles';
const SKINS: readonly Skin[] = ['script', 'focal', 'bulles'];

const place = (message: Message): PlacedMessage => ({ message, head: true, tail: true, opensDay: null });

const mountIn = async (
  skin: Skin,
  message: Message,
  opts: { readonly viewerId?: string; readonly onConsume?: (id: string) => Promise<boolean> } = {},
) => {
  const common = {
    place: place(message),
    languages: ['fr', 'en'],
    viewerId: opts.viewerId ?? 'u-viewer',
    ephemeralDeadline: { state: 'none' } as const,
    onJumpToMessage: () => {},
    onPickLanguage: () => {},
    onConsumeViewOnce: opts.onConsume ?? (async () => true),
  };
  return skin === 'bulles'
    ? mounter.mount(<Bubble {...common} isGrouped />)
    : mounter.mount(<FocalRow {...common} mode={skin} />);
};

const consumeSpy = () => {
  const calls: string[] = [];
  return {
    calls,
    onConsume: async (id: string) => {
      calls.push(id);
      return true;
    },
  };
};

/** Le plein écran est un chunk À LA DEMANDE (`lazy`) : on laisse son module arriver. */
const awaitViewer = async (): Promise<HTMLElement | null> => {
  for (let i = 0; i < 40; i += 1) {
    const dialog = document.body.querySelector<HTMLElement>('[role="dialog"]:not([data-view-once-stage])');
    if (dialog !== null) return dialog;
    await mounter.settle();
  }
  return null;
};

const closeViewer = async () => {
  await mounter.click(document.body.querySelector<HTMLButtonElement>('.media-viewer-close'));
  await mounter.settle();
};

for (const skin of SKINS) describe(`${skin} — un TEXTE protégé`, () => {
  test('flouté : rien au repos ; un toucher le montre EN CLAIR à sa place', async () => {
    const host = await mountIn(skin, messageOf({ content: SECRET, isBlurred: true }));
    expect(document.body.innerHTML).not.toContain(SECRET);

    const veil = host.querySelector<HTMLButtonElement>('button[data-protected="hidden"]');
    expect(veil?.tagName).toBe('BUTTON');
    await mounter.click(veil);

    expect(host.querySelector('[data-protected="revealed"]')?.textContent).toContain(SECRET);
    expect(document.body.querySelector('[role="dialog"]')).toBe(null);
  });

  test('à vue unique : un toucher l’affiche en clair et le consomme', async () => {
    const spy = consumeSpy();
    const host = await mountIn(skin, messageOf({ content: SECRET, isViewOnce: true }), { onConsume: spy.onConsume });
    expect(document.body.innerHTML).not.toContain(SECRET);

    await mounter.click(host.querySelector('[data-view-once-chip="sealed"]'));

    expect(host.textContent).toContain(SECRET);
    expect(spy.calls).toEqual(['m-8008']);
  });

  test('déjà ouvert : la puce ne rouvre rien', async () => {
    const spy = consumeSpy();
    const host = await mountIn(skin, messageOf({ content: SECRET, isViewOnce: true, viewOnceCount: 1 }), { onConsume: spy.onConsume });
    const chip = host.querySelector<HTMLElement>('[data-view-once-chip]');
    expect(chip?.getAttribute('data-view-once-chip')).toBe('opened');
    expect(chip?.tagName).not.toBe('BUTTON');

    await mounter.click(chip);
    expect(document.body.innerHTML).not.toContain(SECRET);
    expect(spy.calls).toEqual([]);
  });
});

for (const skin of SKINS) describe(`${skin} — un MÉDIA flouté ouvre DIRECTEMENT le plein écran`, () => {
  const blurredPhoto = () =>
    messageOf({ messageType: 'image', isBlurred: true, attachments: [photo('a-1', { isBlurred: true })] });

  test('au repos : ni l’URL ni un <img> du média dans le document', async () => {
    const host = await mountIn(skin, blurredPhoto());
    expect(document.body.innerHTML).not.toContain(PHOTO_URL);
    expect(host.querySelector('[data-protected="hidden"]')).not.toBe(null);
  });

  test('un toucher ouvre la visionneuse sur ce média, en clair ; rien n’est dévoilé dans la rangée', async () => {
    const host = await mountIn(skin, blurredPhoto());
    const tile = host.querySelector<HTMLButtonElement>('button[data-protected-attachment="hidden"]');
    expect(tile?.getAttribute('aria-label')).toContain('plein écran');
    await mounter.click(tile);

    const viewer = await awaitViewer();
    expect(viewer?.querySelector('img')?.getAttribute('src')).toContain(PHOTO_URL);
    expect(viewer?.querySelector('[data-protected-attachment]')).toBe(null);
    expect(host.querySelector('[data-protected="revealed"]')).toBe(null);
    expect(host.innerHTML).not.toContain(PHOTO_URL);
  });

  test('fermer la visionneuse rend le voile, et le média quitte le document', async () => {
    const spy = consumeSpy();
    const host = await mountIn(skin, blurredPhoto(), { onConsume: spy.onConsume });
    await mounter.click(host.querySelector('button[data-protected-attachment="hidden"]'));
    await awaitViewer();
    await closeViewer();

    expect(document.body.querySelector('[role="dialog"]')).toBe(null);
    expect(document.body.innerHTML).not.toContain(PHOTO_URL);
    expect(host.querySelector('button[data-protected-attachment="hidden"]')).not.toBe(null);
    expect(spy.calls).toEqual([]);
  });

  test('le MIEN se comporte de même', async () => {
    const host = await mountIn(skin, { ...blurredPhoto(), senderId: 'u-viewer' }, { viewerId: 'u-viewer' });
    expect(document.body.innerHTML).not.toContain(PHOTO_URL);
    await mounter.click(host.querySelector('button[data-protected-attachment="hidden"]'));
    expect((await awaitViewer())?.querySelector('img')?.getAttribute('src')).toContain(PHOTO_URL);
  });

  test('texte ET grille floutés : chaque case ouvre la visionneuse sur ELLE', async () => {
    const message = messageOf({
      content: SECRET,
      isBlurred: true,
      attachments: [photo('a-1', { isBlurred: true }), photo('a-2', { isBlurred: true })],
    });
    const host = await mountIn(skin, message);
    expect(document.body.innerHTML).not.toContain(SECRET);
    const tiles = host.querySelectorAll<HTMLButtonElement>('button[data-protected-attachment="hidden"]');
    expect(tiles.length).toBe(2);

    await mounter.click(tiles[1]!);
    const viewer = await awaitViewer();
    expect(viewer?.getAttribute('aria-label')).toBe('Média 2 sur 2');
    expect(viewer?.innerHTML).toContain('a-2');
  });
});

for (const skin of SKINS) describe(`${skin} — un MÉDIA à vue unique`, () => {
  const viewOnce = (attachment: Attachment) =>
    messageOf({ messageType: 'image', isViewOnce: true, attachments: [{ ...attachment, isViewOnce: true }] });

  test('image : le toucher ouvre la visionneuse ; la FERMETURE consomme et passe à « Déjà ouvert »', async () => {
    const spy = consumeSpy();
    const host = await mountIn(skin, viewOnce(photo('a-1')), { onConsume: spy.onConsume });
    expect(document.body.innerHTML).not.toContain(PHOTO_URL);

    await mounter.click(host.querySelector('[data-view-once-chip="sealed"]'));
    const viewer = await awaitViewer();
    expect(viewer?.querySelector('img')?.getAttribute('src')).toContain(PHOTO_URL);
    expect(spy.calls).toEqual([]);

    await closeViewer();
    expect(spy.calls).toEqual(['m-8008']);
    expect(host.querySelector('[data-view-once-chip]')?.getAttribute('data-view-once-chip')).toBe('opened');
    expect(document.body.innerHTML).not.toContain(PHOTO_URL);
  });

  test('vidéo : le toucher ouvre la visionneuse sur la vidéo', async () => {
    const host = await mountIn(skin, viewOnce(clip('v-1')));
    expect(document.body.innerHTML).not.toContain(VIDEO_URL);
    await mounter.click(host.querySelector('[data-view-once-chip="sealed"]'));
    const viewer = await awaitViewer();
    expect(viewer?.innerHTML).toContain(VIDEO_URL);
  });

  test('déjà ouverte, elle ne se rouvre pas', async () => {
    const spy = consumeSpy();
    const host = await mountIn(skin, { ...viewOnce(photo('a-1')), viewOnceCount: 1 }, { onConsume: spy.onConsume });
    await mounter.click(host.querySelector<HTMLElement>('[data-view-once-chip]'));
    await mounter.settle();
    expect(document.body.querySelector('[role="dialog"]')).toBe(null);
    expect(spy.calls).toEqual([]);
  });
});

for (const skin of SKINS) describe(`${skin} — une CASE protégée dans une grille ordinaire`, () => {
  test('toucher la case masquée ouvre la visionneuse sur CETTE pièce, en clair', async () => {
    const message = messageOf({
      messageType: 'image',
      attachments: [photo('a-1'), photo('a-2', { isBlurred: true }), photo('a-3')],
    });
    const host = await mountIn(skin, message);
    expect(document.body.innerHTML).not.toContain(`${PHOTO_URL}?a-2`);

    await mounter.click(host.querySelector('button[data-protected-attachment="hidden"]'));
    const viewer = await awaitViewer();
    expect(viewer?.getAttribute('aria-label')).toBe('Média 2 sur 3');
    expect(viewer?.querySelector(`img[src*="a-2"]`)).not.toBe(null);
  });
});
