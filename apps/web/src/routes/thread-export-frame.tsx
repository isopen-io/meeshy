import { useEffect, useRef } from 'react';

import { CARD_MEDIA_ARRANGEMENTS, CARD_MEDIA_LAYOUTS, type CardMediaArrangement, type CardMediaLayout } from '@/lib/export/message-card-arrangement';
import type { MessageCardFormat, MessageCardToggle } from '@/lib/export/message-card-format';
import { CARD_ASPECTS, CARD_AUTHOR_PLACEMENTS, CARD_HEADER_ORIENTATIONS, CARD_TILTS, type CardAspect, type CardAuthorPlacement, type CardHeaderOrientation, type CardTilt } from '@/lib/export/message-card-frame';
import { CARD_AUDIO_STYLES, type CardAudioStyle } from '@/lib/export/message-card-media';
import type { CardSource } from '@/lib/export/message-card-paint';
import { translateExportCard, type ExportCardCatalogKey } from '@/lib/i18n-export-card-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

import { Group, PRESSED, Pill, REST } from './thread-export-controls';

/**
 * **L'ONGLET « FRAME » ET L'ONGLET « MÉDIAS »** d'« Imagine » (#8693).
 *
 * FRAME, avant « Fond » : le FORMAT de l'image d'abord (Ajusté, Story 9:16,
 * Portrait 4:5, Carré 1:1, Paysage 16:9), puis les dispositions — le titre et
 * la date en ligne, lettre à lettre ou couchés, les noms au-dessus du message
 * ou à sa fin, la rotation du message —, la date et l'heure des messages, et
 * l'ANONYMAT : le pseudo au lieu du nom affiché, ou l'anonymat de chaque bloc.
 * Un réglage sans effet sur CETTE carte ne s'offre pas (loi 4) : l'en-tête ne
 * se couche que s'il existe, l'anonymat de la citation que s'il y en a une.
 *
 * MÉDIAS (#9236) : leur PLACE (au-dessus, en dessous, à gauche, à droite, en
 * fond), leur DISPOSITION (une seule, mosaïque, et les dispositions des posts :
 * en vague, une grande et les autres à côté, en zigzag), le MÉDIA MONTRÉ —
 * choisi par vignettes quand une seule image ou le fond n'en montrent qu'un —,
 * le nom de qui les a postés, et la représentation de l'audio (onde, spectre,
 * pastille, étiquette). Loi 4 : un choix sans effet ne s'offre pas — ni
 * disposition pour un seul visuel ou un fond, ni auteur sur un fond ou pour
 * des médias dont on ne sait pas qui les a postés.
 */

/** Les libellés sans paramètre — tous ceux de ce panneau. */
type PlainKey = Exclude<ExportCardCatalogKey, 'export.card.gallery.count' | 'export.card.media.failed.other' | 'export.card.media.featured.item'>;

export type FrameChoice =
  | { readonly aspect: CardAspect }
  | { readonly header: CardHeaderOrientation }
  | { readonly authorsAt: CardAuthorPlacement }
  | { readonly tilt: CardTilt }
  | { readonly mediaLayout: CardMediaLayout }
  | { readonly mediaArrangement: CardMediaArrangement }
  | { readonly audioStyle: CardAudioStyle };

const ASPECT_LABEL = {
  auto: 'export.card.aspect.auto',
  story: 'export.card.aspect.story',
  portrait: 'export.card.aspect.portrait',
  square: 'export.card.aspect.square',
  landscape: 'export.card.aspect.landscape',
} as const satisfies Readonly<Record<CardAspect, ExportCardCatalogKey>>;

const HEADER_LABEL = {
  horizontal: 'export.card.header.horizontal',
  letters: 'export.card.header.letters',
  up: 'export.card.header.up',
  down: 'export.card.header.down',
} as const satisfies Readonly<Record<CardHeaderOrientation, ExportCardCatalogKey>>;

const AUTHORS_LABEL = {
  top: 'export.card.authorsAt.top',
  end: 'export.card.authorsAt.end',
} as const satisfies Readonly<Record<CardAuthorPlacement, ExportCardCatalogKey>>;

const TILT_LABEL = {
  none: 'export.card.tilt.none',
  left: 'export.card.tilt.left',
  right: 'export.card.tilt.right',
} as const satisfies Readonly<Record<CardTilt, ExportCardCatalogKey>>;

export const MEDIA_LAYOUT_LABEL = {
  above: 'export.card.media.layout.above',
  below: 'export.card.media.layout.below',
  left: 'export.card.media.layout.left',
  right: 'export.card.media.layout.right',
  backdrop: 'export.card.media.layout.backdrop',
} as const satisfies Readonly<Record<CardMediaLayout, ExportCardCatalogKey>>;

export const MEDIA_ARRANGEMENT_LABEL = {
  single: 'export.card.media.single',
  mosaic: 'export.card.media.mosaic',
  wave: 'export.card.media.wave',
  hero: 'export.card.media.hero',
  sine: 'export.card.media.sine',
} as const satisfies Readonly<Record<CardMediaArrangement, ExportCardCatalogKey>>;

export const AUDIO_STYLE_LABEL = {
  onde: 'export.card.audio.onde',
  spectre: 'export.card.audio.spectre',
  pastille: 'export.card.audio.pastille',
  etiquette: 'export.card.audio.etiquette',
} as const satisfies Readonly<Record<CardAudioStyle, ExportCardCatalogKey>>;

export const FRAME_OPTION_LABEL = {
  showDate: 'export.card.option.date',
  showTimes: 'export.card.option.times',
  usePseudonyms: 'export.card.option.pseudonyms',
  anonymizeQuoted: 'export.card.option.anonymizeQuoted',
  anonymizeReply: 'export.card.option.anonymizeReply',
} as const satisfies Readonly<Partial<Record<MessageCardToggle, ExportCardCatalogKey>>>;

export function FramePanel({
  language,
  format,
  hasHeader,
  hasQuote,
  onChoice,
  onToggle,
}: {
  readonly language: InterfaceLanguage;
  readonly format: MessageCardFormat;
  /** Un titre ou une date est peint : l'en-tête peut se coucher. */
  readonly hasHeader: boolean;
  readonly hasQuote: boolean;
  readonly onChoice: (choice: FrameChoice) => void;
  readonly onToggle: (toggle: MessageCardToggle) => void;
}) {
  const t = (key: PlainKey) => translateExportCard(language, key);
  const named = format.showAuthors || format.showTimes;
  const anonymity: readonly ('usePseudonyms' | 'anonymizeQuoted' | 'anonymizeReply')[] = format.showAuthors
    ? ['usePseudonyms', ...(hasQuote ? (['anonymizeQuoted'] as const) : []), 'anonymizeReply']
    : [];
  return (
    <div className="flex w-full flex-col gap-3" data-export-frame="">
      <Group label={t('export.card.aspect')} exclusive data={{ 'data-export-group': 'aspect' }}>
        {CARD_ASPECTS.map((aspect) => (
          <Pill key={aspect} role="radio" pressed={format.aspect === aspect} onClick={() => onChoice({ aspect })} data={{ 'data-export-aspect': aspect }}>
            {t(ASPECT_LABEL[aspect])}
          </Pill>
        ))}
      </Group>
      {hasHeader ? (
        <Group label={t('export.card.header')} exclusive data={{ 'data-export-group': 'header' }}>
          {CARD_HEADER_ORIENTATIONS.map((header) => (
            <Pill key={header} role="radio" pressed={format.header === header} onClick={() => onChoice({ header })} data={{ 'data-export-header': header }}>
              {t(HEADER_LABEL[header])}
            </Pill>
          ))}
        </Group>
      ) : null}
      <Group label={t('export.card.options')}>
        {(['showDate', 'showTimes'] as const).map((option) => (
          <Pill key={option} pressed={format[option]} onClick={() => onToggle(option)} data={{ 'data-export-option': option }}>
            {t(FRAME_OPTION_LABEL[option])}
          </Pill>
        ))}
      </Group>
      {named ? (
        <Group label={t('export.card.authorsAt')} exclusive data={{ 'data-export-group': 'authorsAt' }}>
          {CARD_AUTHOR_PLACEMENTS.map((authorsAt) => (
            <Pill key={authorsAt} role="radio" pressed={format.authorsAt === authorsAt} onClick={() => onChoice({ authorsAt })} data={{ 'data-export-authors-at': authorsAt }}>
              {t(AUTHORS_LABEL[authorsAt])}
            </Pill>
          ))}
        </Group>
      ) : null}
      <Group label={t('export.card.tilt')} exclusive data={{ 'data-export-group': 'tilt' }}>
        {CARD_TILTS.map((tilt) => (
          <Pill key={tilt} role="radio" pressed={format.tilt === tilt} onClick={() => onChoice({ tilt })} data={{ 'data-export-tilt': tilt }}>
            {t(TILT_LABEL[tilt])}
          </Pill>
        ))}
      </Group>
      {anonymity.length === 0 ? null : (
        <Group label={t('export.card.anonymity')}>
          {anonymity.map((option) => (
            <Pill key={option} pressed={format[option]} onClick={() => onToggle(option)} data={{ 'data-export-option': option }}>
              {t(FRAME_OPTION_LABEL[option])}
            </Pill>
          ))}
        </Group>
      )}
    </div>
  );
}

/** Un visuel qu'on peut montrer seul : son identifiant et ses pixels, quand ils sont arrivés. */
export type VisualChoice = { readonly id: string; readonly source: CardSource | null };

const THUMB = 56;

const pixelSize = (source: CardSource): { readonly width: number; readonly height: number } => {
  const numeric = (value: unknown): number => (typeof value === 'number' ? value : 0);
  return {
    width: numeric(source.videoWidth) > 0 ? numeric(source.videoWidth) : numeric(source.width),
    height: numeric(source.videoHeight) > 0 ? numeric(source.videoHeight) : numeric(source.height),
  };
};

/** La vignette d'un visuel, peinte depuis les pixels déjà décodés pour la carte — aucun second téléchargement. */
function VisualThumb({ source }: { readonly source: CardSource | null }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const element = canvas.current;
    if (element === null || source === null) return;
    const ctx = (() => {
      try {
        return element.getContext('2d');
      } catch {
        return null;
      }
    })();
    const size = pixelSize(source);
    if (ctx === null || size.width <= 0 || size.height <= 0) return;
    const scale = Math.max(element.width / size.width, element.height / size.height);
    ctx.drawImage(source, (element.width - size.width * scale) / 2, (element.height - size.height * scale) / 2, size.width * scale, size.height * scale);
  }, [source]);
  return <canvas ref={canvas} width={THUMB * 2} height={THUMB * 2} aria-hidden="true" className="block rounded-field" style={{ width: THUMB, height: THUMB, backgroundColor: REST.backgroundColor }} />;
}

export function MediaPanel({
  language,
  format,
  visuals,
  featured,
  hasAudio,
  hasMediaAuthors,
  onChoice,
  onToggle,
  onFeatured,
}: {
  readonly language: InterfaceLanguage;
  readonly format: MessageCardFormat;
  /** Les visuels de la carte, dans leur ordre. */
  readonly visuals: readonly VisualChoice[];
  /** Le visuel que « une seule » et « en fond » montrent. */
  readonly featured: string | null;
  readonly hasAudio: boolean;
  /** Un visuel au moins dit qui l'a posté : « Auteur du média » n'existe qu'alors. */
  readonly hasMediaAuthors: boolean;
  readonly onChoice: (choice: FrameChoice) => void;
  readonly onToggle: (toggle: MessageCardToggle) => void;
  readonly onFeatured: (id: string) => void;
}) {
  const t = (key: PlainKey) => translateExportCard(language, key);
  const many = visuals.length > 1;
  const backdrop = format.mediaLayout === 'backdrop';
  const choosing = many && (backdrop || format.mediaArrangement === 'single');
  return (
    <div className="flex w-full flex-col gap-3" data-export-media-panel="">
      {visuals.length > 0 ? (
        <Group label={t('export.card.media.layout')} exclusive data={{ 'data-export-group': 'mediaLayout' }}>
          {CARD_MEDIA_LAYOUTS.map((mediaLayout) => (
            <Pill key={mediaLayout} role="radio" pressed={format.mediaLayout === mediaLayout} onClick={() => onChoice({ mediaLayout })} data={{ 'data-export-media-layout': mediaLayout }}>
              {t(MEDIA_LAYOUT_LABEL[mediaLayout])}
            </Pill>
          ))}
        </Group>
      ) : null}
      {many && !backdrop ? (
        <Group label={t('export.card.media.style')} exclusive data={{ 'data-export-group': 'mediaArrangement' }}>
          {CARD_MEDIA_ARRANGEMENTS.map((mediaArrangement) => (
            <Pill
              key={mediaArrangement}
              role="radio"
              pressed={format.mediaArrangement === mediaArrangement}
              onClick={() => onChoice({ mediaArrangement })}
              data={{ 'data-export-media-arrangement': mediaArrangement }}
            >
              {t(MEDIA_ARRANGEMENT_LABEL[mediaArrangement])}
            </Pill>
          ))}
        </Group>
      ) : null}
      {choosing ? (
        <div role="radiogroup" aria-label={t('export.card.media.featured')} data-export-group="featured" className="flex w-full flex-col gap-1.5">
          <p aria-hidden="true" className="text-[11px] font-bold uppercase tracking-wide" style={{ color: 'var(--color-ios-ink-2)' }}>
            {t('export.card.media.featured')}
          </p>
          <div className="flex gap-2 overflow-x-auto">
            {visuals.map((visual, index) => (
              <button
                key={visual.id}
                type="button"
                role="radio"
                aria-checked={visual.id === featured}
                aria-label={translateExportCard(language, 'export.card.media.featured.item', { index: String(index + 1) })}
                data-export-featured={visual.id}
                onClick={() => onFeatured(visual.id)}
                className="grid shrink-0 place-items-center rounded-card p-1 transition-transform active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 motion-reduce:transition-none"
                style={{ minWidth: 44, minHeight: 44, ...(visual.id === featured ? PRESSED : REST) }}
              >
                <VisualThumb source={visual.source} />
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {hasMediaAuthors && visuals.length > 0 && !backdrop ? (
        <div className="flex flex-wrap gap-2">
          <Pill pressed={format.showsMediaAuthor} onClick={() => onToggle('showsMediaAuthor')} data={{ 'data-export-option': 'showsMediaAuthor' }}>
            {t('export.card.media.author')}
          </Pill>
        </div>
      ) : null}
      {hasAudio ? (
        <Group label={t('export.card.audio.style')} exclusive data={{ 'data-export-group': 'audioStyle' }}>
          {CARD_AUDIO_STYLES.map((audioStyle) => (
            <Pill key={audioStyle} role="radio" pressed={format.audioStyle === audioStyle} onClick={() => onChoice({ audioStyle })} data={{ 'data-export-audio-style': audioStyle }}>
              {t(AUDIO_STYLE_LABEL[audioStyle])}
            </Pill>
          ))}
        </Group>
      ) : null}
    </div>
  );
}
