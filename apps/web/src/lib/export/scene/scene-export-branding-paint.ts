import { initialsOf } from '@/lib/view/conversation';

import type { BrandingIdentity } from './scene-export-branding-identity';
import { BRANDING_TIMING } from './scene-export-branding-plan';
import type { ScenePaintable } from './scene-export-paint';

/**
 * **LA PEINTURE CANVAS DE L'INTRO ET DE LA CARTE DE FIN** (#13997, #10537) —
 * miroir de `StoryExportIntro.render` / `drawIdentity` et de
 * `StoryExportOutro.renderFrame` (iOS), au gabarit de la scène exportée.
 *
 * Intro : bannière (aspect-fill) ou dégradé d'accent → noir, voile de
 * lisibilité 0,62 / 0,28 / 0,72, avatar rond centré (initiales sur l'accent
 * sans photo), nom et @username dessous, capsule d'humeur. Deux ajouts du
 * porteur (2026-10-31) : le point de PRÉSENCE posé sur le bord bas-droit de
 * l'avatar (22 % du diamètre, liseré sombre), et le LOGO de cercle à droite
 * du nom, même ligne, même corps de police.
 *
 * Fin : le logo Meeshy qui se trace puis respire sur indigo 950 → noir ; avec
 * un auteur, le logo reste 1,5 s puis passe en filigrane (22 %) derrière
 * l'identité qui entre en fondu sur 0,4 s.
 */

export type BrandingImages = { readonly avatar: CanvasImageSource | null; readonly banner: CanvasImageSource | null };

export type BrandingCanvas = {
  readonly ctx: ScenePaintable;
  readonly width: number;
  readonly height: number;
  readonly fontFamily: string;
};

const INDIGO_950 = '#1E1B4B';
const LOGO_RGB = '99, 102, 241';
const DASHES: readonly { readonly fromX: number; readonly toX: number; readonly y: number }[] = [
  { fromX: 262, toX: 762, y: 384 },
  { fromX: 262, toX: 662, y: 512 },
  { fromX: 262, toX: 562, y: 640 },
];
const DASH_LINE_WIDTH = 112;
const TRACE_SECONDS = 1.1;

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

const hexColor = (hex: string): string => `#${hex.replace('#', '')}`;

function fillGradient(canvas: BrandingCanvas, gradient: CanvasGradient): void {
  canvas.ctx.fillStyle = gradient;
  canvas.ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function drawCover(canvas: BrandingCanvas, source: CanvasImageSource, box: { readonly x: number; readonly y: number; readonly w: number; readonly h: number }): void {
  const sourceWidth = Number((source as { width?: number }).width ?? box.w) || box.w;
  const sourceHeight = Number((source as { height?: number }).height ?? box.h) || box.h;
  const scale = Math.max(box.w / sourceWidth, box.h / sourceHeight);
  const drawnW = sourceWidth * scale;
  const drawnH = sourceHeight * scale;
  canvas.ctx.save();
  canvas.ctx.beginPath();
  canvas.ctx.rect(box.x, box.y, box.w, box.h);
  canvas.ctx.clip();
  canvas.ctx.drawImage(source, box.x + (box.w - drawnW) / 2, box.y + (box.h - drawnH) / 2, drawnW, drawnH);
  canvas.ctx.restore();
}

function paintBackdrop(canvas: BrandingCanvas, identity: BrandingIdentity, images: BrandingImages): void {
  const { ctx, width, height } = canvas;
  if (images.banner !== null) {
    drawCover(canvas, images.banner, { x: 0, y: 0, w: width, h: height });
    return;
  }
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, hexColor(identity.accentHex));
  gradient.addColorStop(1, '#000000');
  fillGradient(canvas, gradient);
}

function paintScrim(canvas: BrandingCanvas): void {
  const gradient = canvas.ctx.createLinearGradient(canvas.width / 2, 0, canvas.width / 2, canvas.height);
  gradient.addColorStop(0, 'rgba(0, 0, 0, 0.62)');
  gradient.addColorStop(0.5, 'rgba(0, 0, 0, 0.28)');
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0.72)');
  fillGradient(canvas, gradient);
}

const font = (canvas: BrandingCanvas, size: number, weight: 'bold' | 'normal'): string => `${weight} ${size}px ${canvas.fontFamily}`;

function paintText(canvas: BrandingCanvas, params: { readonly text: string; readonly x: number; readonly y: number; readonly size: number; readonly weight: 'bold' | 'normal'; readonly alpha: number }): void {
  const { ctx } = canvas;
  ctx.save();
  ctx.font = font(canvas, params.size, params.weight);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.globalAlpha *= params.alpha;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(params.text, params.x, params.y);
  ctx.restore();
}

function measure(canvas: BrandingCanvas, text: string, size: number, weight: 'bold' | 'normal'): number {
  canvas.ctx.save();
  canvas.ctx.font = font(canvas, size, weight);
  const width = canvas.ctx.measureText(text).width;
  canvas.ctx.restore();
  return width;
}

type AvatarBox = { readonly x: number; readonly y: number; readonly side: number };

function paintAvatar(canvas: BrandingCanvas, identity: BrandingIdentity, images: BrandingImages, box: AvatarBox): void {
  const { ctx } = canvas;
  const cx = box.x + box.side / 2;
  const cy = box.y + box.side / 2;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, box.side / 2, 0, Math.PI * 2);
  ctx.clip();
  if (images.avatar !== null) drawCover(canvas, images.avatar, { x: box.x, y: box.y, w: box.side, h: box.side });
  else {
    ctx.fillStyle = hexColor(identity.accentHex);
    ctx.fillRect(box.x, box.y, box.side, box.side);
  }
  ctx.restore();
  if (images.avatar !== null) return;
  ctx.save();
  ctx.font = font(canvas, box.side * 0.38, 'bold');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(initialsOf(identity.displayName), cx, cy);
  ctx.restore();
}

/** Le point de présence : 22 % du diamètre, sur le bord bas-droit de l'avatar, cerclé d'un liseré sombre. */
function paintPresenceDot(canvas: BrandingCanvas, hex: string, box: AvatarBox): void {
  const { ctx } = canvas;
  const radius = box.side * 0.22 * 0.5;
  const edge = (box.side / 2) * Math.SQRT1_2;
  const cx = box.x + box.side / 2 + edge;
  const cy = box.y + box.side / 2 + edge;
  const rim = radius * 0.36;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius + rim, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.82)';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = hex;
  ctx.fill();
  ctx.restore();
}

/** Le nom, et à sa droite le logo du cercle : même ligne, même corps de police. */
function paintNameLine(canvas: BrandingCanvas, identity: BrandingIdentity, top: number, size: number): void {
  const gap = identity.circleBadge === null ? 0 : size * 0.3;
  const nameWidth = measure(canvas, identity.displayName, size, 'bold');
  const badgeWidth = identity.circleBadge === null ? 0 : measure(canvas, identity.circleBadge, size, 'bold');
  const left = (canvas.width - (nameWidth + gap + badgeWidth)) / 2;
  paintText(canvas, { text: identity.displayName, x: left, y: top, size, weight: 'bold', alpha: 1 });
  if (identity.circleBadge !== null) paintText(canvas, { text: identity.circleBadge, x: left + nameWidth + gap, y: top, size, weight: 'bold', alpha: 1 });
}

function paintMoodCapsule(canvas: BrandingCanvas, identity: BrandingIdentity, centreY: number): void {
  if (identity.moodEmoji === null) return;
  const { ctx, width } = canvas;
  const emojiSize = width * 0.04;
  const messageSize = width * 0.032;
  const emojiWidth = measure(canvas, identity.moodEmoji, emojiSize, 'normal');
  const messageWidth = identity.moodMessage === null ? 0 : measure(canvas, identity.moodMessage, messageSize, 'normal');
  const spacing = identity.moodMessage === null ? 0 : width * 0.02;
  const padH = width * 0.03;
  const height = Math.max(emojiSize, identity.moodMessage === null ? 0 : messageSize) * 1.25 + width * 0.032;
  const capsuleWidth = emojiWidth + spacing + messageWidth + padH * 2;
  const left = (width - capsuleWidth) / 2;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(left, centreY - height / 2, capsuleWidth, height, height / 2);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
  ctx.fill();
  ctx.restore();
  paintText(canvas, { text: identity.moodEmoji, x: left + padH, y: centreY - emojiSize / 2, size: emojiSize, weight: 'normal', alpha: 1 });
  if (identity.moodMessage !== null) {
    paintText(canvas, { text: identity.moodMessage, x: left + padH + emojiWidth + spacing, y: centreY - messageSize / 2, size: messageSize, weight: 'normal', alpha: 0.9 });
  }
}

/** Avatar, point de présence, nom + logo de cercle, @username, capsule d'humeur. */
export function paintIdentity(canvas: BrandingCanvas, identity: BrandingIdentity, images: BrandingImages): void {
  const { width, height } = canvas;
  const side = width * 0.28;
  const box: AvatarBox = { x: (width - side) / 2, y: height * 0.5 - side * 0.9, side };
  paintAvatar(canvas, identity, images, box);
  if (identity.presenceDotHex !== null) paintPresenceDot(canvas, identity.presenceDotHex, box);
  const nameSize = width * 0.058;
  const handleSize = width * 0.036;
  const nameTop = box.y + side + nameSize * 0.9;
  paintNameLine(canvas, identity, nameTop, nameSize);
  const handle = `@${identity.username}`;
  const handleTop = nameTop + nameSize * 1.4;
  paintText(canvas, { text: handle, x: (width - measure(canvas, handle, handleSize, 'normal')) / 2, y: handleTop, size: handleSize, weight: 'normal', alpha: 0.75 });
  paintMoodCapsule(canvas, identity, handleTop + handleSize * 2.6);
}

/** L'interlude d'identité d'ouverture : fond, voile, identité — opaque. */
export function paintIntroCard(canvas: BrandingCanvas, identity: BrandingIdentity, images: BrandingImages): void {
  paintBackdrop(canvas, identity, images);
  paintScrim(canvas);
  paintIdentity(canvas, identity, images);
}

function paintBrandBackground(canvas: BrandingCanvas): void {
  const gradient = canvas.ctx.createLinearGradient(canvas.width / 2, 0, canvas.width / 2, canvas.height);
  gradient.addColorStop(0, INDIGO_950);
  gradient.addColorStop(1, '#000000');
  fillGradient(canvas, gradient);
}

/** La progression du trait `barIndex` (easeOut), le tracé complet calé sur 1,1 s. */
export function traceProgress(tSeconds: number, barIndex: number): number {
  const elapsed = tSeconds * (3 / TRACE_SECONDS);
  const raw = clamp01((elapsed - barIndex * 0.6) / 1.8);
  return 1 - (1 - raw) ** 2;
}

function paintLogo(canvas: BrandingCanvas, tSeconds: number, opacityScale: number): void {
  const { ctx, width, height } = canvas;
  const side = width * 0.44;
  const left = (width - side) / 2;
  const top = height * 0.4 - side / 2;
  const breathe = (1 - Math.cos((2 * Math.PI * tSeconds) / 3)) / 2;
  const scale = 1 + 0.05 * breathe;
  const opacities = [0.82 + 0.18 * breathe, 1, 0.82 + 0.18 * breathe];
  const unit = side / 1024;
  ctx.save();
  ctx.translate(left + side / 2, top + side / 2);
  ctx.scale(scale, scale);
  ctx.translate(-side / 2, -side / 2);
  ctx.scale(unit, unit);
  ctx.lineCap = 'round';
  ctx.lineWidth = DASH_LINE_WIDTH;
  DASHES.forEach((dash, index) => {
    const progress = traceProgress(tSeconds, index);
    if (progress <= 0.001) return;
    ctx.strokeStyle = `rgba(${LOGO_RGB}, ${(opacities[index] ?? 1) * opacityScale})`;
    ctx.beginPath();
    ctx.moveTo(dash.fromX, dash.y);
    ctx.lineTo(dash.fromX + (dash.toX - dash.fromX) * progress, dash.y);
    ctx.stroke();
  });
  ctx.restore();
}

function paintWordmark(canvas: BrandingCanvas): void {
  const size = canvas.width * 0.072;
  const logoBottom = canvas.height * 0.4 + (canvas.width * 0.44) / 2;
  paintText(canvas, { text: 'meeshy', x: (canvas.width - measure(canvas, 'meeshy', size, 'bold')) / 2, y: logoBottom + size * 0.7, size, weight: 'bold', alpha: 1 });
}

/** La carte de fin SANS auteur : le logo qui se trace puis respire — opaque. */
export function paintLogoCard(canvas: BrandingCanvas, tSeconds: number): void {
  paintBrandBackground(canvas);
  paintLogo(canvas, tSeconds, 1);
  paintWordmark(canvas);
}

/** La carte de fin AVEC auteur à `tMs` : logo muet 1,5 s, puis logo en filigrane et identité en fondu. */
export function paintAuthorOutroCard(canvas: BrandingCanvas, params: { readonly tMs: number; readonly identity: BrandingIdentity; readonly images: BrandingImages }): void {
  const { tMs } = params;
  if (tMs < BRANDING_TIMING.authorLogoPhaseMs) {
    paintLogoCard(canvas, tMs / 1000);
    return;
  }
  paintBrandBackground(canvas);
  paintLogo(canvas, tMs / 1000, BRANDING_TIMING.authorWatermarkOpacity);
  paintScrim(canvas);
  canvas.ctx.save();
  canvas.ctx.globalAlpha *= clamp01((tMs - BRANDING_TIMING.authorLogoPhaseMs) / BRANDING_TIMING.authorIdentityFadeInMs);
  paintIdentity(canvas, params.identity, params.images);
  canvas.ctx.restore();
}
