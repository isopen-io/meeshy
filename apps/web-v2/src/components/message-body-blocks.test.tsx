import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import type { MessageSticker } from '@meeshy/shared/types/message-sticker';

import type { Attachment } from '@/lib/api/types';
import { attachmentDefaults } from '@/lib/api/fixtures-base';
import { MEDIA_IMAGE_DATA_URI } from '@/lib/api/fixtures-media';
import type { StoryCitation } from '@/lib/view/message-body';

import { LocationCard, StickerArtwork, StoryCitationCard } from './message-body-blocks';

/**
 * T16 (revue-correction #5936, défaut majeur 6) — `StickerArtwork` en test
 * de COMPOSANT PUR, jamais dans le corpus VIRTUALISÉ de `c-states` : y
 * ajouter un fixture de plus poussait `st-emoji-1` hors de la fenêtre de
 * rendu par défaut du virtualiseur (mesuré : timeout Playwright). Miroir
 * `RenderSource.resolve` (`BubbleSticker.swift:60-75`) — gabarit (hors
 * tranche) → glyphe emoji NATIF (sans gabarit, avec emoji) → PNG joint →
 * emoji de repli.
 */

const picture = (id: string): Attachment => ({
  ...attachmentDefaults,
  id,
  messageId: 'm1',
  fileName: 'sticker.png',
  originalName: 'sticker.png',
  mimeType: 'image/png',
  fileSize: 96,
  fileUrl: MEDIA_IMAGE_DATA_URI,
  width: 1,
  height: 1,
  alt: 'Sticker',
  uploadedBy: 'u1',
  createdAt: new Date('2026-09-10T09:00:00.000Z').toISOString(),
});

describe('StickerArtwork — la priorité de RenderSource.resolve', () => {
  test('SANS gabarit, AVEC emoji ET pièce jointe ⇒ le GLYPHE, jamais le PNG (défaut majeur 6a)', () => {
    const sticker: MessageSticker = { emoji: '🔥' };
    const html = renderToStaticMarkup(<StickerArtwork sticker={sticker} picture={picture('a1')} side={160} />);
    expect(html).toContain('data-sticker-emoji');
    expect(html).toContain('🔥');
    expect(html).not.toContain('<img');
  });

  test('SANS gabarit, SANS emoji, AVEC pièce jointe ⇒ le PNG', () => {
    const sticker: MessageSticker = {};
    const html = renderToStaticMarkup(<StickerArtwork sticker={sticker} picture={picture('a2')} side={160} />);
    expect(html).toContain('<img');
    expect(html).not.toContain('data-sticker-emoji');
  });

  test('un GABARIT (inconnu de web, § 1.4 de la spécification), SANS emoji, AVEC pièce jointe ⇒ le PNG', () => {
    const sticker: MessageSticker = { templateId: 'gabarit-inconnu' };
    const html = renderToStaticMarkup(<StickerArtwork sticker={sticker} picture={picture('a3')} side={160} />);
    expect(html).toContain('<img');
    expect(html).not.toContain('data-sticker-emoji');
  });

  test('aucune pièce jointe ⇒ le glyphe, l’emoji du sticker s’il en a un, sinon le repli générique', () => {
    const withEmoji = renderToStaticMarkup(<StickerArtwork sticker={{ emoji: '🎉' }} picture={undefined} side={160} />);
    expect(withEmoji).toContain('🎉');
    const withoutEmoji = renderToStaticMarkup(<StickerArtwork sticker={{}} picture={undefined} side={160} />);
    expect(withoutEmoji).toContain('🔥');
  });

  test('la BOÎTE (60, `BubbleSticker.emojiBox`) et la POLICE (90, `EmojiOnlyResult.single.fontSize`) sont DEUX cotes distinctes (défaut majeur 6b)', () => {
    const html = renderToStaticMarkup(<StickerArtwork sticker={{ emoji: '🔥' }} picture={undefined} side={160} />);
    expect(html).toContain('width:60px');
    expect(html).toContain('height:60px');
    expect(html).toContain('font-size:90px');
    /* La cote `side` (160, celle du cas PNG) ne doit PAS gouverner la boîte
       du glyphe : un régression qui la réintroduirait ferait remonter cette
       assertion, jamais silencieusement. */
    expect(html).not.toContain('width:160px');
  });

  test('la boîte du PNG suit `side`, jamais une cote fixe', () => {
    const html112 = renderToStaticMarkup(<StickerArtwork sticker={{}} picture={picture('a4')} side={112} />);
    expect(html112).toContain('width="112"');
    const html160 = renderToStaticMarkup(<StickerArtwork sticker={{}} picture={picture('a5')} side={160} />);
    expect(html160).toContain('width="160"');
  });
});

describe('LocationCard — le libellé d’action tient AA (défaut majeur 5)', () => {
  test('« Ouvrir dans Plans » n’est jamais servi en accent — l’accent de conversation n’est pas un jeton de texte', () => {
    const html = renderToStaticMarkup(
      <LocationCard place={{ latitude: 48.85, longitude: 2.29, name: 'Tour Eiffel', address: null }} accent="#46bdca" />,
    );
    expect(html).toContain('Ouvrir dans Plans');
    /* Le GLYPHE reste teinté à l'accent (élément non-textuel, `--color-ios-
       ink)` ne gouverne QUE le mot) — la ligne « Ouvrir dans Plans » ne
       porte JAMAIS l'accent en style de TEXTE. */
    expect(html).toContain('style="color:var(--color-ios-ink)">Ouvrir dans Plans');
    expect(html).not.toContain('style="color:#46bdca">Ouvrir dans Plans');
  });
});

describe('StoryCitationCard — fond pâle, bandeau dans la carte, texte centré, UN libellé (défaut majeur 7 et 8)', () => {
  const citation: StoryCitation = {
    id: 'p-story-1',
    previewText: 'Coucher de soleil',
    thumbnailUrl: null,
    createdAt: '2026-09-10T08:00:00.000Z',
  };

  test('le fond de secours mélange l’accent à la SURFACE, jamais à `black`', () => {
    const html = renderToStaticMarkup(
      <StoryCitationCard citation={citation} accent="#46bdca" now={new Date('2026-09-10T12:00:00.000Z')} />,
    );
    expect(html).toContain('var(--ios-surface)');
    expect(html).not.toContain(', black)');
  });

  test('le texte de la scène est CENTRÉ', () => {
    const html = renderToStaticMarkup(
      <StoryCitationCard citation={citation} accent="#46bdca" now={new Date('2026-09-10T12:00:00.000Z')} />,
    );
    expect(html).toContain('text-center');
    expect(html).toContain('justify-center');
  });

  test('UN SEUL libellé accessible, les enfants sont masqués (aria-hidden) — pas de bouton ⇒ role="group"', () => {
    const html = renderToStaticMarkup(
      <StoryCitationCard citation={citation} accent="#46bdca" now={new Date('2026-09-10T12:00:00.000Z')} />,
    );
    expect(html).toContain('role="group"');
    expect(html).toContain('aria-label="réponse à sa story, Coucher de soleil"');
    expect(html).toContain('aria-hidden="true"');
  });

  test('un `onOpen` fourni ⇒ le bouton porte le MÊME libellé', () => {
    const html = renderToStaticMarkup(
      <StoryCitationCard citation={citation} accent="#46bdca" now={new Date('2026-09-10T12:00:00.000Z')} onOpen={() => {}} />,
    );
    expect(html).toContain('<button');
    expect(html).toContain('aria-label="réponse à sa story, Coucher de soleil"');
  });

  test('sans aperçu de texte ⇒ « réponse à sa story » seul', () => {
    const html = renderToStaticMarkup(
      <StoryCitationCard
        citation={{ ...citation, previewText: '' }}
        accent="#46bdca"
        now={new Date('2026-09-10T12:00:00.000Z')}
      />,
    );
    expect(html).toContain('aria-label="réponse à sa story"');
  });
});
