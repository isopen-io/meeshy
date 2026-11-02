import type { CanvasObject } from '@/lib/canvas/document';
import { resolveSceneText } from '@/lib/canvas/text';
import { SCENE_TEXT_WRAP_FRACTION, sceneTextAppearance } from '@/lib/canvas/text-appearance';
import { textDirection, wrapText, type Measure } from '@/lib/export/message-card-text';

/**
 * **UN TEXTE DE SCÈNE, MIS EN PAGE POUR LE CANVAS D'EXPORT** (#13873) — la
 * MÊME apparence que `SceneObjectText` peint dans le lecteur (loi 6 : on
 * exporte ce qu'on voit) : le texte servi par le Prisme (`resolveSceneText`),
 * l'apparence choisie par l'auteur (`sceneTextAppearance` : famille, graisse,
 * alignement, ombres, contour des glyphes, pastille et liseré), la coupe à
 * 88 % de la scène, la taille au référentiel 1080, l'interligne 1,2.
 * Coordonnées centrées sur l'ancre de l'objet : le peintre y pose la pose.
 */

export type TextShadowSpec = { readonly offsetX: number; readonly offsetY: number; readonly blur: number; readonly color: string };

export type SceneTextLine = { readonly text: string; readonly x: number; readonly y: number };

export type SceneTextLayout = {
  readonly font: string;
  readonly color: string;
  readonly align: 'left' | 'center' | 'right';
  readonly direction: 'ltr' | 'rtl';
  readonly lineHeight: number;
  readonly lines: readonly SceneTextLine[];
  readonly box: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  readonly radius: number;
  readonly background?: string;
  readonly border?: { readonly width: number; readonly color: string };
  readonly stroke?: { readonly width: number; readonly color: string };
  readonly shadows: readonly TextShadowSpec[];
};

const LINE_HEIGHT = 1.2;
const DEFAULT_WEIGHT = 600;

function lengthPx(token: string, fontPx: number): number | null {
  if (token === '0') return 0;
  const match = /^(-?\d*\.?\d+)(px|em)$/.exec(token);
  if (match === null) return null;
  const value = Number(match[1]);
  return match[2] === 'em' ? value * fontPx : value;
}

function hexToRgba(hex: string, alpha: number): string {
  const digits = hex.replace('#', '');
  const n = Number.parseInt(digits, 16);
  if (digits.length !== 6 || Number.isNaN(n)) return hex;
  return `rgba(${(n >> 16) & 0xff},${(n >> 8) & 0xff},${n & 0xff},${alpha})`;
}

function resolveColor(raw: string, textColor: string): string {
  if (raw === 'currentColor') return textColor;
  const mixed = /^color-mix\(in srgb, currentColor (\d+(?:\.\d+)?)%, transparent\)$/.exec(raw);
  return mixed === null ? raw : hexToRgba(textColor, Number(mixed[1]) / 100);
}

/** Les ombres de `text-shadow`, séparées hors parenthèses — chacune en pixels du canvas. */
export function parseTextShadows(css: string, fontPx: number, textColor: string): readonly TextShadowSpec[] {
  const parts = css.split(/,(?![^(]*\))/).map((part) => part.trim()).filter((part) => part !== '' && part !== 'none');
  return parts.flatMap((part) => {
    const colorAt = part.search(/(rgba?\(|color-mix\(|#|currentColor|[a-z]+$)/);
    const lengths = (colorAt <= 0 ? part : part.slice(0, colorAt)).trim().split(/\s+/).filter((token) => token !== '');
    const color = colorAt <= 0 ? textColor : resolveColor(part.slice(colorAt).trim(), textColor);
    const [x, y, blur] = lengths.map((token) => lengthPx(token, fontPx));
    if (x === undefined || y === undefined || x === null || y === null) return [];
    return [{ offsetX: x, offsetY: y, blur: blur ?? 0, color }];
  });
}

const emPx = (value: string | undefined, fontPx: number, index: number): number => {
  const token = value?.split(/\s+/)[index] ?? value?.split(/\s+/)[0];
  return token === undefined ? 0 : lengthPx(token, fontPx) ?? 0;
};

function strokeOf(declaration: string | undefined, fontPx: number): SceneTextLayout['stroke'] {
  if (declaration === undefined) return undefined;
  const [width, color] = declaration.split(/\s+/);
  const px = width === undefined ? null : lengthPx(width, fontPx);
  return px === null || color === undefined ? undefined : { width: px, color };
}

function borderOf(declaration: string | undefined, fontPx: number): SceneTextLayout['border'] {
  if (declaration === undefined) return undefined;
  const [width, , color] = declaration.split(/\s+/);
  const px = width === undefined ? null : lengthPx(width, fontPx);
  return px === null || color === undefined ? undefined : { width: px, color };
}

function radiusOf(declaration: string | undefined, fontPx: number, height: number): number {
  if (declaration === undefined) return 0;
  if (declaration === '999px') return height / 2;
  return lengthPx(declaration, fontPx) ?? 0;
}

export function layoutSceneText(params: {
  readonly object: CanvasObject;
  readonly preferredLanguages: readonly string[];
  readonly sceneWidth: number;
  readonly measure: Measure;
  readonly defaultFamily: string;
}): SceneTextLayout | null {
  const resolved = resolveSceneText({ object: params.object, preferredLanguages: params.preferredLanguages });
  if (resolved.text === '') return null;
  const look = sceneTextAppearance(params.object.payload);
  const fontPx = Math.round(resolved.widthFraction * params.sceneWidth * 100) / 100;
  const font = `${look.fontStyle === 'italic' ? 'italic ' : ''}${look.fontWeight ?? DEFAULT_WEIGHT} ${fontPx}px ${look.fontFamily ?? params.defaultFamily}`;
  const padX = emPx(look.padding, fontPx, 1);
  const padY = emPx(look.padding, fontPx, 0);
  const border = borderOf(look.border, fontPx);
  const inset = (border?.width ?? 0) + padX;
  const contentMax = Math.max(1, params.sceneWidth * SCENE_TEXT_WRAP_FRACTION - 2 * inset);
  const wrapped = wrapText(resolved.text, contentMax, font, params.measure);
  const contentWidth = Math.min(contentMax, Math.max(0, ...wrapped.map((line) => params.measure(line, font))));
  const lineHeight = fontPx * LINE_HEIGHT;
  const width = contentWidth + 2 * inset;
  const height = wrapped.length * lineHeight + 2 * ((border?.width ?? 0) + padY);
  const x = look.textAlign === 'left' ? -contentWidth / 2 : look.textAlign === 'right' ? contentWidth / 2 : 0;
  const top = -(wrapped.length * lineHeight) / 2;
  const stroke = strokeOf(look.webkitTextStroke, fontPx);
  return {
    font,
    color: resolved.color,
    align: look.textAlign,
    direction: textDirection(resolved.text),
    lineHeight,
    lines: wrapped.map((text, index) => ({ text, x, y: top + lineHeight * (index + 0.5) })),
    box: { x: -width / 2, y: -height / 2, width, height },
    radius: radiusOf(look.borderRadius, fontPx, height),
    ...(look.backgroundColor !== undefined ? { background: look.backgroundColor } : {}),
    ...(border !== undefined ? { border } : {}),
    ...(stroke !== undefined ? { stroke } : {}),
    shadows: parseTextShadows(look.textShadow, fontPx, resolved.color),
  };
}
