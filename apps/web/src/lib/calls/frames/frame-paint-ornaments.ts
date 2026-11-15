import { heartPath } from '../call-montage-render';
import type { FrameOrnament, FrameOrnamentKind } from './frame-spec';
import { centerOf, clipToStage, countFor, enterSlot, intersects, mix, rand, spots, TAU, tint, type OrnamentStage, type Point, type Surface2D } from './frame-paint-kit';
import { bat, glowDisc, note, rose, RUNES, skull, sparkle, star5 } from './frame-paint-glyphs';

/**
 * **LES TRENTE-QUATRE ORNEMENTS** (#8741, spec § 4.4) — des dessins
 * vectoriels sobres, placés de façon DÉTERMINISTE (graine = rang de
 * l'ornement dans le cadre) : l'aperçu ne scintille pas. Un ornement `back`
 * dispose de toute la toile, sous les cases ; un ornement `front` ne se pose
 * que dans les marges et les réserves de texte (`clipToStage`), sauf les
 * trois qui HABILLENT une case sans toucher au visage : la couronne
 * au-dessus d'elle, les rubans adhésifs sur ses coins.
 */

type Spot = Point & { readonly r: number; readonly draw: number };

function scattered(stage: OrnamentStage, seed: number, base: number, density: FrameOrnament['density'], size: (draw: number) => number, draw: (spot: Spot) => void): void {
  spots(stage, seed, countFor(base, density), size).forEach(draw);
}

/** Les ornements qui habillent une case : ils se posent sur ses bords, jamais au milieu. */
const DRESSING: ReadonlySet<FrameOrnamentKind> = new Set(['crown', 'tape']);

export function paintOrnament(context: Surface2D, ornament: FrameOrnament, stage: OrnamentStage, rank: number): void {
  const u = stage.unit;
  const { width: w, height: h } = stage.size;
  const color = ornament.color;
  const seed = 1000 + rank * 131;
  const between = (draw: number, low: number, high: number): number => u * (low + rand(seed + 5, draw) * (high - low));
  context.save();
  if (!DRESSING.has(ornament.kind)) clipToStage(context, stage);
  context.fillStyle = color;
  context.strokeStyle = color;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  switch (ornament.kind) {
    case 'sparkles':
      scattered(stage, seed, 14, ornament.density, (d) => between(d, 0.012, 0.034), ({ x, y, r }) => {
        glowDisc(context, x, y, r * 1.5, color, 0.35);
        context.fillStyle = color;
        context.beginPath();
        sparkle(context, x, y, r);
        context.fill();
      });
      break;
    case 'bokeh':
      scattered(stage, seed, 9, ornament.density, (d) => between(d, 0.04, 0.12), ({ x, y, r }) => {
        const disc = context.createRadialGradient(x, y, 0, x, y, r);
        disc.addColorStop(0, tint(color, 0.7));
        disc.addColorStop(0.75, tint(color, 0.45));
        disc.addColorStop(1, tint(color, 0));
        context.fillStyle = disc;
        context.beginPath();
        context.arc(x, y, r, 0, TAU);
        context.fill();
      });
      break;
    case 'confetti':
      scattered(stage, seed, 34, ornament.density, (d) => between(d, 0.006, 0.011), ({ x, y, r, draw }) => {
        context.save();
        context.translate(x, y);
        context.rotate(rand(seed + 7, draw) * TAU);
        context.fillStyle = mix(color, '#FFFFFF', rand(seed + 8, draw) * 0.45);
        if (draw % 3 === 0) {
          context.beginPath();
          context.arc(0, 0, r * 0.7, 0, TAU);
          context.fill();
        } else context.fillRect(-r, -r * 0.45, r * 2, r * 0.9);
        context.restore();
      });
      break;
    case 'balloons':
      scattered(stage, seed, 4, ornament.density, (d) => between(d, 0.035, 0.055), ({ x, y, r, draw }) => {
        const body = mix(color, draw % 2 === 0 ? '#FFFFFF' : '#000000', 0.12);
        context.strokeStyle = tint(color, 0.55);
        context.lineWidth = Math.max(0.6, u * 0.0018);
        context.beginPath();
        context.moveTo(x, y + r * 1.2);
        context.bezierCurveTo(x - r * 0.5, y + r * 1.9, x + r * 0.5, y + r * 2.4, x - r * 0.1, y + r * 3.1);
        context.stroke();
        const shade = context.createRadialGradient(x - r * 0.35, y - r * 0.45, r * 0.1, x, y, r * 1.2);
        shade.addColorStop(0, mix(body, '#FFFFFF', 0.55));
        shade.addColorStop(0.4, body);
        shade.addColorStop(1, mix(body, '#000000', 0.3));
        context.fillStyle = shade;
        context.beginPath();
        context.ellipse(x, y, r, r * 1.2, 0, 0, TAU);
        context.fill();
        context.fillStyle = mix(body, '#000000', 0.25);
        context.beginPath();
        context.moveTo(x, y + r * 1.15);
        context.lineTo(x - r * 0.14, y + r * 1.34);
        context.lineTo(x + r * 0.14, y + r * 1.34);
        context.closePath();
        context.fill();
      });
      break;
    case 'stars':
      scattered(stage, seed, 16, ornament.density, (d) => between(d, 0.008, 0.022), ({ x, y, r, draw }) => {
        context.beginPath();
        star5(context, x, y, r, rand(seed + 9, draw) * 0.6);
        context.fill();
      });
      break;
    case 'hearts':
      scattered(stage, seed, 12, ornament.density, (d) => between(d, 0.012, 0.026), ({ x, y, r, draw }) => {
        context.save();
        context.translate(x, y);
        context.rotate((rand(seed + 9, draw) - 0.5) * 0.7);
        context.globalAlpha = 0.65 + rand(seed + 10, draw) * 0.35;
        heartPath(context, { x: -r, y: -r * 0.9, width: r * 2, height: r * 1.85 });
        context.fill();
        context.restore();
      });
      break;
    case 'fireflies':
      scattered(stage, seed, 22, ornament.density, (d) => between(d, 0.003, 0.006), ({ x, y, r }) => {
        glowDisc(context, x, y, r * 6, color, 0.5);
        context.fillStyle = mix(color, '#FFFFFF', 0.6);
        context.beginPath();
        context.arc(x, y, r, 0, TAU);
        context.fill();
      });
      break;
    case 'petals':
      scattered(stage, seed, 16, ornament.density, (d) => between(d, 0.01, 0.02), ({ x, y, r, draw }) => {
        context.save();
        context.translate(x, y);
        context.rotate(rand(seed + 9, draw) * TAU);
        const petal = context.createLinearGradient(0, -r, 0, r);
        petal.addColorStop(0, mix(color, '#FFFFFF', 0.4));
        petal.addColorStop(1, color);
        context.fillStyle = petal;
        context.beginPath();
        context.moveTo(0, -r);
        context.bezierCurveTo(r * 0.9, -r * 0.6, r * 0.7, r * 0.8, 0, r);
        context.bezierCurveTo(-r * 0.7, r * 0.8, -r * 0.9, -r * 0.6, 0, -r);
        context.fill();
        context.restore();
      });
      break;
    case 'leaves':
      scattered(stage, seed, 12, ornament.density, (d) => between(d, 0.014, 0.026), ({ x, y, r, draw }) => {
        context.save();
        context.translate(x, y);
        context.rotate(rand(seed + 9, draw) * TAU);
        context.fillStyle = mix(color, '#000000', rand(seed + 10, draw) * 0.25);
        context.beginPath();
        context.moveTo(-r, 0);
        context.quadraticCurveTo(0, -r * 0.8, r, 0);
        context.quadraticCurveTo(0, r * 0.8, -r, 0);
        context.fill();
        context.strokeStyle = mix(color, '#FFFFFF', 0.35);
        context.lineWidth = Math.max(0.5, r * 0.06);
        context.beginPath();
        context.moveTo(-r * 0.9, 0);
        context.lineTo(r * 0.85, 0);
        context.stroke();
        context.restore();
      });
      break;
    case 'bubbles':
      scattered(stage, seed, 12, ornament.density, (d) => between(d, 0.01, 0.03), ({ x, y, r }) => {
        context.fillStyle = tint(color, 0.12);
        context.lineWidth = Math.max(0.6, r * 0.08);
        context.beginPath();
        context.arc(x, y, r, 0, TAU);
        context.fill();
        context.stroke();
        context.strokeStyle = 'rgba(255, 255, 255, 0.75)';
        context.beginPath();
        context.arc(x, y, r * 0.68, Math.PI * 1.1, Math.PI * 1.45);
        context.stroke();
      });
      break;
    case 'snow':
      scattered(stage, seed, 48, ornament.density, (d) => (d % 7 === 0 ? between(d, 0.01, 0.016) : between(d, 0.002, 0.007)), ({ x, y, r, draw }) => {
        context.globalAlpha = 0.55 + rand(seed + 9, draw) * 0.45;
        if (draw % 7 !== 0) {
          context.beginPath();
          context.arc(x, y, r, 0, TAU);
          context.fill();
          return;
        }
        context.lineWidth = Math.max(0.6, r * 0.12);
        context.beginPath();
        Array.from({ length: 6 }, (_, arm) => (arm * Math.PI) / 3).forEach((angle) => {
          context.moveTo(x, y);
          context.lineTo(x + Math.cos(angle) * r, y + Math.sin(angle) * r);
          context.moveTo(x + Math.cos(angle) * r * 0.55, y + Math.sin(angle) * r * 0.55);
          context.lineTo(x + Math.cos(angle + 0.5) * r * 0.8, y + Math.sin(angle + 0.5) * r * 0.8);
        });
        context.stroke();
      });
      break;
    case 'rays': {
      const origin = { x: w * 0.5, y: -u * 0.1 };
      const reach = Math.hypot(w, h);
      const rays = countFor(7, ornament.density);
      Array.from({ length: rays }, (_, index) => index).forEach((index) => {
        const angle = Math.PI / 2 + (index - (rays - 1) / 2) * (1.4 / rays) + (rand(seed, index) - 0.5) * 0.08;
        const spread = 0.035 + rand(seed + 1, index) * 0.05;
        const beam = context.createLinearGradient(origin.x, origin.y, origin.x + Math.cos(angle) * reach, origin.y + Math.sin(angle) * reach);
        beam.addColorStop(0, tint(color, 0.55));
        beam.addColorStop(1, tint(color, 0));
        context.fillStyle = beam;
        context.beginPath();
        context.moveTo(origin.x, origin.y);
        context.lineTo(origin.x + Math.cos(angle - spread) * reach, origin.y + Math.sin(angle - spread) * reach);
        context.lineTo(origin.x + Math.cos(angle + spread) * reach, origin.y + Math.sin(angle + spread) * reach);
        context.closePath();
        context.fill();
      });
      break;
    }
    case 'glitch':
      Array.from({ length: countFor(10, ornament.density) }, (_, index) => index).forEach((index) => {
        const y = rand(seed, index) * h;
        const x = rand(seed + 1, index) * w * 0.8;
        const width = u * (0.08 + rand(seed + 2, index) * 0.4);
        const height = u * (0.003 + rand(seed + 3, index) * 0.014);
        context.fillStyle = tint(color, 0.7);
        context.fillRect(x, y, width, height);
        context.fillStyle = index % 2 === 0 ? 'rgba(0, 255, 240, 0.35)' : 'rgba(255, 0, 170, 0.35)';
        context.fillRect(x + u * 0.012, y + height, width * 0.6, height * 0.6);
      });
      break;
    case 'scanlines': {
      const step = Math.max(2, u * 0.006);
      context.beginPath();
      Array.from({ length: Math.ceil(h / step) }, (_, index) => index * step).forEach((y) => context.rect(0, y, w, step * 0.35));
      context.fill();
      break;
    }
    case 'grain': {
      const dot = Math.max(0.6, u * 0.002);
      const count = countFor(1400, ornament.density);
      context.beginPath();
      Array.from({ length: count }, (_, index) => context.rect(rand(seed, index) * w, rand(seed + 1, index) * h, dot, dot));
      context.fill();
      break;
    }
    case 'vignette': {
      const reach = Math.hypot(w, h) / 2;
      const shade = context.createRadialGradient(w / 2, h / 2, reach * 0.42, w / 2, h / 2, reach);
      shade.addColorStop(0, tint(color, 0));
      shade.addColorStop(1, tint(color, ornament.density === 'high' ? 1 : ornament.density === 'mid' ? 0.8 : 0.55));
      context.fillStyle = shade;
      context.fillRect(0, 0, w, h);
      break;
    }
    case 'lightleak':
      context.globalCompositeOperation = 'screen';
      glowDisc(context, 0, 0, u * 0.95, color, 0.75);
      glowDisc(context, w, h * 0.62, u * 0.6, mix(color, '#FFFFFF', 0.3), 0.45);
      if (ornament.density !== 'low') glowDisc(context, w * 0.2, h, u * 0.5, color, 0.35);
      break;
    case 'crown': {
      const hero = stage.slots[0]?.rect;
      if (hero === undefined) break;
      const width = Math.min(hero.width * 0.34, u * 0.16);
      const above = stage.slots.map((slot) => slot.rect).filter((slot) => slot !== hero && slot.y + slot.height <= hero.y && slot.x < hero.x + hero.width && hero.x < slot.x + slot.width);
      const ceiling = Math.max(stage.inner.y, ...above.map((slot) => slot.y + slot.height));
      const room = hero.y - ceiling;
      const height = Math.min(width * 0.62, room * 0.9);
      if (height < u * 0.015) break;
      const scale = height / (width * 0.62);
      const cw = width * scale;
      const cx = hero.x + hero.width / 2;
      const base = hero.y - room * 0.05;
      const top = base - height;
      const gold = context.createLinearGradient(cx - cw / 2, top, cx + cw / 2, base);
      gold.addColorStop(0, mix(color, '#FFFFFF', 0.45));
      gold.addColorStop(0.5, color);
      gold.addColorStop(1, mix(color, '#000000', 0.25));
      context.fillStyle = gold;
      context.beginPath();
      context.moveTo(cx - cw / 2, base);
      context.lineTo(cx - cw / 2, top + height * 0.25);
      context.lineTo(cx - cw / 4, top + height * 0.55);
      context.lineTo(cx, top);
      context.lineTo(cx + cw / 4, top + height * 0.55);
      context.lineTo(cx + cw / 2, top + height * 0.25);
      context.lineTo(cx + cw / 2, base);
      context.closePath();
      context.fill();
      [cx - cw / 2, cx, cx + cw / 2].forEach((x, index) => {
        context.beginPath();
        context.arc(x, index === 1 ? top : top + height * 0.25, cw * 0.06, 0, TAU);
        context.fill();
      });
      context.fillStyle = mix(color, '#000000', 0.35);
      context.fillRect(cx - cw / 2, base - height * 0.16, cw, height * 0.08);
      break;
    }
    case 'ribbon': {
      const headline = stage.headline;
      const zone = headline ?? (stage.top.height >= u * 0.05 ? stage.top : stage.bottom);
      if (zone.height < u * 0.03) break;
      const band = headline === null ? Math.min(zone.height * 0.46, u * 0.1) : Math.min(headline.height * 0.95, u * 0.12);
      const width = headline === null ? zone.width * 0.8 : Math.min(stage.inner.width * 0.94, headline.width + band * 2.2);
      const { x: cx, y: cy } = centerOf(zone);
      const left = cx - width / 2;
      const right = cx + width / 2;
      const tail = band * 0.9;
      const drop = band * 0.28;
      context.fillStyle = mix(color, '#000000', 0.28);
      [-1, 1].forEach((side) => {
        const edge = side < 0 ? left + tail * 0.35 : right - tail * 0.35;
        const outer = edge + side * tail;
        context.beginPath();
        context.moveTo(edge, cy - band / 2 + drop);
        context.lineTo(outer, cy - band / 2 + drop);
        context.lineTo(outer - side * tail * 0.35, cy + drop);
        context.lineTo(outer, cy + band / 2 + drop);
        context.lineTo(edge, cy + band / 2 + drop);
        context.closePath();
        context.fill();
      });
      context.fillStyle = mix(color, '#000000', 0.5);
      [-1, 1].forEach((side) => {
        const edge = side < 0 ? left + tail * 0.35 : right - tail * 0.35;
        context.beginPath();
        context.moveTo(side < 0 ? left + tail * 0.35 + tail * 0.35 : right - tail * 0.35 - tail * 0.35, cy + band / 2);
        context.lineTo(edge, cy + band / 2 + drop);
        context.lineTo(edge, cy + band / 2);
        context.closePath();
        context.fill();
      });
      const cloth = context.createLinearGradient(0, cy - band / 2, 0, cy + band / 2);
      cloth.addColorStop(0, mix(color, '#FFFFFF', 0.2));
      cloth.addColorStop(1, mix(color, '#000000', 0.12));
      context.fillStyle = cloth;
      context.fillRect(left + tail * 0.7, cy - band / 2, width - tail * 1.4, band);
      break;
    }
    case 'tape':
      stage.slots.forEach((box, index) => {
        const slot = box.rect;
        context.save();
        enterSlot(context, box);
        const length = Math.min(slot.width * 0.3, u * 0.13);
        const thick = length * 0.3;
        [
          { x: slot.x + length * 0.12, y: slot.y + thick * 0.2, angle: -0.68 },
          { x: slot.x + slot.width - length * 0.12, y: slot.y + thick * 0.2, angle: 0.68 },
        ].forEach((corner, side) => {
          context.save();
          context.translate(corner.x, corner.y);
          context.rotate(corner.angle + (rand(seed, index * 2 + side) - 0.5) * 0.2);
          context.fillStyle = tint(color, 0.85);
          context.shadowColor = 'rgba(0, 0, 0, 0.12)';
          context.shadowBlur = u * 0.004;
          context.fillRect(-length / 2, -thick / 2, length, thick);
          context.restore();
        });
        context.restore();
      });
      break;
    case 'rec': {
      const px = u * 0.03;
      const left = stage.inner.x + u * 0.03;
      const right = stage.inner.x + stage.inner.width - u * 0.03;
      const free = (x: number, y: number, width: number): boolean => !stage.text.some((box) => intersects(box, { x, y: y - px * 0.7, width, height: px * 1.4 }));
      const rows = [stage.inner.y + u * 0.035, stage.inner.y + stage.inner.height - u * 0.035];
      const y = rows.find((row) => free(left, row, px * 3.2) && free(right - px * 6.8, row, px * 6.8)) ?? rows.find((row) => free(left, row, px * 3.2));
      if (y === undefined) break;
      context.fillStyle = '#FF3B30';
      context.shadowColor = 'rgba(255, 59, 48, 0.7)';
      context.shadowBlur = px * 0.5;
      context.beginPath();
      context.arc(left + px * 0.35, y, px * 0.35, 0, TAU);
      context.fill();
      context.shadowBlur = 0;
      context.fillStyle = color;
      context.font = `700 ${Math.round(px)}px "Courier New", Courier, monospace`;
      context.textBaseline = 'middle';
      context.textAlign = 'left';
      context.fillText('REC', left + px * 0.95, y);
      if (free(right - px * 6.8, y, px * 6.8)) {
        context.textAlign = 'right';
        context.fillText('00:12:47:09', right, y);
      }
      break;
    }
    case 'crosshair':
      scattered(stage, seed, 4, ornament.density, (d) => between(d, 0.018, 0.03), ({ x, y, r }) => {
        context.lineWidth = Math.max(0.75, u * 0.002);
        context.beginPath();
        context.arc(x, y, r * 0.6, 0, TAU);
        context.moveTo(x - r, y);
        context.lineTo(x - r * 0.25, y);
        context.moveTo(x + r * 0.25, y);
        context.lineTo(x + r, y);
        context.moveTo(x, y - r);
        context.lineTo(x, y - r * 0.25);
        context.moveTo(x, y + r * 0.25);
        context.lineTo(x, y + r);
        context.stroke();
      });
      break;
    case 'orbits': {
      const rings = countFor(3, ornament.density);
      context.lineWidth = Math.max(0.6, u * 0.0022);
      Array.from({ length: rings }, (_, index) => index).forEach((index) => {
        const rx = u * (0.42 + index * 0.16);
        const ry = rx * 0.32;
        const turn = -0.35 + index * 0.55;
        context.save();
        context.translate(w / 2, h / 2);
        context.rotate(turn);
        context.globalAlpha = 0.7;
        context.beginPath();
        context.ellipse(0, 0, rx, ry, 0, 0, TAU);
        context.stroke();
        const at = rand(seed, index) * TAU;
        context.globalAlpha = 1;
        context.beginPath();
        context.arc(Math.cos(at) * rx, Math.sin(at) * ry, u * 0.009, 0, TAU);
        context.fill();
        context.restore();
      });
      break;
    }
    case 'runes':
      context.shadowColor = color;
      scattered(stage, seed, 10, ornament.density, (d) => between(d, 0.012, 0.022), ({ x, y, r, draw }) => {
        const glyph = RUNES[Math.floor(rand(seed + 9, draw) * RUNES.length)] ?? RUNES[0] ?? [];
        context.shadowBlur = r * 0.6;
        context.lineWidth = Math.max(0.75, r * 0.14);
        context.beginPath();
        glyph.forEach(([x1, y1, x2, y2]) => {
          context.moveTo(x - r * 0.6 + x1 * r * 1.2, y - r + y1 * r * 2);
          context.lineTo(x - r * 0.6 + x2 * r * 1.2, y - r + y2 * r * 2);
        });
        context.stroke();
      });
      break;
    case 'cobwebs': {
      const size = u * 0.24;
      const cornersList = [
        { x: 0, y: 0, sx: 1, sy: 1 },
        { x: w, y: 0, sx: -1, sy: 1 },
        { x: w, y: h, sx: -1, sy: -1 },
        { x: 0, y: h, sx: 1, sy: -1 },
      ].slice(0, ornament.density === 'high' ? 4 : ornament.density === 'mid' ? 2 : 1);
      context.lineWidth = Math.max(0.5, u * 0.0016);
      cornersList.forEach(({ x, y, sx, sy }) => {
        const spokes = Array.from({ length: 6 }, (_, index) => (index / 5) * (Math.PI / 2));
        const tip = (angle: number, radius: number): Point => ({ x: x + sx * Math.cos(angle) * radius, y: y + sy * Math.sin(angle) * radius });
        context.beginPath();
        spokes.forEach((angle) => {
          const end = tip(angle, size);
          context.moveTo(x, y);
          context.lineTo(end.x, end.y);
        });
        [0.25, 0.45, 0.65, 0.85].forEach((share) => {
          spokes.slice(1).forEach((angle, index) => {
            const from = tip(spokes[index] ?? 0, size * share);
            const to = tip(angle, size * share);
            const sag = tip((angle + (spokes[index] ?? 0)) / 2, size * share * 0.86);
            if (index === 0) context.moveTo(from.x, from.y);
            context.quadraticCurveTo(sag.x, sag.y, to.x, to.y);
          });
        });
        context.stroke();
      });
      break;
    }
    case 'drips': {
      const count = countFor(12, ornament.density);
      const lip = u * 0.018;
      context.beginPath();
      context.moveTo(0, 0);
      context.lineTo(0, lip);
      Array.from({ length: count }, (_, index) => index).forEach((index) => {
        const center = ((index + 0.5) / count) * w;
        const radius = u * (0.008 + rand(seed, index) * 0.01);
        const length = u * (0.02 + rand(seed + 1, index) * 0.1);
        context.lineTo(center - radius * 1.6, lip);
        context.quadraticCurveTo(center - radius, lip, center - radius, lip + length * 0.5);
        context.lineTo(center - radius, lip + length);
        context.arc(center, lip + length, radius, Math.PI, 0, true);
        context.lineTo(center + radius, lip + length * 0.5);
        context.quadraticCurveTo(center + radius, lip, center + radius * 1.6, lip);
      });
      context.lineTo(w, lip);
      context.lineTo(w, 0);
      context.closePath();
      context.fill();
      break;
    }
    case 'lightning':
      scattered(stage, seed, 3, ornament.density, (d) => between(d, 0.04, 0.07), ({ x, y, r, draw }) => {
        const points = Array.from({ length: 6 }, (_, index) => ({ x: x + (index % 2 === 0 ? -1 : 1) * r * 0.25 * (0.5 + rand(seed + 9, draw * 6 + index)), y: y - r + (index * r * 2) / 5 }));
        context.shadowColor = color;
        context.shadowBlur = r * 0.35;
        context.lineWidth = Math.max(1, r * 0.09);
        context.beginPath();
        points.forEach((point, index) => (index === 0 ? context.moveTo(point.x, point.y) : context.lineTo(point.x, point.y)));
        context.stroke();
        context.strokeStyle = 'rgba(255, 255, 255, 0.9)';
        context.lineWidth = Math.max(0.5, r * 0.035);
        context.stroke();
        context.strokeStyle = color;
      });
      break;
    case 'notes':
      scattered(stage, seed, 8, ornament.density, (d) => between(d, 0.018, 0.03), ({ x, y, r, draw }) => note(context, x, y + r * 0.5, r, draw % 3 === 0));
      break;
    case 'candles': {
      const zone = stage.front ? stage.bottom : { x: 0, y: h * 0.8, width: w, height: h * 0.2 };
      if (zone.height < u * 0.04) break;
      const count = countFor(4, ornament.density);
      const bodyWidth = u * 0.024;
      const floor = zone.y + zone.height - u * 0.01;
      Array.from({ length: count }, (_, index) => index).forEach((index) => {
        const leftSide = index % 2 === 0;
        const rank2 = Math.floor(index / 2);
        const x = leftSide ? zone.x + bodyWidth * (1.2 + rank2 * 2.2) : zone.x + zone.width - bodyWidth * (1.2 + rank2 * 2.2);
        const height = Math.min(zone.height * 0.6, u * (0.05 + rand(seed, index) * 0.05));
        const top = floor - height;
        const wax = context.createLinearGradient(x - bodyWidth / 2, 0, x + bodyWidth / 2, 0);
        wax.addColorStop(0, '#D9CBB0');
        wax.addColorStop(0.45, '#F7F0E1');
        wax.addColorStop(1, '#BFAF93');
        context.fillStyle = wax;
        context.fillRect(x - bodyWidth / 2, top, bodyWidth, height);
        glowDisc(context, x, top - bodyWidth * 0.9, bodyWidth * 2.6, color, 0.5);
        const flame = context.createLinearGradient(0, top - bodyWidth * 1.5, 0, top);
        flame.addColorStop(0, '#FFFFFF');
        flame.addColorStop(1, color);
        context.fillStyle = flame;
        context.beginPath();
        context.moveTo(x, top - bodyWidth * 1.6);
        context.quadraticCurveTo(x + bodyWidth * 0.42, top - bodyWidth * 0.5, x, top - bodyWidth * 0.12);
        context.quadraticCurveTo(x - bodyWidth * 0.42, top - bodyWidth * 0.5, x, top - bodyWidth * 1.6);
        context.fill();
      });
      break;
    }
    case 'moon': {
      const candidates = [1, 0.75].flatMap((scale) => {
        const radius = u * 0.055 * scale;
        return [stage.inner.x + stage.inner.width - radius * 1.6, stage.inner.x + radius * 1.6].map((x) => ({ x, y: stage.inner.y + radius * 1.5, r: radius }));
      });
      const moon = candidates.find((spot) => !stage.text.some((box) => intersects(box, { x: spot.x - spot.r * 1.1, y: spot.y - spot.r * 1.1, width: spot.r * 2.2, height: spot.r * 2.2 })));
      if (moon === undefined) break;
      const { x, y, r } = moon;
      glowDisc(context, x, y, r * 2.6, color, 0.35);
      context.fillStyle = color;
      context.beginPath();
      context.arc(x, y, r, 0, TAU);
      context.arc(x - r * 0.42, y - r * 0.22, r * 0.86, 0, TAU, true);
      context.fill();
      break;
    }
    case 'clouds':
      scattered(stage, seed, 4, ornament.density, (d) => between(d, 0.04, 0.07), ({ x, y, r }) => {
        context.shadowColor = 'rgba(0, 0, 0, 0.08)';
        context.shadowBlur = r * 0.3;
        context.shadowOffsetY = r * 0.08;
        context.beginPath();
        [
          [-0.55, 0.12, 0.42],
          [-0.12, -0.12, 0.55],
          [0.4, 0.02, 0.45],
          [0.05, 0.2, 0.4],
        ].forEach(([dx = 0, dy = 0, dr = 0]) => {
          context.moveTo(x + dx * r + dr * r, y + dy * r);
          context.arc(x + dx * r, y + dy * r, dr * r, 0, TAU);
        });
        context.fill();
      });
      break;
    case 'bats':
      scattered(stage, seed, 6, ornament.density, (d) => between(d, 0.022, 0.04), ({ x, y, r }) => bat(context, x, y, r));
      break;
    case 'skulls':
      scattered(stage, seed, 3, ornament.density, (d) => between(d, 0.028, 0.042), ({ x, y, r }) => skull(context, x, y, r));
      break;
    case 'roses':
      scattered(stage, seed, 4, ornament.density, (d) => between(d, 0.022, 0.036), ({ x, y, r }) => rose(context, x, y, r, color));
      break;
  }
  context.restore();
}
