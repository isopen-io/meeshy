import { beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { loadInterfaceCatalog } from '@/lib/i18n-catalog';

import type { MessageSticker } from '@meeshy/shared/types/message-sticker';

import type { Attachment } from '@/lib/api/types';
import { attachmentDefaults } from '@/lib/api/fixtures-base';
import { MEDIA_IMAGE_DATA_URI } from '@/lib/api/fixtures-media';
import type { StoryCitation } from '@/lib/view/message-body';

import { LocationCard, MoodQuote, StickerArtwork, StoryCitationCard } from './message-body-blocks';

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

  test('le glyphe RÉSERVE son encombrement visuel — police 90, AUCUNE boîte fixe plus petite que lui (#7881)', () => {
    const html = renderToStaticMarkup(<StickerArtwork sticker={{ emoji: '🔥' }} picture={undefined} side={160} />);
    expect(html).toContain('font-size:90px');
    /* La boîte 60×60 (`BubbleSticker.emojiBox`) est l'ASSIETTE du mouvement
       côté iOS, jamais un cadre : `MessageStickerArtwork.swift:138-141` pose
       le `Text` en `.fixedSize()`, qui occupe la taille NATURELLE du glyphe.
       Servie comme `width`/`height` CSS, elle laissait un glyphe de 90 px
       déborder de 30 px sur le nom, l'heure ou le sticker voisins. */
    expect(html).not.toContain('width:60px');
    expect(html).not.toContain('height:60px');
    expect(html).not.toContain('width:160px');
    /* La MÊME assiette que l'emoji seul (`EmojiOnly`, interligne 1.1) : la
       ligne du glyphe réserve sa hauteur réelle. */
    expect(html).toContain('line-height:1.1');
  });

  test('la boîte du PNG suit `side`, jamais une cote fixe', () => {
    const html112 = renderToStaticMarkup(<StickerArtwork sticker={{}} picture={picture('a4')} side={112} />);
    expect(html112).toContain('width="112"');
    const html160 = renderToStaticMarkup(<StickerArtwork sticker={{}} picture={picture('a5')} side={160} />);
    expect(html160).toContain('width="160"');
  });
});

describe('LocationCard — le libellé d’action tient AA (défaut majeur 5)', () => {
  /* LE LIBELLÉ VIENT DU CATALOGUE DEPUIS #7328 — il était en dur, en français,
     sur une surface servie en sept langues. La règle de CONTRASTE mesurée ici
     ne change pas ; seule sa source. */
  beforeAll(async () => {
    await loadInterfaceCatalog('fr');
  });

  test('« Ouvrir dans Plans » n’est jamais servi en accent — l’accent de conversation n’est pas un jeton de texte', () => {
    const html = renderToStaticMarkup(
      <LocationCard
        place={{ latitude: 48.85, longitude: 2.29, name: 'Tour Eiffel', address: null }}
        accent="#46bdca"
        language="fr"
      />,
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
    unavailable: false,
  };

  test('le fond de secours mélange l’accent à la SURFACE, jamais à `black`', () => {
    const html = renderToStaticMarkup(
      <StoryCitationCard citation={citation} accent="#46bdca" language="fr" now={new Date('2026-09-10T12:00:00.000Z')} />,
    );
    expect(html).toContain('var(--ios-surface)');
    expect(html).not.toContain(', black)');
  });

  test('le texte de la scène est CENTRÉ', () => {
    const html = renderToStaticMarkup(
      <StoryCitationCard citation={citation} accent="#46bdca" language="fr" now={new Date('2026-09-10T12:00:00.000Z')} />,
    );
    expect(html).toContain('text-center');
    expect(html).toContain('justify-center');
  });

  test('UN SEUL libellé accessible, les enfants sont masqués (aria-hidden) — pas de bouton ⇒ role="group"', () => {
    const html = renderToStaticMarkup(
      <StoryCitationCard citation={citation} accent="#46bdca" language="fr" now={new Date('2026-09-10T12:00:00.000Z')} />,
    );
    expect(html).toContain('role="group"');
    expect(html).toContain('aria-label="réponse à sa story, Coucher de soleil"');
    expect(html).toContain('aria-hidden="true"');
  });

  test('un `onOpen` fourni ⇒ le bouton porte le MÊME libellé', () => {
    const html = renderToStaticMarkup(
      <StoryCitationCard citation={citation} accent="#46bdca" language="fr" now={new Date('2026-09-10T12:00:00.000Z')} onOpen={() => {}} />,
    );
    expect(html).toContain('<button');
    expect(html).toContain('aria-label="réponse à sa story, Coucher de soleil"');
  });

  test('sans aperçu de texte ⇒ « réponse à sa story » seul', () => {
    const html = renderToStaticMarkup(
      <StoryCitationCard
        citation={{ ...citation, previewText: '' }}
        accent="#46bdca"
        language="fr"
        now={new Date('2026-09-10T12:00:00.000Z')}
      />,
    );
    expect(html).toContain('aria-label="réponse à sa story"');
  });

  /* LA SCÈNE N'EST JAMAIS VIDE (#7881) — `MessageModels.swift:905` :
     `previewText.isEmpty ? "📷 Story" : previewText`. Sans aperçu NI
     vignette, la carte web peignait un grand rectangle 9:16 muet. */
  /* LE TEXTE DE SCÈNE SE LIT (#7881) — il n'est peint QUE sur le fond de
     secours (jamais sur une vignette), fond PÂLE en clair (`.story-scene-
     fallback`, 24 % d'accent sur la surface) : du blanc ombré y tombait
     sous 1,5:1. L'encre du thème suit le schéma, clair comme sombre. */
  test('le texte de scène porte l’ENCRE du thème, jamais du blanc sur le fond pâle', () => {
    const html = renderToStaticMarkup(
      <StoryCitationCard citation={citation} accent="#46bdca" language="fr" now={new Date('2026-09-10T12:00:00.000Z')} />,
    );
    expect(html).toContain('color:var(--color-ios-ink)');
    expect(html).not.toContain('text-white');
  });

  test('ni vignette ni aperçu ⇒ la scène DIT ce qu’elle est : « 📷 Story »', () => {
    const html = renderToStaticMarkup(
      <StoryCitationCard citation={{ ...citation, previewText: '' }} accent="#46bdca" language="fr" now={new Date('2026-09-10T12:00:00.000Z')} />,
    );
    expect(html).toContain('📷 Story');
  });

  test('le libellé vient du CATALOGUE — en anglais, « reply to their story », jamais du français', async () => {
    await loadInterfaceCatalog('en');
    const html = renderToStaticMarkup(
      <StoryCitationCard citation={citation} accent="#46bdca" language="en" now={new Date('2026-09-10T12:00:00.000Z')} />,
    );
    expect(html).toContain('reply to their story');
    expect(html).not.toContain('réponse à sa story');
  });

  /* LA STORY DISPARUE (#7881) — la passerelle n'a servi aucun instantané et
     n'a pas retrouvé le post : il n'y a NI scène à montrer NI rien à ouvrir.
     La carte se COMPACTE (pas de 9:16 vide) et le DIT. */
  test('indisponible ⇒ carte compacte, « Story indisponible », aucun geste même si l’hôte en fournit un', () => {
    const html = renderToStaticMarkup(
      <StoryCitationCard
        citation={{ id: 'p9', previewText: '', thumbnailUrl: null, createdAt: '', unavailable: true }}
        accent="#46bdca"
        language="fr"
        now={new Date('2026-09-10T12:00:00.000Z')}
        onOpen={() => {}}
      />,
    );
    expect(html).toContain('Story indisponible');
    expect(html).not.toContain('data-story-scene');
    expect(html).not.toContain('<button');
    expect(html).toContain('aria-label="réponse à sa story, Story indisponible"');
  });
});

describe('MoodQuote — l’humeur citée, dans la peau d’une citation (#7881)', () => {
  const citation = { id: 'p1', emoji: '😴', text: 'Grosse fatigue', authorName: 'Amina Diallo', createdAt: '2026-09-10T08:30:00.000Z' };

  test('emoji, contenu, auteur et date relative — un seul libellé accessible', () => {
    const html = renderToStaticMarkup(
      <MoodQuote citation={citation} isMine={false} language="fr" now={new Date('2026-09-10T10:30:00.000Z')} />,
    );
    expect(html).toContain('data-mood-citation');
    expect(html).toContain('😴');
    expect(html).toContain('Grosse fatigue');
    expect(html).toContain('Amina Diallo');
    expect(html).toContain('2h');
    expect(html).toContain('aria-label="Amina Diallo, 😴 Grosse fatigue"');
  });

  test('snapshot legacy sans auteur ⇒ « Humeur » du catalogue', () => {
    const html = renderToStaticMarkup(
      <MoodQuote citation={{ ...citation, authorName: '' }} isMine={false} language="fr" now={new Date('2026-09-10T10:30:00.000Z')} />,
    );
    expect(html).toContain('Humeur');
  });
});
