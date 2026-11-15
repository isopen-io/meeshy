export type MeeshyChipRowMode = 'single' | 'singleOrNone' | 'multiple' | 'actions';
export type MeeshyChipRowLayout = 'scroll' | 'wrap' | 'equal';
export type MeeshyChipRowSemantics = 'choice' | 'tabs';
export type MeeshyChipRowSurface = 'onMedia' | 'theme';
export type MeeshyChipRowSize = 'regular' | 'compact';
export type MeeshyChipRowHaptic = 'light' | 'none';
export type MeeshyChipTrailing = 'none' | 'chevron' | 'remove';
export type MeeshyChipKind = 'choice' | 'action' | 'menu';

export const MEESHY_CHIP_ROW_MODES: readonly MeeshyChipRowMode[] = ['single', 'singleOrNone', 'multiple', 'actions'];
export const MEESHY_CHIP_ROW_LAYOUTS: readonly MeeshyChipRowLayout[] = ['scroll', 'wrap', 'equal'];

export const MEESHY_CHIP_ROW_MEASURE = {
  disabledOpacity: 0.4,
  rest: 0.08,
  pressed: 0.15,
  selected: 1,
  selectedPressed: 0.85,
  toneFadeMs: 200,
  edgeFadeMs: 150,
  revealMs: 250,
  edgeTolerance: 0.5,
  edgeFade: 44,
  tapTarget: 44,
  glyph: { leading: 14, alone: 16, trailing: 12 },
  spacing: { chips: 6, glyphAndText: 6, rows: 8 },
} as const;

const SIZES = {
  regular: { height: 36, padding: 12, font: 13 },
  compact: { height: 28, padding: 10, font: 12 },
} as const satisfies Readonly<Record<MeeshyChipRowSize, { readonly height: number; readonly padding: number; readonly font: number }>>;

export type MeeshyChipSize = { readonly height: number; readonly padding: number; readonly font: number; readonly slack: number };

export const meeshyChipSize = (size: MeeshyChipRowSize): MeeshyChipSize => {
  const measured = SIZES[size];
  return { ...measured, slack: Math.max(0, (MEESHY_CHIP_ROW_MEASURE.tapTarget - measured.height) / 2) };
};

export type MeeshyChipRowResponse =
  | { readonly type: 'ignored' }
  | { readonly type: 'changed'; readonly selection: readonly string[] }
  | { readonly type: 'action' };

export type MeeshyChipRowResponseInput = {
  readonly selection: readonly string[];
  readonly tapped: string;
  readonly mode: MeeshyChipRowMode;
  readonly kind?: MeeshyChipKind | undefined;
};

export const meeshyChipRowResponse = ({ selection, tapped, mode, kind = 'choice' }: MeeshyChipRowResponseInput): MeeshyChipRowResponse => {
  if (mode === 'actions' || kind !== 'choice') return { type: 'action' };
  const isCurrent = selection.includes(tapped);
  if (mode === 'single') return isCurrent && selection.length === 1 ? { type: 'ignored' } : { type: 'changed', selection: [tapped] };
  if (mode === 'singleOrNone') return { type: 'changed', selection: isCurrent ? [] : [tapped] };
  return { type: 'changed', selection: isCurrent ? selection.filter((id) => id !== tapped) : [...selection, tapped] };
};

export const meeshyChipRowNext = (input: MeeshyChipRowResponseInput): readonly string[] => {
  const response = meeshyChipRowResponse(input);
  return response.type === 'changed' ? response.selection : input.selection;
};

export const meeshyChipRevealTarget = ({
  order,
  previous,
  current,
}: {
  readonly order: readonly string[];
  readonly previous: readonly string[];
  readonly current: readonly string[];
}): string | null => {
  const entered = new Set(current.filter((id) => !previous.includes(id)));
  return order.find((id) => entered.has(id)) ?? order.find((id) => current.includes(id)) ?? null;
};

export type MeeshyScrollEdges = { readonly start: boolean; readonly end: boolean };

export const MEESHY_SCROLL_EDGES_NONE: MeeshyScrollEdges = { start: false, end: false };

export const meeshyScrollEdges = ({ content, viewport, offset }: { readonly content: number; readonly viewport: number; readonly offset: number }): MeeshyScrollEdges => {
  const tolerance = MEESHY_CHIP_ROW_MEASURE.edgeTolerance;
  if (content <= viewport + tolerance) return MEESHY_SCROLL_EDGES_NONE;
  return { start: offset > tolerance, end: content - offset > viewport + tolerance };
};

export const meeshyScrollSides = (edges: MeeshyScrollEdges, isRightToLeft: boolean): { readonly low: boolean; readonly high: boolean } =>
  isRightToLeft ? { low: edges.end, high: edges.start } : { low: edges.start, high: edges.end };

export type MeeshyChipFill = 'onMedia' | 'themeInk' | 'tint';
export type MeeshyChipInk = 'onMedia' | 'indigo950' | 'themeInk' | 'themeInverse';

export type MeeshyChipRecipe = {
  readonly fill: MeeshyChipFill;
  readonly fillOpacity: number;
  readonly ink: MeeshyChipInk;
  readonly opacity: number;
  readonly isActionEnabled: boolean;
};

export type MeeshyChipRecipeInput = {
  readonly surface: MeeshyChipRowSurface;
  readonly isSelected: boolean;
  readonly isPressed?: boolean | undefined;
  readonly isHovered?: boolean | undefined;
  readonly isEnabled?: boolean | undefined;
  readonly isTinted?: boolean | undefined;
};

const fillOpacityOf = (isSelected: boolean, isResponding: boolean): number => {
  const measure = MEESHY_CHIP_ROW_MEASURE;
  if (isSelected) return isResponding ? measure.selectedPressed : measure.selected;
  return isResponding ? measure.pressed : measure.rest;
};

const inkOf = (surface: MeeshyChipRowSurface, isSelected: boolean, isTinted: boolean): MeeshyChipInk => {
  if (isTinted) return 'onMedia';
  if (surface === 'theme') return isSelected ? 'themeInverse' : 'themeInk';
  return isSelected ? 'indigo950' : 'onMedia';
};

export const meeshyChipRecipe = ({ surface, isSelected, isPressed = false, isHovered = false, isEnabled = true, isTinted = false }: MeeshyChipRecipeInput): MeeshyChipRecipe => {
  const isResponding = (isPressed || isHovered) && isEnabled;
  const tinted = isSelected && isTinted;
  return {
    fill: tinted ? 'tint' : surface === 'theme' ? 'themeInk' : 'onMedia',
    fillOpacity: fillOpacityOf(isSelected, isResponding),
    ink: inkOf(surface, isSelected, tinted),
    opacity: isEnabled ? 1 : MEESHY_CHIP_ROW_MEASURE.disabledOpacity,
    isActionEnabled: isEnabled,
  };
};

export type MeeshyChipRole = 'radio' | 'toggle' | 'tab' | 'button' | 'menu';

export type MeeshyChipAccessibility = { readonly role: MeeshyChipRole; readonly isSelected: boolean };

export const meeshyChipAccessibility = ({
  mode,
  semantics,
  kind,
  isSelected,
}: {
  readonly mode: MeeshyChipRowMode;
  readonly semantics: MeeshyChipRowSemantics;
  readonly kind: MeeshyChipKind;
  readonly isSelected: boolean;
}): MeeshyChipAccessibility => {
  if (kind === 'menu') return { role: 'menu', isSelected: false };
  if (kind === 'action' || mode === 'actions') return { role: 'button', isSelected: false };
  if (semantics === 'tabs') return { role: 'tab', isSelected };
  return { role: mode === 'multiple' ? 'toggle' : 'radio', isSelected };
};

export type MeeshyChipNaming = { readonly title: string; readonly accessibilityLabel?: string | undefined };

export const meeshyChipName = ({ title, accessibilityLabel }: MeeshyChipNaming): string =>
  accessibilityLabel === undefined || accessibilityLabel === '' ? title : accessibilityLabel;

export const meeshyChipRowProblems = ({ label, chips }: { readonly label: string; readonly chips: readonly MeeshyChipNaming[] }): readonly string[] => [
  ...(label === '' ? ['MeeshyChipRow : le nom du groupe est obligatoire et non vide'] : []),
  ...(chips.every((chip) => meeshyChipName(chip) !== '') ? [] : ['MeeshyChipRow : une puce sans titre doit porter un accessibilityLabel']),
];

export const meeshyChipRowTrigger = ({
  response,
  tapped,
  isEnabled,
  haptic,
  play,
  onChange,
  onAction,
}: {
  readonly response: MeeshyChipRowResponse;
  readonly tapped: string;
  readonly isEnabled: boolean;
  readonly haptic: MeeshyChipRowHaptic;
  readonly play: (haptic: 'light') => void;
  readonly onChange: (next: readonly string[], tapped: string) => void;
  readonly onAction?: ((tapped: string) => void) | undefined;
}): boolean => {
  if (!isEnabled || response.type === 'ignored') return false;
  if (haptic === 'light') play('light');
  if (response.type === 'changed') onChange(response.selection, tapped);
  else onAction?.(tapped);
  return true;
};

export const meeshyChipRowStep = ({ key, index, count, rtl }: { readonly key: string; readonly index: number; readonly count: number; readonly rtl: boolean }): number | null => {
  if (count === 0) return null;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  if (key !== 'ArrowRight' && key !== 'ArrowLeft') return null;
  const isForward = (key === 'ArrowRight') !== rtl;
  if (index < 0) return isForward ? 0 : count - 1;
  return (index + (isForward ? 1 : -1) + count) % count;
};

export const meeshyChipRowWheel = ({
  deltaX,
  deltaY,
  scrollLeft,
  maxScroll,
  rtl,
}: {
  readonly deltaX: number;
  readonly deltaY: number;
  readonly scrollLeft: number;
  readonly maxScroll: number;
  readonly rtl: boolean;
}): number | null => {
  if (maxScroll <= 0 || deltaY === 0 || Math.abs(deltaX) >= Math.abs(deltaY)) return null;
  const travelled = rtl ? -scrollLeft : scrollLeft;
  const isForward = deltaY > 0;
  if (isForward ? travelled >= maxScroll - 1 : travelled <= 1) return null;
  return rtl ? -deltaY : deltaY;
};
