import type { MessageCardFormat, MessageCardToggle } from '@/lib/export/message-card-format';
import { CARD_ASPECTS, CARD_AUTHOR_PLACEMENTS, CARD_HEADER_ORIENTATIONS, CARD_TILTS, type CardAspect, type CardAuthorPlacement, type CardHeaderOrientation, type CardTilt } from '@/lib/export/message-card-frame';
import { CARD_AUDIO_STYLES, CARD_MEDIA_STYLES, type CardAudioStyle, type CardMediaStyle } from '@/lib/export/message-card-media';
import { translateExportCard, type ExportCardCatalogKey } from '@/lib/i18n-export-card-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

import { Group, Pill } from './thread-export-controls';

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
 * MÉDIAS : la disposition des images (mosaïque, pleine largeur, bande) et la
 * représentation de l'audio (onde, spectre, pastille, étiquette) — chacune
 * n'apparaît que si la carte porte ce genre de média.
 */

/** Les libellés sans paramètre — tous ceux de ce panneau. */
type PlainKey = Exclude<ExportCardCatalogKey, 'export.card.gallery.count' | 'export.card.media.failed.other'>;

export type FrameChoice =
  | { readonly aspect: CardAspect }
  | { readonly header: CardHeaderOrientation }
  | { readonly authorsAt: CardAuthorPlacement }
  | { readonly tilt: CardTilt }
  | { readonly mediaStyle: CardMediaStyle }
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

export const MEDIA_STYLE_LABEL = {
  mosaique: 'export.card.media.mosaique',
  pleine: 'export.card.media.pleine',
  bande: 'export.card.media.bande',
} as const satisfies Readonly<Record<CardMediaStyle, ExportCardCatalogKey>>;

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

export function MediaPanel({
  language,
  format,
  hasVisual,
  hasAudio,
  onChoice,
}: {
  readonly language: InterfaceLanguage;
  readonly format: MessageCardFormat;
  readonly hasVisual: boolean;
  readonly hasAudio: boolean;
  readonly onChoice: (choice: FrameChoice) => void;
}) {
  const t = (key: PlainKey) => translateExportCard(language, key);
  return (
    <div className="flex w-full flex-col gap-3" data-export-media-panel="">
      {hasVisual ? (
        <Group label={t('export.card.media.style')} exclusive data={{ 'data-export-group': 'mediaStyle' }}>
          {CARD_MEDIA_STYLES.map((mediaStyle) => (
            <Pill key={mediaStyle} role="radio" pressed={format.mediaStyle === mediaStyle} onClick={() => onChoice({ mediaStyle })} data={{ 'data-export-media-style': mediaStyle }}>
              {t(MEDIA_STYLE_LABEL[mediaStyle])}
            </Pill>
          ))}
        </Group>
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
