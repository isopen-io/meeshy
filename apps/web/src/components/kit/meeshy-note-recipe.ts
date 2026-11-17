import type { CSSProperties } from 'react';

/**
 * K46 · MeeshyNote — LA RECETTE EN VALEURS (#18874).
 *
 * Une note dit, elle reste, elle ne flotte pas : une tête (glyphe, point ou point
 * pulsé) et une phrase sur autant de lignes qu'il faut. Cinq sens, quatre formes.
 * La loi : une note OCCUPE de la place, et la rend — jamais posée par-dessus un
 * contenu, jamais minutée, jamais fermée d'une croix. Ce qui doit passer et s'en
 * aller tout seul est la pilule `K14`. L'hôte donne une phrase déjà traduite et dit
 * si la donnée est fraîche : la note ne lit ni le réseau ni l'horloge.
 */
export type MeeshyNoteForm = 'line' | 'band' | 'banner' | 'live';
export type MeeshyNoteKind = 'neutral' | 'info' | 'ok' | 'warn' | 'security';
export type MeeshyNoteLeadKind = 'glyph' | 'dot' | 'pulse' | 'none';
export type MeeshyNoteSize = 'compact' | 'regular';
export type MeeshyNotePhraseTone = 'ink' | 'ink2' | MeeshyNoteKind;

export const MEESHY_NOTE_MEASURE = {
  lineHeight: 1.4,
  dotSize: 9,
  rule: 3,
  detailSize: 12.5,
  detailGap: 1,
  action: { target: 44, wrapsBelow: 320 },
  band: { radius: 16, fillOpacity: 0.1, padding: { top: 12, end: 14, bottom: 12, start: 18 } },
  banner: { minHeight: 48, borderBottom: 1, leadSize: 22 },
  lead: 16,
  list: { compact: 13, regular: 14.5 },
  live: { fontSize: 13.5, fontWeight: 600 },
} as const;

const FONT_SIZE: Readonly<Record<MeeshyNoteForm, number>> = { line: 12.5, band: 13, banner: 14, live: MEESHY_NOTE_MEASURE.live.fontSize };

export type MeeshyNoteRecipeInput = {
  readonly form?: MeeshyNoteForm | undefined;
  readonly kind?: MeeshyNoteKind | undefined;
  readonly lead?: MeeshyNoteLeadKind | undefined;
  readonly size?: MeeshyNoteSize | undefined;
  readonly isList?: boolean | undefined;
  readonly isStale?: boolean | undefined;
  readonly hasDetail?: boolean | undefined;
  readonly hasAction?: boolean | undefined;
  readonly reduceMotion?: boolean | undefined;
  readonly announces?: boolean | undefined;
  readonly tint?: string | undefined;
};

export type MeeshyNoteRecipe = {
  readonly form: MeeshyNoteForm;
  readonly kind: MeeshyNoteKind;
  readonly tone: MeeshyNoteKind | 'tint';
  readonly fontSize: number;
  readonly fontWeight: number;
  readonly lineHeight: number;
  readonly leadSize: number;
  readonly dotSize: number;
  readonly lead: MeeshyNoteLeadKind;
  readonly isPulsing: boolean;
  readonly phraseTone: MeeshyNotePhraseTone;
  readonly hasContainer: boolean;
  readonly radius: number;
  readonly fillOpacity: number;
  readonly padding: { readonly top: number; readonly end: number; readonly bottom: number; readonly start: number };
  readonly rule: number;
  readonly minHeight: number;
  readonly borderBottom: number;
  readonly isFullWidth: boolean;
  readonly showsDetail: boolean;
  readonly actionTarget: number;
  readonly actionWrapsBelow: number;
  readonly animatesHeight: boolean;
  readonly announces: boolean;
};

const NO_PADDING = { top: 0, end: 0, bottom: 0, start: 0 } as const;

const leadOf = (form: MeeshyNoteForm, lead: MeeshyNoteLeadKind | undefined): MeeshyNoteLeadKind => lead ?? (form === 'live' ? 'pulse' : 'glyph');

/** La recette d'une note : forme, sens, tête et fraîcheur deviennent des nombres. */
export const meeshyNoteRecipe = (input: MeeshyNoteRecipeInput): MeeshyNoteRecipe => {
  const form = input.form ?? 'line';
  const kind = input.kind ?? 'neutral';
  const lead = leadOf(form, input.lead);
  const isBand = form === 'band';
  const isBanner = form === 'banner';
  const isLive = form === 'live';
  const isStale = input.isStale === true;
  const reduce = input.reduceMotion === true;
  const { band, banner } = MEESHY_NOTE_MEASURE;
  const listSize = input.size === 'compact' ? MEESHY_NOTE_MEASURE.list.compact : MEESHY_NOTE_MEASURE.list.regular;
  return {
    form,
    kind,
    tone: input.tint === undefined ? kind : 'tint',
    fontSize: input.isList === true ? listSize : FONT_SIZE[form],
    fontWeight: isLive ? MEESHY_NOTE_MEASURE.live.fontWeight : 400,
    lineHeight: MEESHY_NOTE_MEASURE.lineHeight,
    leadSize: isBanner ? banner.leadSize : MEESHY_NOTE_MEASURE.lead,
    dotSize: MEESHY_NOTE_MEASURE.dotSize,
    lead,
    isPulsing: lead === 'pulse' && isLive && !isStale && !reduce,
    phraseTone: isLive ? (isStale ? 'ink2' : kind) : 'ink',
    hasContainer: isBand || isBanner,
    radius: isBand ? band.radius : 0,
    fillOpacity: isBand ? band.fillOpacity : 0,
    padding: isBand ? band.padding : NO_PADDING,
    rule: isBand ? MEESHY_NOTE_MEASURE.rule : 0,
    minHeight: isBanner ? banner.minHeight : 0,
    borderBottom: isBanner ? banner.borderBottom : 0,
    isFullWidth: isBanner,
    showsDetail: input.hasDetail === true && (isBand || isBanner),
    actionTarget: input.hasAction === true ? MEESHY_NOTE_MEASURE.action.target : 0,
    actionWrapsBelow: MEESHY_NOTE_MEASURE.action.wrapsBelow,
    animatesHeight: isBanner && !reduce,
    announces: input.announces ?? kind === 'warn',
  };
};

const REM = 16;
const rem = (px: number): string => `${px / REM}rem`;

const TONE_TOKEN: Readonly<Record<MeeshyNoteKind, string>> = {
  neutral: 'var(--color-ios-ink-2)',
  info: 'var(--accent, var(--color-ios-brand))',
  ok: 'var(--color-success)',
  warn: 'var(--color-warning)',
  security: 'var(--color-ios-brand)',
};

export const meeshyNoteStyle = (recipe: MeeshyNoteRecipe, tint: string | undefined): CSSProperties => {
  const tone = tint ?? TONE_TOKEN[recipe.kind];
  const { padding } = recipe;
  return {
    '--kit-note-font': rem(recipe.fontSize),
    '--kit-note-weight': recipe.fontWeight,
    '--kit-note-leading': recipe.lineHeight,
    '--kit-note-lead': rem(recipe.leadSize),
    '--kit-note-dot': rem(recipe.dotSize),
    '--kit-note-tone': tone,
    '--kit-note-phrase': recipe.phraseTone === 'ink' ? 'var(--color-ios-ink)' : recipe.phraseTone === 'ink2' ? 'var(--color-ios-ink-2)' : tone,
    '--kit-note-radius': rem(recipe.radius),
    '--kit-note-fill-opacity': recipe.fillOpacity,
    '--kit-note-pad': `${rem(padding.top)} ${rem(padding.end)} ${rem(padding.bottom)} ${rem(padding.start)}`,
    '--kit-note-rule': rem(recipe.rule),
    '--kit-note-min-h': rem(recipe.minHeight),
    '--kit-note-border-bottom': rem(recipe.borderBottom),
    '--kit-note-detail': rem(MEESHY_NOTE_MEASURE.detailSize),
    '--kit-note-detail-gap': rem(MEESHY_NOTE_MEASURE.detailGap),
    '--kit-note-action-target': rem(recipe.actionTarget),
    '--kit-note-action-wrap': rem(recipe.actionWrapsBelow),
  } as CSSProperties;
};
