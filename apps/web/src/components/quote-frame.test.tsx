import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { attachmentDefaults } from '@/lib/api/fixtures-base';
import type { Attachment, Message } from '@/lib/api/types';
import type { PlacedMessage } from '@/lib/grouping';
import { QUOTED_CARD_WIDTH } from '@/lib/reading-mode/metrics';

import { Bubble } from './bubble';
import { FocalRow } from './focal-row';
import { StoryCitationCard } from './message-body-blocks';

/**
 * #7929 (complément porteur du 2026-09-25) — RÉPONDRE À UNE PIÈCE UNIQUE
 * montre une MINIATURE aussi large que la carte de story (une constante,
 * `QUOTED_CARD_WIDTH`), dont la hauteur suit le rapport d'aspect ORIGINAL du
 * média. Dans les TROIS modes : la bulle et la rangée plate (Script et Focal
 * partagent la même) montent le même `Quote`.
 */

const BASE = {
  id: 'm-base',
  conversationId: 'c-a',
  senderId: 'u-amina',
  content: '',
  originalLanguage: 'fr',
  messageType: 'text',
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
  createdAt: new Date('2026-09-25T09:00:00.000Z'),
  timestamp: new Date('2026-09-25T09:00:00.000Z'),
  sender: {
    id: 'p-amina',
    conversationId: 'c-a',
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
  },
} as Message;

const piece = (partial: Partial<Attachment>): Attachment =>
  ({
    ...attachmentDefaults,
    id: 'a-1',
    messageId: 'm-quoted',
    fileName: 'piece.jpg',
    originalName: 'piece.jpg',
    mimeType: 'image/jpeg',
    fileSize: 2048,
    fileUrl: 'https://cdn.meeshy.me/piece.jpg',
    uploadedBy: 'u-amina',
    createdAt: '2026-09-25T09:00:00.000Z',
    ...partial,
  }) as Attachment;

const replyTo = (attachments: readonly Attachment[]): Message => ({
  ...BASE,
  id: 'm-reply',
  content: 'Oui',
  replyToId: 'm-quoted',
  replyTo: { ...BASE, id: 'm-quoted', attachments: [...attachments] },
});

const placed = (message: Message): PlacedMessage => ({ message, head: true, tail: true, opensDay: null });

const SKINS = [
  [
    'bulles',
    (message: Message) => (
      <Bubble
        place={placed(message)}
        languages={['fr']}
        isGrouped
        viewerId="u-viewer"
        ephemeralDeadline={{ state: 'none' }}
        onJumpToMessage={() => {}}
        onPickLanguage={() => {}}
      />
    ),
  ],
  ...(['script', 'focal'] as const).map(
    (mode) =>
      [
        mode,
        (message: Message) => (
          <FocalRow
            mode={mode}
            place={placed(message)}
            languages={['fr']}
            viewerId="u-viewer"
            ephemeralDeadline={{ state: 'none' }}
            onJumpToMessage={() => {}}
            onPickLanguage={() => {}}
          />
        ),
      ] as const,
  ),
] as const;

const frameOf = (element: ReturnType<(typeof SKINS)[number][1]>) => {
  const host = document.createElement('div');
  host.innerHTML = renderToStaticMarkup(element);
  const frame = host.querySelector<HTMLElement>('button[aria-label^="Aller au message"] [data-quote-frame]');
  return frame === null ? null : { width: frame.style.width, height: frame.style.height, host };
};

const CASES = [
  { nom: 'une image PAYSAGE', piece: piece({ width: 1200, height: 900 }), ratio: 1200 / 900 },
  { nom: 'une image PORTRAIT', piece: piece({ width: 900, height: 1600 }), ratio: 900 / 1600 },
  {
    nom: 'une vidéo',
    piece: piece({ mimeType: 'video/mp4', fileUrl: 'https://cdn.meeshy.me/c.mp4', width: 160, height: 90, duration: 7000 }),
    ratio: 160 / 90,
  },
  { nom: 'une image SANS dimensions (repli carré)', piece: piece({}), ratio: 1 },
] as const;

describe('Quote — la miniature d’une pièce unique citée (#7929)', () => {
  beforeAll(() => {
    ensureHappyDomRegistered();
  });
  afterAll(async () => {
    await releaseHappyDomIfRegistered();
  });

  test('la carte de story et la miniature partagent UNE largeur, celle d’iOS (132)', () => {
    expect(QUOTED_CARD_WIDTH).toBe(132);
    const host = document.createElement('div');
    host.innerHTML = renderToStaticMarkup(
      <StoryCitationCard
        citation={{ id: 'p-1', previewText: 'Coucher de soleil', thumbnailUrl: null, createdAt: '', unavailable: false }}
        accent="var(--accent)"
        language="fr"
        now={new Date('2026-09-25T10:00:00.000Z')}
      />,
    );
    expect(host.querySelector<HTMLElement>('[data-story-scene]')?.style.width).toBe(`${QUOTED_CARD_WIDTH}px`);
  });

  for (const [skin, render] of SKINS) {
    for (const cas of CASES) {
      test(`${skin} — ${cas.nom} : largeur de la carte de story, hauteur au rapport du média`, () => {
        const frame = frameOf(render(replyTo([cas.piece])));
        expect(frame?.width).toBe(`${QUOTED_CARD_WIDTH}px`);
        expect(frame?.height).toBe(`${Math.round(QUOTED_CARD_WIDTH / cas.ratio)}px`);
      });
    }

    test(`${skin} — un carrousel cité en entier garde la petite vignette`, () => {
      const frame = frameOf(render(replyTo([piece({ id: 'a-1', width: 1200, height: 900 }), piece({ id: 'a-2' })])));
      expect(frame).toBeNull();
    });

    test(`${skin} — une pièce protégée ne montre aucun cadre`, () => {
      const frame = frameOf(render(replyTo([piece({ width: 1200, height: 900, isBlurred: true } as Partial<Attachment>)])));
      expect(frame).toBeNull();
    });
  }
});
