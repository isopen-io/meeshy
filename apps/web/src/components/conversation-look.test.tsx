import { readFileSync } from 'node:fs';

import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { WORLD_CONVERSATION_IDENTIFIER } from '@meeshy/shared/types/world';

import { attachmentDefaults } from '@/lib/api/fixtures-base';
import type { ConversationFlags } from '@/lib/api/preferences';
import type { Attachment, Conversation, Message } from '@/lib/api/types';
import { authorInk } from '@/lib/view/author-ink';

import { Attachments } from './attachment-blocks';
import { FocalRow } from './focal-row';
import { LensRow } from './lens-row';

/**
 * LA CONVERSATION PLUS VIVANTE, DANS LE DESIGN ACTUEL (#10004) — les SEULS
 * ajouts que le porteur a retenus (commentaire du 2026-10-10 sur l'issue,
 * note « look » de la planche) : la lueur d'accent sous l'en-tête et le
 * composeur, le nom d'auteur teinté par personne en groupe, la pastille de
 * langue sur l'avatar de 22 px, le vocal en carte teintée par l'accent, le
 * fichier texte en carte « TXT », World Wide épinglée en carte. Le reste —
 * verre, rayons, tailles, focal — ne bouge pas.
 */

const BASE_MESSAGE: Message = {
  id: 'm-look',
  conversationId: 'c-look',
  senderId: 'u-kenji',
  content: '誰かポルトガル語のポッドキャストを知っていますか？',
  originalLanguage: 'ja',
  messageType: 'text',
  messageSource: 'user',
  isEdited: false,
  isViewOnce: false,
  maxViewOnceCount: 1,
  viewOnceCount: 0,
  isBlurred: false,
  deliveredCount: 2,
  readCount: 2,
  reactionCount: 0,
  isEncrypted: false,
  createdAt: new Date('2026-10-10T09:41:00.000Z'),
  updatedAt: new Date('2026-10-10T09:41:00.000Z'),
  timestamp: new Date('2026-10-10T09:41:00.000Z'),
  translations: [
    {
      id: 't-look',
      messageId: 'm-look',
      targetLanguage: 'fr',
      translatedContent: 'Quelqu’un connaît un bon podcast pour apprendre le portugais ?',
      translationModel: 'medium',
      createdAt: new Date('2026-10-10T09:41:00.000Z'),
    },
  ],
  sender: {
    id: 'p-kenji',
    conversationId: 'c-look',
    userId: 'u-kenji',
    displayName: 'Kenji',
    type: 'user',
    role: 'member',
    language: 'ja',
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
  },
};

const renderRow = (message: Message, group: boolean) =>
  renderToStaticMarkup(
    <FocalRow
      mode="focal"
      place={{ message, head: true, tail: true, opensDay: null }}
      languages={['fr', 'en']}
      viewerId="u-viewer"
      ephemeralDeadline={{ state: 'none' }}
      onJumpToMessage={() => {}}
      onPickLanguage={() => {}}
      group={group}
    />,
  );

describe('le nom d’auteur teinté par personne, en groupe (#10004)', () => {
  test('en groupe, le nom d’un autre porte SA teinte, stable, dans les deux schémas', () => {
    const html = renderRow(BASE_MESSAGE, true);
    const ink = authorInk({ authorId: 'u-kenji', name: 'Kenji' });
    expect(html).toContain('author-ink');
    expect(html).toContain(`--author-ink-dark:${ink.dark}`);
    expect(html).toContain(`--author-ink-light:${ink.light}`);
  });

  test('en direct, le nom garde l’encre primaire', () => {
    const html = renderRow(BASE_MESSAGE, false);
    expect(html).not.toContain('author-ink');
  });

  test('son propre nom garde l’encre de soi, même en groupe', () => {
    const html = renderRow({ ...BASE_MESSAGE, senderId: 'u-viewer', sender: { ...BASE_MESSAGE.sender!, userId: 'u-viewer' } }, true);
    expect(html).not.toContain('--author-ink-dark');
  });
});

describe('la pastille de langue sur l’avatar de 22 px (#10004)', () => {
  test('une rangée traduite porte la langue d’origine de l’auteur', () => {
    const html = renderRow(BASE_MESSAGE, true);
    expect(html).toContain('data-author-language="JA"');
  });

  test('une rangée servie dans sa langue ne porte aucune pastille', () => {
    const html = renderRow({ ...BASE_MESSAGE, content: 'Bonjour', originalLanguage: 'fr', translations: [] }, true);
    expect(html).not.toContain('data-author-language');
  });
});

const voice: Attachment = {
  ...attachmentDefaults,
  id: 'a-voice',
  messageId: 'm-voice',
  fileName: 'vocal.webm',
  originalName: 'vocal.webm',
  mimeType: 'audio/webm',
  fileSize: 12_000,
  fileUrl: '',
  duration: 18_000,
  uploadedBy: 'u-luiza',
  createdAt: '2026-10-10T09:43:00.000Z',
} as Attachment;

const textFile: Attachment = {
  ...attachmentDefaults,
  id: 'a-txt',
  messageId: 'm-txt',
  fileName: 'lexique.txt',
  originalName: 'lexique-voyage.txt',
  mimeType: 'text/plain',
  fileSize: 4096,
  fileUrl: 'https://example.test/lexique.txt',
  uploadedBy: 'u-omar',
  createdAt: '2026-10-10T09:44:00.000Z',
} as Attachment;

const renderAttachment = (attachment: Attachment) =>
  renderToStaticMarkup(<Attachments attachments={[attachment]} languages={['fr']} fallbackLanguage="fr" mediaFrame="box" />);

describe('le vocal et le fichier texte en cartes (#10004)', () => {
  test('le vocal se pose dans une carte teintée par l’accent', () => {
    expect(renderAttachment(voice)).toContain('data-voice-card');
  });

  test('le fichier texte se pose dans une carte « TXT »', () => {
    const html = renderAttachment(textFile);
    expect(html).toContain('data-file-badge="TXT"');
    expect(html).toContain('lexique-voyage.txt');
  });
});

const FLAGS: ConversationFlags = { isPinned: false, isMuted: false, isArchived: false };
const LANGUAGES: readonly string[] = ['fr'];
const world = {
  id: 'c-world',
  identifier: WORLD_CONVERSATION_IDENTIFIER,
  type: 'global',
  status: 'active',
  visibility: 'public',
  isActive: true,
  memberCount: 120,
  participants: [],
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  unreadCount: 12,
  title: 'World Wide',
  lastMessage: { id: 'm1', content: 'Bonjour', createdAt: new Date('2026-10-10T09:43:00Z') } as never,
  lastMessageAt: new Date('2026-10-10T09:43:00Z'),
} as unknown as Conversation;

describe('World Wide épinglée en carte en tête de liste (#10004)', () => {
  test('la rangée en carte se marque, s’épingle et garde la pastille de non-lus', () => {
    const html = renderToStaticMarkup(
      <LensRow conversation={world} languages={LANGUAGES} viewerId="u-viewer" flags={FLAGS} unreadCount={12} onRowAction={() => {}} card />,
    );
    expect(html).toContain('data-world-card');
    expect(html).toContain('Épinglée');
    expect(html).toContain('12');
  });

  test('l’écran de liste pose la carte au-dessus des sections', () => {
    const source = readFileSync(new URL('../routes/conversations.tsx', import.meta.url).pathname, 'utf8');
    expect(source).toContain('pinWorldWide(');
    expect(source).toMatch(/<LensRow[\s\S]{0,400}\bcard\b/);
  });
});

const css = (file: string): string => readFileSync(new URL(`../styles/${file}`, import.meta.url).pathname, 'utf8');
const ruleOf = (source: string, selector: string): string => {
  const start = source.indexOf(`${selector} {`);
  expect(start).toBeGreaterThanOrEqual(0);
  return source.slice(start, source.indexOf('}', start));
};

describe('la lueur d’accent sous l’en-tête et le composeur (#10004)', () => {
  test('le fond du fil porte la lueur haute et la lueur basse, dans les deux schémas', () => {
    const scene = css('thread-scene.css');
    for (const selector of ['.thread-backdrop', ':root.light .thread-backdrop']) {
      const rule = ruleOf(scene, selector);
      expect(rule).toContain('var(--thread-glow-top)');
      expect(rule).toContain('var(--thread-glow-bottom)');
    }
  });

  test('la lueur se peint DERRIÈRE le fil, jamais en voile par-dessus', () => {
    const rule = ruleOf(css('thread-scene.css'), '.thread-backdrop');
    expect(rule).toContain('z-index: -1');
    expect(rule).toContain('pointer-events: none');
  });

  test('la lueur est teintée par l’accent de la conversation', () => {
    const scene = css('thread-scene.css');
    expect(ruleOf(scene, '.thread-backdrop')).toMatch(/--thread-glow-top:\s*color-mix\(in srgb, var\(--accent\)/);
    expect(ruleOf(scene, ':root.light .thread-backdrop')).toMatch(/--thread-glow-top:\s*color-mix\(in srgb, var\(--accent\)/);
  });
});

describe('les budgets du fil et de la liste (#10004)', () => {
  const budgets = JSON.parse(readFileSync(new URL('../../budgets.json', import.meta.url).pathname, 'utf8')) as {
    on_demand_chunks: Record<string, { pattern: string }>;
  };

  test('la liste a son entrée, bornée sur SON chunk de route', () => {
    const pattern = new RegExp(budgets.on_demand_chunks.conversations?.pattern ?? '^$');
    expect(pattern.test('assets/conversations-AbC_1-9.js')).toBe(true);
    expect(pattern.test('assets/conversation-media-hub-AbC_1-9.js')).toBe(false);
  });

  test('le fil a son entrée, bornée sur SON chunk de route — jamais ses voisins thread-*', () => {
    const pattern = new RegExp(budgets.on_demand_chunks.thread?.pattern ?? '^$');
    expect(pattern.test('assets/thread-AbC_1-9.js')).toBe(true);
    expect(pattern.test('assets/thread-media-viewer-AbC_1-9.js')).toBe(false);
    expect(pattern.test('assets/thread-sheets-AbC_1-9.js')).toBe(false);
  });
});
