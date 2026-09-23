import { useState } from 'react';

import type { MessageSticker } from '@meeshy/shared/types/message-sticker';

import type { Attachment } from '@/lib/api/types';
import { attachmentSrc } from '@/lib/api/media-url';
import { isMediaAbsent, noteMediaAbsent } from '@/lib/api/media-absent';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';
import { EMOJI_ONLY_FONT_SIZES, mapsUrlOf, type SharedPlace, type StoryCitation } from '@/lib/view/message-body';
import { shortRelativeTime } from '@/lib/relative-time';
import { META_TEXT_OPACITY, STICKER_EMOJI_BOX } from '@/lib/reading-mode/metrics';

import { GlyphSvg } from './glyph';
import { THREAD_STATES_GLYPHS } from './glyphs-thread-states';
import { MediaUnavailable } from './media-unavailable';

/**
 * LE CORPS D'UN MESSAGE — sticker, emoji seul, lieu, story citée (#5936).
 * SITE UNIQUE, partagé par les DEUX peaux — comme `attachment-blocks.tsx`
 * l'est pour l'image et le vocal.
 */

/**
 * `BubbleSticker.swift:5-14` : « Ni fond, ni coin, ni bordure : le sticker
 * EST le message, comme un emoji libre. »
 *
 * PRIORITÉ DE RENDU (`RenderSource.resolve`, `BubbleSticker.swift:60-75`,
 * revue-correction #5936, défaut majeur 6a) — gabarit vectoriel (hors
 * tranche, aucun moteur de gabarit côté web, donc jamais résolu ici) →
 * **glyphe emoji NATIF** quand le sticker n'a PAS de gabarit et PORTE un
 * emoji (« net à toute échelle … le PNG n'est que le repli des clients qui
 * ne dessinent pas ») → PNG joint → emoji de repli. Un sticker à la fois
 * SANS gabarit ET avec un emoji ET une pièce jointe rend donc le GLYPHE,
 * jamais l'`<img>` — l'inverse (mesuré en revue) rendait le PNG même quand
 * l'emoji natif était disponible.
 */
export function StickerArtwork({
  sticker,
  picture,
  side,
}: {
  readonly sticker: MessageSticker;
  readonly picture: Attachment | undefined;
  readonly side: number;
}) {
  const alt = sticker.emoji !== undefined ? `Sticker ${sticker.emoji}` : 'Sticker';
  const hasTemplate = sticker.templateId !== undefined && sticker.templateId !== '';

  if (!hasTemplate && sticker.emoji !== undefined && sticker.emoji !== '') {
    return <StickerEmojiGlyph text={sticker.emoji} alt={alt} />;
  }
  if (picture !== undefined && picture.fileUrl !== '') {
    return (
      <img
        alt={alt}
        width={side}
        height={side}
        style={{ objectFit: 'contain' }}
        src={attachmentSrc(picture.fileUrl)}
      />
    );
  }
  /* L'EMOJI DE REPLI — ni gabarit connu ni pièce jointe : le propre emoji du
     sticker s'il en porte un (cas d'un gabarit inconnu de ce binaire), sinon
     un repli générique (`StorySticker.imageFallbackEmoji` côté iOS ; le
     catalogue de replis PAR GABARIT est hors tranche web). */
  return <StickerEmojiGlyph text={sticker.emoji ?? '🔥'} alt={alt} />;
}

/**
 * LE GLYPHE — boîte et police sont DEUX COTES DISTINCTES (revue-correction
 * #5936, défaut majeur 6b) : `STICKER_EMOJI_BOX` (60, `BubbleSticker.
 * emojiBox`) est la BOÎTE (largeur/hauteur), CONSTANTE quel que soit `side`
 * (112 en rangée plate, 160 en bulle — la cote du cas PNG, pas de celui-ci) ;
 * `EMOJI_ONLY_FONT_SIZES.single` (90, `EmojiOnlyResult.single.fontSize`) est
 * la POLICE, volontairement plus grande que la boîte — « la boîte sert
 * d'assiette aux décalages du mouvement », le glyphe déborde. Le défaut
 * précédent servait la boîte à `side` et la police à `STICKER_EMOJI_BOX` :
 * un 🎉 de 60 px flottant au centre d'une case de 160 px.
 */
function StickerEmojiGlyph({ text, alt }: { readonly text: string; readonly alt: string }) {
  return (
    <span
      data-sticker-emoji
      role="img"
      aria-label={alt}
      className="grid place-items-center"
      style={{ width: STICKER_EMOJI_BOX, height: STICKER_EMOJI_BOX, fontSize: EMOJI_ONLY_FONT_SIZES.single }}
    >
      {text}
    </span>
  );
}

/**
 * `FocalRow.emojiBlock` (`:651-656`) : texte ORIGINAL (`message.content`),
 * JAMAIS traduit — un emoji n'a pas de langue, `lang` reste donc ABSENT.
 */
export function EmojiOnly({ text, fontSize }: { readonly text: string; readonly fontSize: number }) {
  return (
    <p data-emoji-only="1" style={{ fontSize, lineHeight: 1.1 }}>
      {text}
    </p>
  );
}

/**
 * `LocationMessageView.swift:51` — pas de tuile de carte ce lot (§ 9 Q6 de
 * la spécification #5936) : un glyphe teinté, le nom, l'adresse, et un lien
 * NOMMÉ qui ouvre Plans sur iOS (redirige vers Google Maps ailleurs). Rayon
 * `--ios-radius-md` (14, `packages/design-tokens/ios.css:68`), déjà dérivé.
 *
 * ## LA BARRE D'INFORMATION N'EXISTE QUE SI ELLE A QUELQUE CHOSE À DIRE
 *
 * `LocationMessageView.swift:55-57` ne monte `locationInfoBar` que si
 * `placeName != nil || address != nil`, et chaque ligne y est conditionnelle.
 * Ici le NOM ne peut pas manquer — il replie sur `message.location.shared`,
 * parce qu'un lien SANS libellé n'est pas atteignable ; l'ADRESSE, elle, reste
 * conditionnelle comme sur iOS. **C'est le cas NOMINAL du web** : sans
 * géocodeur inverse, la tuile « Position » n'envoie que des coordonnées
 * (`send/shared-place.ts`), donc `name`/`address` sont `null` sur tout lieu
 * envoyé depuis cette peau.
 *
 * ## LES TROIS LIBELLÉS VIENNENT DU CATALOGUE (#7328)
 *
 * Ils étaient en dur, en français, sur une surface servie en SEPT langues —
 * un francophone les lisait justes, les six autres lisaient du français.
 * Les valeurs sont celles du catalogue iOS (`location.shared`,
 * `location.fullscreen.openInMaps`, `location.a11y.label`), la référence
 * déclarée de cette bulle.
 */
export function LocationCard({
  place,
  accent,
  language,
}: {
  readonly place: SharedPlace;
  readonly accent: string;
  readonly language: InterfaceLanguage;
}) {
  const label = place.name ?? translate(language, 'message.location.shared');
  return (
    <a
      href={mapsUrlOf(place)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={translate(language, 'message.location.a11y', { place: label })}
      className="mb-1.5 flex w-full max-w-[260px] items-center gap-2 text-left"
      style={{
        borderRadius: 'var(--ios-radius-md)',
        border: '1px solid var(--color-edge)',
        padding: '8px 10px',
        backgroundColor: 'var(--color-ios-card)',
      }}
    >
      <GlyphSvg glyph={THREAD_STATES_GLYPHS.mapPin} size={20} style={{ color: accent, flexShrink: 0 }} />
      <span className="min-w-0 flex flex-col">
        <span className="truncate text-title font-semibold" style={{ color: 'var(--color-ios-ink)' }}>
          {label}
        </span>
        {place.address !== null ? (
          <span className="truncate text-mini" style={{ color: 'var(--color-ios-ink-2)' }}>
            {place.address}
          </span>
        ) : null}
        {/* `--color-ios-ink`, JAMAIS `accent` (revue #5936, défaut majeur 5)
            — l'accent de CONVERSATION n'est pas un jeton de TEXTE : il varie
            par conversation, sans garantie de contraste sur le fond de la
            carte (mesuré 2,10:1). C'est la SEULE affordance qui dit que la
            carte s'ouvre, elle porte donc l'encre la plus lisible. */}
        <span className="text-mini font-semibold" style={{ color: 'var(--color-ios-ink)' }}>
          {translate(language, 'message.location.open')}
        </span>
      </span>
    </a>
  );
}

/**
 * `BubbleStoryCitationCard.swift` — largeur 132, scène en 9:16 (« telle
 * qu'elle était », jamais recadrée), rayon `--ios-radius-lg` (16). La carte
 * SUBSISTE quand la story a expiré ou n'a pas de route (`onOpen ===
 * undefined`) ; le tap n'est armé QUE si l'hôte fournit `onOpen` ET que
 * `citation.id` n'est pas vide (loi 4 — `OpenGesture`, `:331-345`).
 *
 * TROIS ÉCARTS AVEC LA RÉFÉRENCE, CORRIGÉS (revue #5936, défaut majeur 7) —
 * `BubbleStoryCitationCard.swift:100-108/131-133/154/238` :
 * 1. le bandeau est ENFANT de la carte arrondie (`VStack{scene;strip}
 *    .clipShape(…)`), pas un frère SANS fond, à côté d'elle ;
 * 2. le texte de scène est CENTRÉ (`.multilineTextAlignment(.center)`) ;
 * 3. le fond de secours de la scène est une teinte PÂLE (`.story-scene-
 *    fallback`, `thread-system.css`), pas un mélange avec `black`.
 */
const STORY_CARD_WIDTH = 132;
const STORY_SCENE_ASPECT_RATIO = 9 / 16;

/** « réponse à sa story[, <aperçu>] » — le libellé UNIQUE de la carte
 * (revue #5936, défaut majeur 8, miroir `accessibilityLabel`,
 * `BubbleStoryCitationCard.swift:243-250`) : scène et bandeau sont
 * `aria-hidden`, ce libellé seul porte l'information au lecteur d'écran —
 * sans lui, VoiceOver récitait le texte de la scène, « réponse à sa
 * story » puis la date en TROIS arrêts séparés pour une seule chose à
 * comprendre. */
function storyCitationLabel(citation: StoryCitation): string {
  return citation.previewText === '' ? 'réponse à sa story' : `réponse à sa story, ${citation.previewText}`;
}

export function StoryCitationCard({
  citation,
  accent,
  now,
  onOpen,
}: {
  readonly citation: StoryCitation;
  readonly accent: string;
  readonly now: Date;
  readonly onOpen?: (messageId: string) => void;
}) {
  /**
   * Le compteur d'échecs REDEMANDE un rendu ; le verdict, lui, se lit au
   * registre à chaque passage (#7022). Un `errored: boolean` semé au montage
   * porterait le verdict de la citation PRÉCÉDENTE dès que le fil recycle la
   * carte.
   */
  const [, setÉchecs] = useState(0);
  const vignetteSrc = citation.thumbnailUrl === null ? '' : attachmentSrc(citation.thumbnailUrl);
  const vignetteAbsente = vignetteSrc !== '' && isMediaAbsent(vignetteSrc);
  const montreVignette = vignetteSrc !== '' && !vignetteAbsente;

  const relativeDate = citation.createdAt === '' ? '' : shortRelativeTime(new Date(citation.createdAt), now);
  const label = storyCitationLabel(citation);
  const card = (
    <span
      className="block overflow-hidden"
      style={{ width: STORY_CARD_WIDTH, borderRadius: 'var(--ios-radius-lg)' }}
      aria-hidden
    >
      <span
        data-story-scene
        className="story-scene-fallback block"
        style={{
          width: STORY_CARD_WIDTH,
          aspectRatio: `${STORY_CARD_WIDTH} / ${Math.round(STORY_CARD_WIDTH / STORY_SCENE_ASPECT_RATIO)}`,
          /* Le fond TEINTÉ est celui d'une carte SANS scène — une vignette
             morte en est une, au même titre qu'une citation qui n'en a jamais
             porté (#7022). */
          backgroundColor:
            montreVignette === false
              ? `color-mix(in srgb, ${accent} var(--story-scene-fallback-opacity), var(--ios-surface))`
              : undefined,
        }}
      >
        {montreVignette ? (
          /* `onError` (#7022) — LA VIGNETTE MORTE. Cette `<img>` n'avait aucun
             repli : une référence dont les octets ont disparu (8 sur 2912,
             mesurées le 2026-09-18 sur le volume de production) laissait
             l'icône de lien brisé du navigateur au milieu d'une carte de
             citation par ailleurs intacte — l'apparence d'un message corrompu,
             pour un fichier manquant. Le registre est au niveau MODULE : une
             rangée que le virtualiseur remonte ne redemande plus rien. */
          <img
            alt=""
            src={vignetteSrc}
            className="size-full object-cover"
            onError={() => {
              noteMediaAbsent(vignetteSrc);
              setÉchecs((compte) => compte + 1);
            }}
          />
        ) : citation.previewText !== '' ? (
          <span
            className="line-clamp-4 flex size-full items-center justify-center p-2.5 text-center text-title font-semibold text-white"
            style={{ textShadow: '0 1px 3px rgba(0,0,0,0.55)' }}
          >
            {citation.previewText}
          </span>
        ) : vignetteAbsente ? (
          /* NI VIGNETTE NI APERÇU — l'état dessiné, en `compact` : la carte
             fait 120 px de large, le libellé y déborderait. L'ANNONCE reste,
             portée par la boîte (dimension 5).
             Il n'arrive QU'ICI, en dernier : une vignette morte dont la
             citation porte un texte d'aperçu rend le TEXTE. C'est du contenu
             réel, qui existe encore, et il vaut mieux que l'aveu qu'il manque
             une image. */
          <MediaUnavailable language={currentInterfaceLanguage()} tone="on-card" compact />
        ) : null}
      </span>
      <span
        className="flex items-center gap-1 text-mini"
        style={{
          width: STORY_CARD_WIDTH,
          color: 'var(--color-ios-ink-2)',
          opacity: META_TEXT_OPACITY,
          backgroundColor: `color-mix(in srgb, ${accent} var(--ios-bubble-other-opacity), transparent)`,
          padding: '6px 8px',
        }}
      >
        <GlyphSvg glyph={THREAD_STATES_GLYPHS.arrowBendUpLeft} size={11} />
        <span className="flex flex-col">
          <span>réponse à sa story</span>
          {relativeDate !== '' ? <span style={{ opacity: 0.7 }}>{relativeDate}</span> : null}
        </span>
      </span>
    </span>
  );

  const canOpen = onOpen !== undefined && citation.id !== '';
  if (canOpen) {
    return (
      <button
        type="button"
        data-story-citation
        onClick={() => onOpen(citation.id)}
        aria-label={label}
        className="mb-1.5 flex flex-col text-left"
      >
        {card}
      </button>
    );
  }
  return (
    <div data-story-citation role="group" aria-label={label} className="mb-1.5 flex flex-col">
      {card}
    </div>
  );
}
