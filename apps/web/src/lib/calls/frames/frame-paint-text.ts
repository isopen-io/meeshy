import type { Rect, Size } from '../call-montage-shapes';
import { BRAND_DASHES } from '@/lib/brand';
import { BRAND_FONT, frameCanvasFont } from './frame-fonts';
import type { FrameAreas, FrameSlotBox } from './frame-layout';
import { enterSlot, footprint, intersects, luminance, mix, photoRect, roundedRectPath, tint, type Surface2D } from './frame-paint-kit';
import { shapeInnerRect, slotPath } from './frame-paint-shapes';
import type { FrameBrand, FrameFont, FrameLook, FrameNames, FrameTitle } from './frame-spec';
import { BRAND_WORD, fitText, listEntry, personLines, titleText, type FittedText, type FramePerson, type FrameTexts, type MeasureText } from './frame-text';

/**
 * **LES TEXTES D'UN CADRE** (#8743, spec § 4.5, § 5.2) — la signature
 * Meeshy (quand le cadre la déclare : facultative depuis #9197), les noms,
 * le titre et le sous-titre. Un texte ne couvre
 * jamais un visage : il vit dans les réserves `top`/`bottom`, sous la case,
 * ou — pour `plate`, `badge` et `bubble` seulement — DANS la case, sur son
 * propre fond.
 */

export type FrameTextLook = Pick<FrameLook, 'names' | 'title' | 'subtitle' | 'brand' | 'slot' | 'ornaments'>;

export type TextScene = {
  readonly look: FrameTextLook;
  readonly people: readonly FramePerson[];
  readonly texts: FrameTexts;
  readonly size: Size;
  readonly areas: FrameAreas;
  readonly slots: readonly FrameSlotBox[];
};

const TITLE_SHARE = { s: 0.042, m: 0.06, l: 0.085 } as const;
const BRAND_SHARE = { s: 0.03, m: 0.042, l: 0.058 } as const;
const LIST_SHARE = 0.03;
const NAME_SHARE = 0.034;
const LINE = 1.3;
const MIN_ROW_SCALE = 0.45;

/** Le tracé visible des trois traits, dans le repère 1024 : de x 262 − ½ trait à 762 + ½ trait. */
const DASH_WIDTH = 88;
const GLYPH = {
  left: Math.min(...BRAND_DASHES.map((dash) => dash.x1)) - DASH_WIDTH / 2,
  right: Math.max(...BRAND_DASHES.map((dash) => dash.x2)) + DASH_WIDTH / 2,
  top: Math.min(...BRAND_DASHES.map((dash) => dash.y)) - DASH_WIDTH / 2,
  bottom: Math.max(...BRAND_DASHES.map((dash) => dash.y)) + DASH_WIDTH / 2,
};
const GLYPH_ASPECT = (GLYPH.right - GLYPH.left) / (GLYPH.bottom - GLYPH.top);

/** La mesure d'un texte sur le canevas, avec un repli à chasse moyenne quand le moteur ne mesure pas (témoins). */
export function canvasMeasure(context: Surface2D, font: FrameFont): MeasureText {
  return (text, px) => {
    context.font = frameCanvasFont(font, px);
    const metrics: TextMetrics | undefined = context.measureText(text);
    return typeof metrics?.width === 'number' && Number.isFinite(metrics.width) ? metrics.width : Array.from(text).length * px * 0.56;
  };
}

type BrandBox = { readonly width: number; readonly height: number; readonly px: number; readonly logoHeight: number };

/** L'encombrement de la signature : le mot à `px`, le logo à la hauteur de ses traits, les deux côte à côte. */
function brandBox(brand: FrameBrand, unit: number, measure: MeasureText): BrandBox {
  const px = unit * BRAND_SHARE[brand.size];
  const logoHeight = brand.mark === 'logo' ? px * 0.95 : px * 0.62;
  const logoWidth = logoHeight * GLYPH_ASPECT;
  const word = measure(BRAND_WORD, px);
  const width = brand.mark === 'logo' ? logoWidth : brand.mark === 'wordmark' ? word : logoWidth + px * 0.32 + word;
  return { width, height: Math.max(px, logoHeight) * 1.15, px, logoHeight };
}

export type TextPlan = {
  readonly brand: Rect | null;
  readonly brandScale: number;
  readonly title: Rect | null;
  readonly subtitle: Rect | null;
  readonly list: Rect | null;
  readonly textScale: { readonly top: number; readonly bottom: number };
};

type Row = { readonly key: 'brand' | 'title' | 'subtitle' | 'list'; readonly height: number };

const titleShown = (title: FrameTitle | undefined): title is FrameTitle => title !== undefined && title.source !== 'none';

/**
 * **OÙ VA CHAQUE TEXTE** — pur. En haut, de haut en bas : la signature
 * (`top`), le titre, le sous-titre. En bas, de haut en bas : le titre, le
 * sous-titre, la liste des noms, la signature (`bottom`). Une réserve trop
 * courte réduit tout son bloc ; en dessous de 45 %, un titre se tait plutôt
 * que de couvrir un visage — la signature, elle, ne se tait jamais (70 % au
 * moins, quitte à déborder de la réserve).
 */
export function planText(look: FrameTextLook, people: number, areas: FrameAreas, measure: MeasureText): TextPlan {
  const unit = areas.unit;
  const box = look.brand === undefined ? null : brandBox(look.brand, unit, measure);
  const brandRows = (at: 'top' | 'bottom'): readonly Row[] => (box !== null && look.brand?.place === at ? [{ key: 'brand', height: box.height * 1.25 }] : []);
  const titleHeight = (title: FrameTitle) => unit * TITLE_SHARE[title.size] * LINE;
  const listLines = look.names.show === 'both' || people >= 5 ? 2 : 1;
  const listed = look.names.style === 'list' && look.names.show !== 'none';
  const place = (at: 'top' | 'bottom') => {
    const rows: readonly Row[] = [
      ...(at === 'top' ? brandRows('top') : []),
      ...(at === 'bottom' && titleShown(look.title) && look.title.place === 'bottom' ? [{ key: 'title', height: titleHeight(look.title) } as const] : []),
      ...(at === 'top' && titleShown(look.title) && look.title.place === 'top' ? [{ key: 'title', height: titleHeight(look.title) } as const] : []),
      ...(titleShown(look.subtitle) && look.subtitle.place === at ? [{ key: 'subtitle', height: titleHeight(look.subtitle) } as const] : []),
      ...(at === 'bottom' && listed ? [{ key: 'list', height: unit * LIST_SHARE * 1.45 * listLines } as const] : []),
      ...(at === 'bottom' ? brandRows('bottom') : []),
    ];
    const reserve = at === 'top' ? areas.top : areas.bottom;
    const room = reserve.height * 0.94;
    const brandRow = rows.find((row) => row.key === 'brand');
    const others = rows.filter((row) => row.key !== 'brand');
    const brandScale = brandRow === undefined ? 1 : Math.max(0.7, Math.min(1, room / rows.reduce((sum, row) => sum + row.height, 0)));
    const brandHeight = brandRow === undefined ? 0 : brandRow.height * brandScale;
    const otherTotal = others.reduce((sum, row) => sum + row.height, 0);
    const scale = otherTotal === 0 ? 1 : Math.max(0, Math.min(1, (room - brandHeight) / otherTotal));
    const kept = rows.filter((row) => row.key === 'brand' || scale >= MIN_ROW_SCALE);
    const heights = kept.map((row) => (row.key === 'brand' ? brandHeight : row.height * scale));
    const total = heights.reduce((sum, height) => sum + height, 0);
    const start = total <= reserve.height ? reserve.y + (reserve.height - total) / 2 : at === 'top' ? reserve.y : reserve.y + reserve.height - total;
    const rects = kept.map((row, index) => ({ key: row.key, rect: { x: reserve.x, y: start + heights.slice(0, index).reduce((sum, height) => sum + height, 0), width: reserve.width, height: heights[index] ?? 0 } }));
    return { rects, scale: scale >= MIN_ROW_SCALE ? scale : 0, brandScale };
  };
  const top = place('top');
  const bottom = place('bottom');
  const find = (key: Row['key']): Rect | null => [...top.rects, ...bottom.rects].find((row) => row.key === key)?.rect ?? null;
  const brandScale = look.brand?.place === 'top' ? top.brandScale : look.brand?.place === 'bottom' ? bottom.brandScale : 1;
  return { brand: find('brand'), brandScale, title: find('title'), subtitle: find('subtitle'), list: find('list'), textScale: { top: top.scale, bottom: bottom.scale } };
}

type Ink = { readonly font: FrameFont; readonly px: number; readonly color: string; readonly effect: NonNullable<FrameTitle['effect']> };

/** Un texte, centré (ou aligné) sur `x`, sa ligne médiane sur `y`, avec son effet. */
function inkText(context: Surface2D, text: string, x: number, y: number, ink: Ink, align: CanvasTextAlign = 'center'): void {
  if (text.length === 0 || ink.px < 1) return;
  context.save();
  context.font = frameCanvasFont(ink.font, ink.px);
  context.textAlign = align;
  context.textBaseline = 'middle';
  context.fillStyle = ink.color;
  const dark = luminance(ink.color) < 0.45;
  switch (ink.effect) {
    case 'shadow':
      context.shadowColor = dark ? 'rgba(255, 255, 255, 0.35)' : 'rgba(0, 0, 0, 0.45)';
      context.shadowBlur = ink.px * 0.14;
      context.shadowOffsetY = ink.px * 0.05;
      break;
    case 'glow':
      context.shadowColor = tint(ink.color, 0.85);
      context.shadowBlur = ink.px * 0.4;
      context.fillText(text, x, y);
      context.shadowBlur = ink.px * 0.15;
      break;
    case 'outline':
      context.strokeStyle = dark ? 'rgba(255, 255, 255, 0.9)' : 'rgba(0, 0, 0, 0.75)';
      context.lineWidth = Math.max(1, ink.px * 0.09);
      context.lineJoin = 'round';
      context.strokeText(text, x, y);
      break;
    case 'none':
      break;
  }
  context.fillText(text, x, y);
  context.restore();
}

/**
 * Les trois traits de la marque, leur tracé visible calé sur (`x`, `y`) coin
 * haut-gauche, `height` de haut. L'opacité de chaque trait MULTIPLIE `alpha`,
 * celle de l'appelant (le filigrane peint à 0,12) : elle ne la remplace pas.
 */
export function paintLogo(context: Surface2D, x: number, y: number, height: number, color: string, alpha = 1): void {
  const scale = height / (GLYPH.bottom - GLYPH.top);
  const originX = x - GLYPH.left * scale;
  const originY = y - GLYPH.top * scale;
  context.save();
  context.strokeStyle = color;
  context.lineCap = 'round';
  context.lineWidth = DASH_WIDTH * scale;
  BRAND_DASHES.forEach((dash) => {
    context.globalAlpha = alpha * dash.opacity;
    context.beginPath();
    context.moveTo(originX + dash.x1 * scale, originY + dash.y * scale);
    context.lineTo(originX + dash.x2 * scale, originY + dash.y * scale);
    context.stroke();
  });
  context.restore();
}

/** La signature — le logo, le mot, ou les deux — centrée sur (`cx`, `cy`). */
function paintBrandAt(context: Surface2D, brand: FrameBrand, box: BrandBox, cx: number, cy: number, scale: number, alpha = 1): void {
  const px = box.px * scale;
  const logoHeight = box.logoHeight * scale;
  const width = box.width * scale;
  const left = cx - width / 2;
  const ink: Ink = { font: brand.font ?? BRAND_FONT, px, color: brand.color, effect: 'none' };
  context.save();
  context.shadowColor = luminance(brand.color) > 0.5 ? 'rgba(0, 0, 0, 0.28)' : 'rgba(255, 255, 255, 0.22)';
  context.shadowBlur = px * 0.12;
  if (brand.mark !== 'wordmark') paintLogo(context, left, cy - logoHeight / 2, logoHeight, brand.color, alpha);
  if (brand.mark !== 'logo') inkText(context, BRAND_WORD, brand.mark === 'both' ? left + logoHeight * GLYPH_ASPECT + px * 0.32 : left, cy - px * 0.04, ink, 'left');
  context.restore();
}

export const WATERMARK_ALPHA = 0.12;

/** Le filigrane : la signature répétée en diagonale, très discrète, par-dessus l'ensemble. */
function paintWatermark(context: Surface2D, brand: FrameBrand, box: BrandBox, size: Size): void {
  const reach = Math.hypot(size.width, size.height);
  const stepX = box.width * 2.2;
  const stepY = box.height * 3.2;
  context.save();
  context.globalAlpha = WATERMARK_ALPHA;
  context.translate(size.width / 2, size.height / 2);
  context.rotate(-Math.PI / 7);
  Array.from({ length: Math.ceil(reach / stepY) + 1 }, (_, row) => row).forEach((row) => {
    const y = -reach / 2 + row * stepY;
    const offset = row % 2 === 0 ? 0 : stepX / 2;
    Array.from({ length: Math.ceil(reach / stepX) + 2 }, (_, col) => col).forEach((col) => paintBrandAt(context, brand, box, -reach / 2 + offset + col * stepX, y, 1, WATERMARK_ALPHA));
  });
  context.restore();
}

export function paintBrand(context: Surface2D, scene: TextScene, plan: TextPlan): void {
  const { brand } = scene.look;
  if (brand === undefined) return;
  const unit = scene.areas.unit;
  const box = brandBox(brand, unit, canvasMeasure(context, brand.font ?? BRAND_FONT));
  if (brand.place === 'watermark') {
    paintWatermark(context, brand, box, scene.size);
    return;
  }
  if (brand.place === 'top' || brand.place === 'bottom') {
    const row = plan.brand ?? (brand.place === 'top' ? { ...scene.areas.top, height: box.height } : { ...scene.areas.bottom, y: scene.areas.bottom.y + scene.areas.bottom.height - box.height, height: box.height });
    paintBrandAt(context, brand, box, row.x + row.width / 2, row.y + row.height / 2, plan.brandScale);
    return;
  }
  const corner = cornerBrandRect(scene, box);
  if (corner !== null) paintBrandAt(context, brand, box, corner.x + corner.width / 2, corner.y + corner.height / 2, 1);
}

/** Le rectangle d'une signature posée dans un coin de l'intérieur — `null` hors des quatre coins. */
function cornerBrandRect(scene: TextScene, box: BrandBox): Rect | null {
  const place = scene.look.brand?.place;
  if (place === undefined || place === 'top' || place === 'bottom' || place === 'watermark') return null;
  const pad = scene.areas.unit * 0.035;
  const inner = scene.areas.inner;
  const x = place.endsWith('left') ? inner.x + pad : inner.x + inner.width - pad - box.width;
  const y = place.startsWith('top') ? inner.y + pad : inner.y + inner.height - pad - box.height;
  return { x, y, width: box.width, height: box.height };
}

/** Les ornements qui tiennent un COIN haut de la toile : la largeur et la hauteur qu'ils y prennent (en `unit`). */
const TOP_CORNER_ORNAMENTS: Readonly<Partial<Record<FrameLook['ornaments'][number]['kind'], { readonly width: number; readonly height: number }>>> = {
  moon: { width: 0.17, height: 0.15 },
  rec: { width: 0.24, height: 0.065 },
};

const overlapsRow = (row: Rect, top: number, bottom: number): boolean => top < row.y + row.height && row.y < bottom;

/** Ce qu'une signature posée dans un coin prend à une rangée de texte qu'elle croise : sa largeur et son côté. */
function brandAllowance(scene: TextScene, row: Rect, measure: MeasureText): { readonly width: number; readonly side: 'left' | 'right' } | null {
  const { brand } = scene.look;
  if (brand === undefined) return null;
  const corner = cornerBrandRect(scene, brandBox(brand, scene.areas.unit, measure));
  if (corner === null || !overlapsRow(row, corner.y, corner.y + corner.height)) return null;
  return { width: corner.width + scene.areas.unit * 0.06, side: brand.place.endsWith('left') ? 'left' : 'right' };
}

/** La largeur que prennent les ornements de coin (lune, REC) à une rangée qu'ils croisent — ils CÈDENT au titre quand il ne tiendrait plus qu'en se tronquant. */
const ornamentAllowance = (scene: TextScene, row: Rect): number =>
  Math.max(
    0,
    ...scene.look.ornaments.map((ornament) => {
      const corner = TOP_CORNER_ORNAMENTS[ornament.kind];
      return corner !== undefined && overlapsRow(row, scene.areas.inner.y, scene.areas.inner.y + corner.height * scene.areas.unit) ? corner.width * scene.areas.unit : 0;
    }),
  );

type FittedRow = { readonly text: string; readonly px: number; readonly row: Rect; readonly cx: number; readonly title: FrameTitle };

/**
 * Le titre et le sous-titre, ajustés à leur rangée — ce que `paintTitles`
 * écrit et ce que les ornements évitent. Centré, en laissant la place d'un
 * coin occupé des DEUX côtés ; si le texte ne tient alors qu'en se tronquant,
 * les ornements de coin cèdent, puis le titre se décale du côté libre plutôt
 * que de perdre ses lettres.
 */
function fittedTitles(context: Surface2D, scene: TextScene, plan: TextPlan): readonly FittedRow[] {
  const unit = scene.areas.unit;
  const context_ = { people: scene.people, texts: scene.texts };
  return ([
    [scene.look.title, plan.title],
    [scene.look.subtitle, plan.subtitle],
  ] as const).flatMap(([title, row]) => {
    if (!titleShown(title) || row === null) return [];
    const text = titleText(title.source, context_, title.case);
    if (text.length === 0) return [];
    const scale = title.place === 'top' ? plan.textScale.top : plan.textScale.bottom;
    const px = unit * TITLE_SHARE[title.size] * scale;
    const measure = canvasMeasure(context, title.font);
    const brand = brandAllowance(scene, row, canvasMeasure(context, scene.look.brand?.font ?? BRAND_FONT));
    const brandWidth = brand?.width ?? 0;
    const ornaments = title.place === 'top' ? ornamentAllowance(scene, row) : 0;
    const whole = (fitted: FittedText): boolean => fitted.text === text && fitted.px >= px * 0.75;
    const centered = (allowance: number) => ({ fitted: fitText(measure, text, row.width - allowance * 2 - unit * 0.02, px), cx: row.x + row.width / 2 });
    const shifted = () => {
      const width = row.width - brandWidth - unit * 0.02;
      return { fitted: fitText(measure, text, width, px), cx: brand?.side === 'left' ? row.x + brandWidth + width / 2 : row.x + width / 2 };
    };
    const crowded = centered(Math.max(brandWidth, ornaments));
    const roomy = centered(brandWidth);
    const chosen = whole(crowded.fitted) ? crowded : whole(roomy.fitted) || brand === null ? roomy : shifted();
    return chosen.fitted.text.length === 0 ? [] : [{ text: chosen.fitted.text, px: chosen.fitted.px, row, cx: chosen.cx, title }];
  });
}

/** Ce que les textes des réserves occupent : le plan, l'encombrement de chaque texte, et celui du titre (que le ruban habille). */
export type TextLayout = { readonly plan: TextPlan; readonly boxes: readonly Rect[]; readonly headline: Rect | null };

export function textLayout(context: Surface2D, scene: TextScene): TextLayout {
  const brandMeasure = canvasMeasure(context, scene.look.brand?.font ?? BRAND_FONT);
  const plan = planText(scene.look, scene.people.length, scene.areas, brandMeasure);
  const titles = fittedTitles(context, scene, plan).map((fitted) => {
    const width = canvasMeasure(context, fitted.title.font)(fitted.text, fitted.px) + fitted.px * 0.8;
    return { x: fitted.cx - width / 2, y: fitted.row.y, width, height: fitted.row.height };
  });
  const box = scene.look.brand === undefined ? null : brandBox(scene.look.brand, scene.areas.unit, brandMeasure);
  const corner = box === null ? null : cornerBrandRect(scene, box);
  const brand = box === null ? [] : plan.brand !== null ? [{ x: plan.brand.x + (plan.brand.width - box.width) / 2 - box.px * 0.3, y: plan.brand.y, width: box.width + box.px * 0.6, height: plan.brand.height }] : corner === null ? [] : [corner];
  const list = plan.list === null ? [] : [plan.list];
  return { plan, boxes: [...titles, ...brand, ...list], headline: titles[0] ?? null };
}

export function paintTitles(context: Surface2D, scene: TextScene, plan: TextPlan): void {
  fittedTitles(context, scene, plan).forEach((fitted) =>
    inkText(context, fitted.text, fitted.cx, fitted.row.y + fitted.row.height / 2, { font: fitted.title.font, px: fitted.px, color: fitted.title.color, effect: fitted.title.effect ?? 'none' }),
  );
}

type NameBox = { readonly box: FrameSlotBox; readonly person: FramePerson; readonly lines: readonly string[] };

const nameInk = (names: FrameNames, px: number, line: number): Ink => ({ font: names.font, px: line === 0 ? px : px * 0.78, color: line === 0 ? names.color : tint(names.color, 0.82), effect: 'none' });

const defaultFill = (names: FrameNames): string => names.fill ?? (luminance(names.color) > 0.5 ? 'rgba(12, 12, 16, 0.62)' : 'rgba(255, 255, 255, 0.88)');

/** Les lignes d'un nom, empilées et centrées sur (`cx`, `cy`), chacune ajustée à `maxWidth`. */
function nameLines(context: Surface2D, names: FrameNames, lines: readonly string[], cx: number, cy: number, px: number, maxWidth: number, align: CanvasTextAlign = 'center'): void {
  const heights = lines.map((_, index) => (index === 0 ? px : px * 0.78) * 1.2);
  const total = heights.reduce((sum, height) => sum + height, 0);
  const measure = canvasMeasure(context, names.font);
  lines.forEach((line, index) => {
    const ink = nameInk(names, px, index);
    const fitted = fitText(measure, line, maxWidth, ink.px);
    const y = cy - total / 2 + heights.slice(0, index).reduce((sum, height) => sum + height, 0) + (heights[index] ?? 0) / 2;
    inkText(context, fitted.text, cx, y, { ...ink, px: fitted.px }, align);
  });
}

const blockHeight = (lines: number, px: number): number => (lines <= 0 ? 0 : px * 1.2 + (lines - 1) * px * 0.78 * 1.2);

/**
 * La place libre sous une case : jusqu'à la première case qui la chevauche en
 * largeur et descend plus bas qu'elle (zéro si elle mord déjà sur son bas),
 * ou jusqu'aux textes de la réserve basse.
 */
function roomBelow(scene: TextScene, plan: TextPlan, box: FrameSlotBox): number {
  const own = footprint(box);
  const bottom = own.y + own.height;
  const floors = scene.slots
    .filter((other) => other !== box)
    .map(footprint)
    .filter((other) => other.x < own.x + own.width && own.x < other.x + other.width && other.y + other.height > bottom)
    .map((other) => Math.max(bottom, other.y));
  const texts = [plan.title, plan.subtitle, plan.list, plan.brand].filter((row): row is Rect => row !== null && row.y >= scene.areas.bottom.y - 1).map((row) => row.y);
  return Math.min(scene.areas.content.y + scene.areas.content.height + scene.areas.bottom.height * 0.4, ...texts, ...floors) - bottom;
}

type Band = 'top' | 'bottom';

/**
 * Le bord d'une case où poser un texte INTÉRIEUR : en bas, sauf si une case
 * dessinée PAR-DESSUS (diagonal, cascade) en couvre le bas et pas le haut.
 * Un nom ne se peint jamais sur le visage d'un autre.
 */
function freeBand(scene: TextScene, box: FrameSlotBox): Band {
  const own = footprint(box);
  const band = (at: Band): Rect => ({ x: own.x, y: at === 'top' ? own.y : own.y + own.height * 0.7, width: own.width, height: own.height * 0.3 });
  const above = scene.slots.filter((other) => other.index > box.index).map(footprint);
  const covered = (at: Band): boolean => above.some((other) => intersects(other, band(at)));
  return covered('bottom') && !covered('top') ? 'top' : 'bottom';
}

/** Le coin d'une bulle : en haut à droite, sinon le premier coin qu'aucune case posée par-dessus ne couvre. */
function freeCorner(scene: TextScene, box: FrameSlotBox): 'top-right' | 'top-left' | 'bottom-left' {
  const own = footprint(box);
  const corner = (at: 'top-right' | 'top-left' | 'bottom-left'): Rect => ({ x: at === 'top-right' ? own.x + own.width * 0.5 : own.x, y: at === 'bottom-left' ? own.y + own.height * 0.7 : own.y, width: own.width * 0.5, height: own.height * 0.3 });
  const above = scene.slots.filter((other) => other.index > box.index).map(footprint);
  return (['top-right', 'top-left', 'bottom-left'] as const).find((at) => !above.some((other) => intersects(other, corner(at)))) ?? 'top-right';
}

function paintPlate(context: Surface2D, scene: TextScene, item: NameBox, px: number, scrim: boolean): void {
  const { names, slot } = scene.look;
  const photo = photoRect(item.box.rect, slot.card);
  const inner = shapeInnerRect(item.box.shape, photo);
  const band = blockHeight(item.lines.length, px) + px * 0.7;
  const edge = freeBand(scene, item.box);
  context.save();
  enterSlot(context, item.box);
  slotPath(context, item.box.shape, photo, { radius: slot.radius, seed: item.box.index });
  context.clip();
  const top = edge === 'bottom' ? inner.y + inner.height - band : inner.y;
  const shade = luminance(names.color) > 0.5 ? 'rgba(0, 0, 0, 0.62)' : 'rgba(255, 255, 255, 0.72)';
  if (scrim) {
    const [from, to] = edge === 'bottom' ? [top - band * 0.6, photo.y + photo.height] : [photo.y, top + band * 1.6];
    const fade = context.createLinearGradient(0, from, 0, to);
    fade.addColorStop(edge === 'bottom' ? 0 : 1, 'rgba(0, 0, 0, 0)');
    fade.addColorStop(edge === 'bottom' ? 1 : 0, shade);
    context.fillStyle = fade;
    context.fillRect(photo.x, from, photo.width, to - from);
  } else {
    context.fillStyle = defaultFill(names);
    if (edge === 'bottom') context.fillRect(photo.x, top, photo.width, photo.y + photo.height - top);
    else context.fillRect(photo.x, photo.y, photo.width, top + band - photo.y);
  }
  nameLines(context, names, item.lines, inner.x + inner.width / 2, top + band / 2, px, inner.width * 0.9);
  context.restore();
}

function paintBadge(context: Surface2D, scene: TextScene, item: NameBox, px: number): void {
  const { names, slot } = scene.look;
  const photo = photoRect(item.box.rect, slot.card);
  const inner = shapeInnerRect(item.box.shape, photo);
  const measure = canvasMeasure(context, names.font);
  const small = px * 0.82;
  const width = Math.min(inner.width * 0.86, Math.max(...item.lines.map((line, index) => measure(line, index === 0 ? small : small * 0.78))) + small * 1.3);
  const height = blockHeight(item.lines.length, small) + small * 0.55;
  const x = inner.x + small * 0.5;
  const y = freeBand(scene, item.box) === 'bottom' ? inner.y + inner.height - height - small * 0.5 : inner.y + small * 0.5;
  context.save();
  enterSlot(context, item.box);
  context.fillStyle = defaultFill(names);
  context.shadowColor = 'rgba(0, 0, 0, 0.25)';
  context.shadowBlur = small * 0.4;
  context.beginPath();
  roundedRectPath(context, { x, y, width, height }, Math.min(height / 2, small));
  context.fill();
  context.shadowBlur = 0;
  nameLines(context, names, item.lines, x + width / 2, y + height / 2, small, width - small);
  context.restore();
}

function paintBubble(context: Surface2D, scene: TextScene, item: NameBox, px: number): void {
  const { names, slot } = scene.look;
  const photo = photoRect(item.box.rect, slot.card);
  const inner = shapeInnerRect(item.box.shape, photo);
  const measure = canvasMeasure(context, names.font);
  const small = px * 0.85;
  const width = Math.min(inner.width * 0.72, Math.max(...item.lines.map((line, index) => measure(line, index === 0 ? small : small * 0.78))) + small * 1.6);
  const height = blockHeight(item.lines.length, small) + small * 0.9;
  const corner = freeCorner(scene, item.box);
  const x = corner === 'top-right' ? inner.x + inner.width - width - small * 0.4 : inner.x + small * 0.4;
  const y = corner === 'bottom-left' ? inner.y + inner.height - height - small * 1.2 : inner.y + small * 0.4;
  const fill = names.fill ?? '#FFFFFF';
  const line = Math.max(1, small * 0.08);
  context.save();
  enterSlot(context, item.box);
  context.fillStyle = fill;
  context.strokeStyle = mix(fill, '#000000', 0.55);
  context.lineWidth = line;
  context.shadowColor = 'rgba(0, 0, 0, 0.22)';
  context.shadowBlur = small * 0.35;
  context.beginPath();
  roundedRectPath(context, { x, y, width, height }, height * 0.45);
  context.moveTo(x + width * 0.3, y + height - 1);
  context.lineTo(x + width * 0.14, y + height + small * 0.7);
  context.lineTo(x + width * 0.46, y + height - 1);
  context.fill();
  context.shadowBlur = 0;
  context.stroke();
  context.fillRect(x + width * 0.3 + line, y + height - line * 1.5, width * 0.16 - line * 2, line * 2);
  nameLines(context, names, item.lines, x + width / 2, y + height / 2, small, width - small);
  context.restore();
}

/** Sous la case : la légende, la banderole à bouts pliés, l'étiquette manuscrite inclinée. */
function paintBelow(context: Surface2D, scene: TextScene, item: NameBox, px: number): void {
  const { names } = scene.look;
  const own = footprint(item.box);
  const cx = own.x + own.width / 2;
  const height = blockHeight(item.lines.length, px);
  const measure = canvasMeasure(context, names.font);
  const textWidth = Math.max(...item.lines.map((line, index) => measure(line, index === 0 ? px : px * 0.78)));
  context.save();
  if (names.style === 'caption') {
    nameLines(context, names, item.lines, cx, own.y + own.height + px * 0.3 + height / 2, px, Math.max(own.width, scene.areas.unit * 0.3));
    context.restore();
    return;
  }
  const fill = defaultFill(names);
  if (names.style === 'ribbon') {
    const bandHeight = height + px * 0.55;
    const width = Math.min(own.width * 0.96, textWidth + px * 2.2);
    const top = own.y + own.height + px * 0.3;
    const left = cx - width / 2;
    const tail = bandHeight * 0.55;
    context.fillStyle = mix(fill, '#000000', 0.3);
    [-1, 1].forEach((side) => {
      const edge = side < 0 ? left + tail * 0.5 : left + width - tail * 0.5;
      const outer = edge + side * tail;
      context.beginPath();
      context.moveTo(edge, top + bandHeight * 0.22);
      context.lineTo(outer, top + bandHeight * 0.22);
      context.lineTo(outer - side * tail * 0.4, top + bandHeight * 0.72);
      context.lineTo(outer, top + bandHeight * 1.22);
      context.lineTo(edge, top + bandHeight * 1.22);
      context.closePath();
      context.fill();
    });
    context.fillStyle = fill;
    context.fillRect(left, top, width, bandHeight);
    nameLines(context, names, item.lines, cx, top + bandHeight / 2, px, width - px);
    context.restore();
    return;
  }
  const width = Math.min(own.width * 0.9, textWidth + px * 2);
  const tagHeight = height + px * 0.6;
  const top = own.y + own.height + px * 0.25;
  context.translate(cx, top + tagHeight / 2);
  context.rotate(-0.07);
  context.fillStyle = names.fill ?? '#FFF6E0';
  context.shadowColor = 'rgba(0, 0, 0, 0.25)';
  context.shadowBlur = px * 0.3;
  context.shadowOffsetY = px * 0.08;
  context.beginPath();
  context.moveTo(-width / 2 + tagHeight * 0.35, -tagHeight / 2);
  context.lineTo(width / 2, -tagHeight / 2);
  context.lineTo(width / 2, tagHeight / 2);
  context.lineTo(-width / 2 + tagHeight * 0.35, tagHeight / 2);
  context.lineTo(-width / 2, 0);
  context.closePath();
  context.fill();
  context.shadowColor = 'transparent';
  context.fillStyle = 'rgba(0, 0, 0, 0.25)';
  context.beginPath();
  context.arc(-width / 2 + tagHeight * 0.3, 0, tagHeight * 0.09, 0, Math.PI * 2);
  context.fill();
  nameLines(context, names, item.lines, tagHeight * 0.18, 0, px, width - tagHeight * 0.6);
  context.restore();
}

function paintList(context: Surface2D, scene: TextScene, plan: TextPlan): void {
  const row = plan.list;
  if (row === null) return;
  const { names } = scene.look;
  const entries = scene.people.map((person) => listEntry(person, names.show)).filter((entry) => entry.length > 0);
  if (entries.length === 0) return;
  const px = scene.areas.unit * LIST_SHARE * Math.max(plan.textScale.bottom, MIN_ROW_SCALE);
  const measure = canvasMeasure(context, names.font);
  const single = entries.join('  ·  ');
  const width = row.width * 0.94;
  const lines = measure(single, px) <= width || entries.length < 2 ? [single] : [entries.slice(0, Math.ceil(entries.length / 2)).join('  ·  '), entries.slice(Math.ceil(entries.length / 2)).join('  ·  ')];
  const lineHeight = row.height / lines.length;
  lines.forEach((line, index) => {
    const fitted = fitText(measure, line, width, px);
    inkText(context, fitted.text, row.x + row.width / 2, row.y + lineHeight * (index + 0.5), { font: names.font, px: fitted.px, color: names.color, effect: 'none' });
  });
}

/** La taille de base d'un nom, bornée par la case : une grande tablée n'a pas de noms plus gros que ses visages. */
const namePx = (scene: TextScene, box: FrameSlotBox): number => Math.min(scene.areas.unit * NAME_SHARE, Math.min(box.rect.width, box.rect.height) * 0.1);

export function paintNames(context: Surface2D, scene: TextScene, plan: TextPlan): void {
  const { names, slot } = scene.look;
  if (names.show === 'none') return;
  if (names.style === 'list') {
    paintList(context, scene, plan);
    return;
  }
  const items: readonly NameBox[] = scene.slots.flatMap((box) => {
    const person = scene.people[box.index];
    if (person === undefined) return [];
    const lines = personLines(person, names.show);
    return lines.length === 0 ? [] : [{ box, person, lines }];
  });
  const inFoot = names.style === 'caption' && slot.card !== undefined && slot.card.foot > 0.08;
  const outside = !inFoot && (names.style === 'caption' || names.style === 'ribbon' || names.style === 'tag');
  const roomy = outside && items.every((item) => roomBelow(scene, plan, item.box) >= blockHeight(item.lines.length, namePx(scene, item.box)) * (names.style === 'caption' ? 1.35 : 1.9));
  items.forEach((item) => {
    const px = namePx(scene, item.box);
    if (inFoot && slot.card !== undefined) {
      const photo = photoRect(item.box.rect, slot.card);
      const footTop = photo.y + photo.height;
      const footHeight = item.box.rect.y + item.box.rect.height - footTop;
      context.save();
      enterSlot(context, item.box);
      nameLines(context, names, item.lines, photo.x + photo.width / 2, footTop + footHeight / 2, Math.min(px * 1.1, footHeight / (item.lines.length + 0.6)), photo.width * 0.92);
      context.restore();
      return;
    }
    if (outside && roomy) {
      paintBelow(context, scene, item, px);
      return;
    }
    if (outside) {
      paintPlate(context, scene, item, px, names.fill === undefined);
      return;
    }
    if (names.style === 'plate') paintPlate(context, scene, item, px, false);
    else if (names.style === 'badge') paintBadge(context, scene, item, px);
    else paintBubble(context, scene, item, px);
  });
}

/** Les textes, dans l'ordre du § 5.1 : noms, titre et sous-titre, signature. */
export function paintFrameTexts(context: Surface2D, scene: TextScene, plan: TextPlan = textLayout(context, scene).plan): void {
  paintNames(context, scene, plan);
  paintTitles(context, scene, plan);
  paintBrand(context, scene, plan);
}
