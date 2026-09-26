import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { useState } from 'react';

import { attachmentDefaults } from '@/lib/api/fixtures-base';
import type { Attachment, Message } from '@/lib/api/types';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { useLongPress } from '@/lib/view/long-press';
import { messageMenuContextOf, messageMenuItems } from '@/lib/view/message-actions';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { Bubble } from './bubble';
import { FocalRow } from './focal-row';
import { MessageMenu, type MessageMenuTarget } from './message-menu';

/**
 * L'APPUI LONG NE MONTRE PLUS LE CONTENU D'UN MESSAGE PROTÉGÉ (#8008,
 * complément porteur du 2026-09-26) — joué sur les VRAIS hôtes du fil et le
 * VRAI menu du message :
 * - l'aperçu garde la forme protégée, même quand la fenêtre de lecture est
 *   ouverte à l'instant de l'appui ;
 * - l'appui long ne consomme aucune vue unique ;
 * - le menu n'offre ni « Copier » ni « Traduire » ;
 * - les pièces de l'aperçu ont leur proportion d'origine.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadInterfaceCatalog('fr');
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

const SECRET = 'SECRET-APERCU-8008';
const PHOTO_URL = 'https://cdn.test/apercu.jpg';

const message = (partial: Partial<Message>): Message => ({
  id: 'm-apercu',
  conversationId: 'c-apercu',
  senderId: 'u-amina',
  content: SECRET,
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
  translations: [{ id: 't', messageId: 'm-apercu', targetLanguage: 'en', translatedContent: 'SECRET-EN', translationModel: 'medium', createdAt: new Date() }],
  ...partial,
});

const photo = (extra: Partial<Attachment>): Attachment => ({
  ...attachmentDefaults,
  id: 'a-apercu',
  messageId: 'm-apercu',
  fileName: 'apercu.jpg',
  originalName: 'apercu.jpg',
  mimeType: 'image/jpeg',
  fileSize: 2048,
  fileUrl: PHOTO_URL,
  uploadedBy: 'u-amina',
  createdAt: '2026-09-26T09:00:00.000Z',
  ...extra,
});

type Skin = 'script' | 'focal' | 'bulles';
const SKINS: readonly Skin[] = ['script', 'focal', 'bulles'];

function Thread({ skin, subject, onConsume }: { readonly skin: Skin; readonly subject: Message; readonly onConsume: (id: string) => Promise<boolean> }) {
  const [target, setTarget] = useState<MessageMenuTarget | null>(null);
  const longPress = useLongPress({ onOpen: (anchor) => setTarget({ messageId: subject.id, element: anchor.element, isMine: false }) });
  const common = {
    place: { message: subject, head: true, tail: true, opensDay: null },
    languages: ['fr', 'en'],
    viewerId: 'u-viewer',
    ephemeralDeadline: { state: 'none' } as const,
    onJumpToMessage: () => {},
    onPickLanguage: () => {},
    onConsumeViewOnce: onConsume,
  };
  return (
    <div>
      <div data-row={subject.id} tabIndex={0} {...longPress}>
        {skin === 'bulles' ? <Bubble {...common} isGrouped /> : <FocalRow {...common} mode={skin} />}
      </div>
      {target !== null ? (
        <MessageMenu
          target={target}
          items={messageMenuItems(messageMenuContextOf(subject, { now: Date.now() }))}
          choices={[]}
          subjectLabel="Actions du message"
          onClose={() => setTarget(null)}
          onReact={() => {}}
          onExpandReactions={() => {}}
          onAction={() => {}}
          onPickLanguage={() => {}}
        />
      ) : null}
    </div>
  );
}

const mountThread = async (skin: Skin, subject: Message) => {
  const consumed: string[] = [];
  const host = await mounter.mount(
    <Thread
      skin={skin}
      subject={subject}
      onConsume={async (id) => {
        consumed.push(id);
        return true;
      }}
    />,
  );
  return { host, consumed };
};

const openMenu = async (host: HTMLElement) => {
  const row = host.querySelector<HTMLElement>('[data-row]')!;
  row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
  await mounter.settle();
  return document.body.querySelector<HTMLElement>('[data-message-preview]');
};

const menuLabels = () => Array.from(document.querySelectorAll('.message-menu-list [role="menuitem"]')).map((b) => b.textContent);

for (const skin of SKINS) describe(`${skin} — l’aperçu de l’appui long garde la forme protégée`, () => {
  test('flouté au repos : l’aperçu est flouté, ni Copier ni Traduire', async () => {
    const { host } = await mountThread(skin, message({ isBlurred: true }));
    const preview = await openMenu(host);
    expect(preview?.querySelector('[data-protected="hidden"]')).not.toBe(null);
    expect(document.body.innerHTML).not.toContain(SECRET);
    expect(menuLabels()).not.toContain('Copier');
    expect(menuLabels()).not.toContain('Traduire');
  });

  test('flouté PENDANT sa fenêtre de lecture : l’aperçu reprend le flou, jamais le texte', async () => {
    const { host } = await mountThread(skin, message({ isBlurred: true }));
    await mounter.click(host.querySelector<HTMLElement>('button[data-protected="hidden"]'));
    expect(host.querySelector('[data-protected="revealed"]')?.textContent).toContain(SECRET);

    const preview = await openMenu(host);
    expect(preview?.textContent ?? '').not.toContain(SECRET);
    expect(preview?.querySelector('[data-protected="hidden"] [data-surrogate]')).not.toBe(null);
    expect(preview?.querySelector('[hidden]')).toBe(null);
  });

  test('vue unique scellée : l’appui long ne consomme rien, l’aperçu montre la puce', async () => {
    const { host, consumed } = await mountThread(skin, message({ isViewOnce: true }));
    const preview = await openMenu(host);
    expect(consumed).toEqual([]);
    expect(preview?.querySelector('[data-view-once-chip]')).not.toBe(null);
    expect(document.body.innerHTML).not.toContain(SECRET);
  });

  test('vue unique ouverte à l’instant de l’appui : l’aperçu dit « Déjà ouvert », jamais le texte', async () => {
    const { host } = await mountThread(skin, message({ isViewOnce: true }));
    await mounter.click(host.querySelector<HTMLElement>('[data-view-once-chip="sealed"]'));
    expect(host.textContent).toContain(SECRET);

    const preview = await openMenu(host);
    expect(preview?.textContent ?? '').not.toContain(SECRET);
    expect(preview?.querySelector('[data-view-once-chip="opened"]')).not.toBe(null);
  });

  test('média flouté : l’aperçu garde la tuile protégée, à la proportion d’origine, sans URL', async () => {
    const subject = message({ content: '', messageType: 'image', isBlurred: true, attachments: [photo({ isBlurred: true, width: 1200, height: 800 })] });
    const { host } = await mountThread(skin, subject);
    const preview = await openMenu(host);
    const tile = preview?.querySelector<HTMLElement>('[data-protected-attachment="hidden"]');
    expect(tile).not.toBe(null);
    expect(tile?.style.aspectRatio).toBe('1200 / 800');
    expect(document.body.innerHTML).not.toContain(PHOTO_URL);
  });

  test('média flouté SANS dimensions : repli carré', async () => {
    const subject = message({ content: '', messageType: 'image', isBlurred: true, attachments: [photo({ isBlurred: true })] });
    const { host } = await mountThread(skin, subject);
    const preview = await openMenu(host);
    expect(preview?.querySelector<HTMLElement>('[data-protected-attachment="hidden"]')?.style.aspectRatio).toBe('1 / 1');
  });

  test('média ordinaire : l’image de l’aperçu a le rapport de sa pièce et n’est pas rognée', async () => {
    const subject = message({ content: '', messageType: 'image', translations: [], attachments: [photo({ width: 800, height: 1200 })] });
    const { host } = await mountThread(skin, subject);
    const preview = await openMenu(host);
    const figure = preview?.querySelector<HTMLElement>('figure[data-piece-ratio]');
    expect(figure?.style.aspectRatio).toBe('800 / 1200');
    expect(figure?.querySelector<HTMLElement>('img')?.style.objectFit).toBe('contain');
  });
});
