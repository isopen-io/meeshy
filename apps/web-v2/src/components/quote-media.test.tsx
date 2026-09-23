import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { attachmentDefaults } from '@/lib/api/fixtures-base';
import type { Attachment, Message } from '@/lib/api/types';
import type { PlacedMessage } from '@/lib/grouping';

import { Bubble } from './bubble';
import { FocalRow } from './focal-row';

/**
 * #7556 — LA CITATION, JUSQU'AU PIXEL.
 *
 * `quoted-preview.test.ts` mesure la RÉSOLUTION ; ce témoin-ci mesure ce que
 * les DEUX peaux PEIGNENT. La distinction n'est pas de confort : la donnée
 * arrivait déjà intacte jusqu'à `replyTo.attachments` (`decode.test.ts`, VERT
 * avant ce lot) et la citation restait VIDE — « suivre une donnée jusqu'à son
 * consommateur s'arrête un cran trop tôt : la suivre jusqu'au PIXEL »
 * (CLAUDE.md § Prisme, cycle 123).
 *
 * Les DEUX peaux, à chaque cas : la bulle (`bubble.tsx`) et la rangée plate
 * (`focal-row.tsx`) montent le MÊME `Quote` et doivent donc lui remettre le
 * MÊME prisme — un hôte qui oublie de le câbler rend une citation en langue
 * d'origine sous une bulle traduite, et rien ne rougirait sans ce témoin.
 */

const BASE: Message = {
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
  createdAt: new Date('2026-09-23T09:00:00.000Z'),
  timestamp: new Date('2026-09-23T09:00:00.000Z'),
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

const attachment = (partial: Partial<Attachment>): Attachment =>
  ({
    ...attachmentDefaults,
    id: 'a-1',
    messageId: 'm-quoted',
    fileName: 'piece.bin',
    originalName: 'piece.bin',
    mimeType: 'application/octet-stream',
    fileSize: 2048,
    fileUrl: 'https://cdn.meeshy.me/piece.bin',
    uploadedBy: 'u-amina',
    createdAt: '2026-09-23T09:00:00.000Z',
    ...partial,
  }) as Attachment;

const placed = (message: Message): PlacedMessage => ({ message, head: true, tail: true, opensDay: null });

/** Le message CITÉ (média sans légende) et la réponse qui le porte. */
const replyTo = (quoted: Message): Message => ({ ...BASE, id: 'm-reply', content: 'Oui', replyToId: quoted.id, replyTo: quoted });

const renderBubble = (message: Message, languages: readonly string[] = ['fr']) =>
  renderToStaticMarkup(
    <Bubble
      place={placed(message)}
      languages={languages}
      isGrouped
      viewerId="u-viewer"
      ephemeralDeadline={{ state: 'none' }}
      onJumpToMessage={() => {}}
      onPickLanguage={() => {}}
    />,
  );

const renderFocal = (message: Message, languages: readonly string[] = ['fr']) =>
  renderToStaticMarkup(
    <FocalRow
      mode="focal"
      place={placed(message)}
      languages={languages}
      viewerId="u-viewer"
      ephemeralDeadline={{ state: 'none' }}
      onJumpToMessage={() => {}}
      onPickLanguage={() => {}}
    />,
  );

/** La citation SEULE, découpée du reste de la rangée — sans quoi une assertion
 *  « le libellé est là » se satisferait du corps du message qui la porte. */
const quoteOf = (html: string): string => {
  const start = html.indexOf('aria-label="Aller au message de Amina Diallo');
  expect(start).toBeGreaterThan(-1);
  const open = html.lastIndexOf('<button', start);
  return html.slice(open, html.indexOf('</button>', start));
};

const SKINS = [
  ['bulle', renderBubble],
  ['rangée plate', renderFocal],
] as const;

const MEDIA = [
  {
    nom: 'photo',
    libelle: 'Photo',
    piece: attachment({
      id: 'a-photo',
      mimeType: 'image/jpeg',
      fileUrl: 'https://cdn.meeshy.me/plage.jpg',
      thumbnailUrl: 'https://cdn.meeshy.me/plage-thumb.jpg',
      width: 1024,
      height: 768,
    }),
    vignette: 'plage-thumb.jpg',
    duree: null,
  },
  {
    nom: 'vidéo',
    libelle: 'Vidéo',
    piece: attachment({
      id: 'a-video',
      mimeType: 'video/mp4',
      fileUrl: 'https://cdn.meeshy.me/sortie.mp4',
      thumbnailUrl: 'https://cdn.meeshy.me/sortie-thumb.jpg',
      duration: 42_000,
    }),
    vignette: 'sortie-thumb.jpg',
    duree: '0:42',
  },
  {
    nom: 'vocal',
    libelle: 'Audio',
    piece: attachment({ id: 'a-vocal', mimeType: 'audio/mp4', fileUrl: 'https://cdn.meeshy.me/note.m4a', duration: 12_000 }),
    vignette: null,
    duree: '0:12',
  },
  {
    nom: 'document',
    libelle: 'Fichier',
    piece: attachment({ id: 'a-doc', mimeType: 'application/pdf', fileUrl: 'https://cdn.meeshy.me/contrat.pdf' }),
    vignette: null,
    duree: null,
  },
] as const;

describe('Quote — répondre à un média SANS légende ne cite plus le vide (#7556)', () => {
  for (const [peau, render] of SKINS) {
    for (const media of MEDIA) {
      test(`${peau} — une ${media.nom} citée dit son genre`, () => {
        const quote = quoteOf(render(replyTo({ ...BASE, id: 'm-quoted', attachments: [media.piece] })));
        expect(quote).toContain(media.libelle);
        expect(quote).toContain(`data-quote-media="${media.piece.mimeType.split('/')[0] === 'application' ? 'file' : media.piece.mimeType.split('/')[0]}"`);
      });

      if (media.duree !== null) {
        test(`${peau} — une ${media.nom} citée dit sa durée`, () => {
          const quote = quoteOf(render(replyTo({ ...BASE, id: 'm-quoted', attachments: [media.piece] })));
          expect(quote).toContain(media.duree);
        });
      }

      if (media.vignette !== null) {
        test(`${peau} — une ${media.nom} citée montre sa vignette`, () => {
          const quote = quoteOf(render(replyTo({ ...BASE, id: 'm-quoted', attachments: [media.piece] })));
          expect(quote).toContain('data-quote-thumb');
          expect(quote).toContain(media.vignette);
        });
      }
    }

    test(`${peau} — l'inventaire rejoint le nom accessible du bouton`, () => {
      const html = render(replyTo({ ...BASE, id: 'm-quoted', attachments: [MEDIA[0].piece] }));
      expect(html).toContain('aria-label="Aller au message de Amina Diallo, 1 image"');
    });
  }
});

/**
 * LE TÉMOIN DE RANG, AU PIXEL — posé sur un rang AUTRE que le premier
 * (leçon 261) : prisme `['de','fr']`, message cité ANGLAIS, traduction
 * FRANÇAISE. Avant ce lot, `Quote` rendait `quote.content` brut, donc
 * « Hello » — sous une bulle dont le bandeau du composeur, lui, affichait
 * « Bonjour ».
 */
describe('Quote — le texte cité porte la langue du lecteur, pas celle de l’expéditeur (#7556)', () => {
  const anglais: Message = {
    ...BASE,
    id: 'm-quoted',
    content: 'Hello',
    originalLanguage: 'en',
    translations: [
      {
        id: 't-fr',
        messageId: 'm-quoted',
        sourceLanguage: 'en',
        targetLanguage: 'fr',
        translatedContent: 'Bonjour',
        translationModel: 'medium',
        createdAt: new Date('2026-09-23T09:00:00.000Z'),
      },
    ],
  };

  for (const [peau, render] of SKINS) {
    test(`${peau} — rang 2 servi : « Bonjour », jamais « Hello »`, () => {
      const quote = quoteOf(render(replyTo(anglais), ['de', 'fr']));
      expect(quote).toContain('Bonjour');
      expect(quote).not.toContain('Hello');
    });

    test(`${peau} — la citation DÉCLARE la langue qu'elle sert`, () => {
      expect(quoteOf(render(replyTo(anglais), ['de', 'fr']))).toContain('lang="fr"');
    });
  }
});

/**
 * UNE CITATION PROTÉGÉE NE MONTRE RIEN — ni vignette, ni durée. La passerelle
 * masque déjà la charge (`servedQuotedMessage.ts`), mais un client qui rend ce
 * qu'il reçoit sans le vérifier rejoue le cycle 125 : quatre gardes justes, et
 * le fichier qui part À CÔTÉ.
 */
describe('Quote — un message cité protégé garde son secret (#7556)', () => {
  const secret: Message = {
    ...BASE,
    id: 'm-quoted',
    content: '👁️ 🖼️',
    isViewOnce: true,
    attachments: [MEDIA[0].piece],
  } as Message;

  for (const [peau, render] of SKINS) {
    test(`${peau} — aucune vignette, aucune URL de média dans la citation`, () => {
      const quote = quoteOf(render(replyTo(secret)));
      expect(quote).not.toContain('plage-thumb.jpg');
      expect(quote).not.toContain('plage.jpg');
      expect(quote).not.toContain('data-quote-thumb');
    });

    test(`${peau} — l'inventaire ne se prononce pas non plus`, () => {
      expect(render(replyTo(secret))).not.toContain('aria-label="Aller au message de Amina Diallo, 1 image"');
    });
  }
});
