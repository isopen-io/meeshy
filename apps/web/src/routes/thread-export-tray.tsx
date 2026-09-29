import type { ReactNode } from 'react';

import { Glyph, GlyphSvg } from '@/components/glyph';
import { EXPORT_CARD_GLYPHS } from '@/components/glyphs-export-card';
import type { MessageCardFormat, MessageCardToggle } from '@/lib/export/message-card-format';
import type { CardPart } from '@/lib/export/message-card-layout';
import {
  ALL_TEMPLATE_IDS,
  CARD_LINKS,
  CARD_PALETTES,
  CARD_PALETTE_IDS,
  CARD_TYPEFACES,
  CARD_TYPEFACE_IDS,
  templateOf,
  type CardLinkId,
  type CardPaletteId,
  type CardTypefaceId,
  type MessageCardTemplateId,
} from '@/lib/export/message-card-templates';
import { translateExportCard, type ExportCardCatalogKey } from '@/lib/i18n-export-card-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { spokenLanguageName } from '@/lib/view/language-name';

import { CardThumb, LinkGlyph, cssFontOf, paletteGradient, type ThumbSource } from './thread-export-thumb';

/**
 * **LE PLATEAU DU COMPOSER D'EXPORT** — un seul verre, un seul réglage à la
 * fois. Les onglets nomment les parties de la carte ; toucher une partie sur
 * l'aperçu ouvre son onglet (`TAB_OF_PART`). La langue n'apparaît que si le
 * message existe dans plusieurs, et vient après les réglages de format.
 */

export type ExportTab = 'styles' | 'palette' | 'typeface' | 'link' | 'details' | 'language';

export const TAB_OF_PART: Readonly<Record<CardPart, ExportTab>> = {
  background: 'palette',
  header: 'details',
  quote: 'typeface',
  reply: 'typeface',
  link: 'link',
};

export const TYPEFACE_LABEL = {
  rond: 'export.card.typeface.rond',
  didone: 'export.card.typeface.didone',
  plume: 'export.card.typeface.plume',
  affiche: 'export.card.typeface.affiche',
  futur: 'export.card.typeface.futur',
  machine: 'export.card.typeface.machine',
  marqueur: 'export.card.typeface.marqueur',
  systeme: 'export.card.typeface.systeme',
} as const satisfies Readonly<Record<CardTypefaceId, ExportCardCatalogKey>>;

export const LINK_LABEL = {
  orbite: 'export.card.link.orbite',
  filet: 'export.card.link.filet',
  guillemets: 'export.card.link.guillemets',
  fleche: 'export.card.link.fleche',
  bulles: 'export.card.link.bulles',
  fil: 'export.card.link.fil',
  silence: 'export.card.link.silence',
} as const satisfies Readonly<Record<CardLinkId, ExportCardCatalogKey>>;

const OPTION_LABEL = {
  showConversationTitle: 'export.card.option.title',
  showAuthors: 'export.card.option.authors',
  showDate: 'export.card.option.date',
  anonymizeQuoted: 'export.card.option.anonymizeQuoted',
  anonymizeReply: 'export.card.option.anonymizeReply',
} as const satisfies Readonly<Record<MessageCardToggle, ExportCardCatalogKey>>;

const TAB_LABEL = {
  styles: 'export.card.tab.styles',
  palette: 'export.card.tab.palette',
  typeface: 'export.card.tab.typeface',
  link: 'export.card.tab.link',
  details: 'export.card.tab.details',
  language: 'export.card.tab.language',
} as const satisfies Readonly<Record<ExportTab, ExportCardCatalogKey>>;

const TAB_GLYPH = {
  styles: EXPORT_CARD_GLYPHS.squaresFour,
  palette: EXPORT_CARD_GLYPHS.palette,
  typeface: EXPORT_CARD_GLYPHS.textAa,
  link: EXPORT_CARD_GLYPHS.arrowElbowDownRight,
  details: EXPORT_CARD_GLYPHS.slidersHorizontal,
} as const;

export const templateLabel = (language: InterfaceLanguage, id: MessageCardTemplateId): string => {
  const template = templateOf(id);
  return `${template.palette.name} · ${translateExportCard(language, TYPEFACE_LABEL[template.typefaceId])} · ${translateExportCard(language, LINK_LABEL[template.link])}`;
};

/* Verre sur verre, jamais : les tuiles DANS le plateau sont une teinte d'encre, le verre est celui du plateau. */
const REST = { backgroundColor: 'color-mix(in srgb, var(--color-ios-ink) 7%, transparent)', color: 'var(--color-ios-ink)' } as const;
const PRESSED = { backgroundColor: 'var(--color-ios-ink)', color: 'var(--color-ios-surface)' } as const;

function Tile({
  pressed,
  onClick,
  data,
  label,
  children,
  wide = false,
}: {
  readonly pressed: boolean;
  readonly onClick: () => void;
  readonly data: Readonly<Record<`data-${string}`, string>>;
  readonly label: string;
  readonly children: ReactNode;
  readonly wide?: boolean;
}) {
  return (
    <button
      {...data}
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className="grid shrink-0 place-items-center gap-1 rounded-[16px] px-2 py-2 transition-transform active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 motion-reduce:transition-none"
      style={{ minWidth: wide ? 80 : 72, minHeight: 72, ...(pressed ? PRESSED : REST) }}
    >
      {children}
      <span className="text-[11px] font-semibold leading-tight">{label}</span>
    </button>
  );
}

function Pill({
  pressed,
  onClick,
  data,
  children,
}: {
  readonly pressed: boolean;
  readonly onClick: () => void;
  readonly data: Readonly<Record<`data-${string}`, string>>;
  readonly children: string;
}) {
  return (
    <button
      {...data}
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className="inline-flex shrink-0 items-center gap-2 rounded-full px-4 text-caption font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
      style={{ minHeight: 44, ...(pressed ? PRESSED : REST) }}
    >
      {pressed ? <Glyph name="check" size={14} /> : null}
      {children}
    </button>
  );
}

export type ExportTrayProps = {
  readonly language: InterfaceLanguage;
  readonly tab: ExportTab;
  readonly onTab: (tab: ExportTab) => void;
  /** La partie touchée sur l'aperçu — la citation ou la réponse donnent son anonymat à l'onglet Police. */
  readonly focus: CardPart | null;
  readonly format: MessageCardFormat;
  readonly options: readonly MessageCardToggle[];
  readonly hasQuote: boolean;
  readonly popular: readonly MessageCardTemplateId[];
  readonly thumbs: ThumbSource;
  readonly onTemplate: (id: MessageCardTemplateId) => void;
  readonly onPart: (part: { readonly palette?: CardPaletteId; readonly typeface?: CardTypefaceId; readonly link?: CardLinkId }) => void;
  readonly onToggle: (toggle: MessageCardToggle) => void;
  readonly onGallery: () => void;
  readonly languages: readonly string[];
  readonly exportLanguage: string | null;
  readonly onLanguage: (code: string | null) => void;
};

export function ExportTray(props: ExportTrayProps) {
  const { language, tab, format } = props;
  const current = templateOf(format.template);
  const tabs: readonly ExportTab[] = ['styles', 'palette', 'typeface', 'link', 'details', ...(props.languages.length > 1 ? (['language'] as const) : [])];

  const subtitle: Readonly<Record<ExportTab, string>> = {
    styles: templateLabel(language, format.template),
    palette: current.palette.name,
    typeface: translateExportCard(language, TYPEFACE_LABEL[current.typefaceId]),
    link: translateExportCard(language, LINK_LABEL[current.link]),
    details: '',
    language: props.exportLanguage === null ? translateExportCard(language, 'export.card.language.asRead') : spokenLanguageName(props.exportLanguage),
  };

  const anonymizing = props.focus === 'quote' ? (props.hasQuote ? 'anonymizeQuoted' : null) : props.focus === 'reply' ? 'anonymizeReply' : null;

  return (
    <div className="glass mx-3 rounded-[28px] pt-3" style={{ boxShadow: '0 10px 30px color-mix(in srgb, black 18%, transparent)' }}>
      <div className="flex min-h-[28px] items-center justify-between gap-3 px-4 pb-2">
        <p className="text-caption font-bold" style={{ color: 'var(--color-ios-ink)' }}>
          {tab === 'language' ? translateExportCard(language, 'export.card.language') : translateExportCard(language, TAB_LABEL[tab])}
        </p>
        {tab === 'typeface' && anonymizing !== null && format.showAuthors ? (
          <Pill pressed={format[anonymizing]} onClick={() => props.onToggle(anonymizing)} data={{ 'data-export-anonymize': props.focus ?? '' }}>
            {translateExportCard(language, OPTION_LABEL[anonymizing])}
          </Pill>
        ) : (
          <p className="truncate text-caption" style={{ color: 'var(--color-ios-ink)' }}>
            {subtitle[tab]}
          </p>
        )}
      </div>

      <div role="tabpanel" aria-label={translateExportCard(language, TAB_LABEL[tab])} className={`flex min-h-[92px] items-center gap-2 px-4 pb-3 ${tab === 'details' || tab === 'language' ? 'flex-wrap' : 'overflow-x-auto'}`}>
        {tab === 'styles' ? (
          <>
            {props.popular.map((id) => (
              <CardThumb key={id} id={id} source={props.thumbs} label={templateLabel(language, id)} pressed={id === format.template} width={64} onPick={() => props.onTemplate(id)} data={{ 'data-export-template': id }} />
            ))}
            <button
              type="button"
              data-export-gallery=""
              onClick={props.onGallery}
              className="grid shrink-0 place-items-center rounded-[14px] px-3 text-center focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{ minWidth: 76, minHeight: 72, ...REST }}
            >
              <span className="text-title font-bold leading-none">{ALL_TEMPLATE_IDS.length}</span>
              <span className="text-[11px] font-semibold">{translateExportCard(language, 'export.card.gallery.open')}</span>
            </button>
          </>
        ) : null}

        {tab === 'palette'
          ? CARD_PALETTE_IDS.map((palette) => (
              <button
                key={palette}
                type="button"
                data-export-palette={palette}
                aria-pressed={palette === current.paletteId}
                aria-label={CARD_PALETTES[palette].name}
                title={CARD_PALETTES[palette].name}
                onClick={() => props.onPart({ palette })}
                className="shrink-0 rounded-full transition-transform active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 motion-reduce:transition-none"
                style={{
                  width: 48,
                  height: 48,
                  background: paletteGradient(palette),
                  border: '2px solid color-mix(in srgb, var(--color-ios-ink) 18%, transparent)',
                  boxShadow: palette === current.paletteId ? '0 0 0 3px var(--color-ios-surface), 0 0 0 5px var(--color-ios-ink)' : undefined,
                }}
              />
            ))
          : null}

        {tab === 'typeface'
          ? CARD_TYPEFACE_IDS.map((typeface) => (
              <Tile key={typeface} pressed={typeface === current.typefaceId} onClick={() => props.onPart({ typeface })} data={{ 'data-export-typeface': typeface }} label={translateExportCard(language, TYPEFACE_LABEL[typeface])} wide>
                <span aria-hidden="true" style={cssFontOf(CARD_TYPEFACES[typeface].replyFont, 26)}>
                  Aa
                </span>
              </Tile>
            ))
          : null}

        {tab === 'link'
          ? CARD_LINKS.map((link) => (
              <Tile key={link} pressed={link === current.link} onClick={() => props.onPart({ link })} data={{ 'data-export-link': link }} label={translateExportCard(language, LINK_LABEL[link])}>
                <LinkGlyph link={link} />
              </Tile>
            ))
          : null}

        {tab === 'details'
          ? props.options.map((option) => (
              <Pill key={option} pressed={format[option]} onClick={() => props.onToggle(option)} data={{ 'data-export-option': option }}>
                {translateExportCard(language, OPTION_LABEL[option])}
              </Pill>
            ))
          : null}

        {tab === 'language' ? (
          <>
            <Pill pressed={props.exportLanguage === null} onClick={() => props.onLanguage(null)} data={{ 'data-export-language': '' }}>
              {translateExportCard(language, 'export.card.language.asRead')}
            </Pill>
            {props.languages.map((code) => (
              <Pill key={code} pressed={code === props.exportLanguage} onClick={() => props.onLanguage(code)} data={{ 'data-export-language': code }}>
                {spokenLanguageName(code)}
              </Pill>
            ))}
          </>
        ) : null}
      </div>

      <div role="tablist" aria-label={translateExportCard(language, 'export.card.options')} className="flex gap-1 px-2 pb-2 pt-1" style={{ borderTop: '1px solid color-mix(in srgb, var(--color-ios-ink) 10%, transparent)' }}>
        {tabs.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            data-export-tab={id}
            aria-selected={id === tab}
            onClick={() => props.onTab(id)}
            className="grid min-w-0 flex-1 justify-items-center gap-0.5 rounded-[14px] py-1.5 text-[11px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{
              minHeight: 44,
              color: 'var(--color-ios-ink)',
              backgroundColor: id === tab ? 'color-mix(in srgb, var(--color-ios-ink) 9%, transparent)' : 'transparent',
            }}
          >
            {id === 'language' ? <Glyph name="translate" size={20} /> : <GlyphSvg glyph={TAB_GLYPH[id]} size={20} />}
            <span className="max-w-full truncate">{translateExportCard(language, TAB_LABEL[id])}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
