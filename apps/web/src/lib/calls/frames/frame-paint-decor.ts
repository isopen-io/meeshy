import type { Rect, Size } from '../call-montage-shapes';
import { heartPath } from '../call-montage-render';
import type { FrameBorderKind, FrameLook, FramePatternKind } from './frame-spec';
import { insetRect, luminance, mix, rand, rectOf, roundedRectPath, TAU, tint, unitOf, type Surface2D } from './frame-paint-kit';

/**
 * **LES QUATORZE MOTIFS ET LES QUATORZE BORDURES** (#8741, spec § 4.3) — le
 * motif se peint sur toute la toile, entre le fond et les cases, à
 * l'opacité déclarée ; la bordure entoure la toile à `inset` du bord, dans
 * une bande de l'épaisseur `width`. Tout se mesure en `unit` : une vignette
 * de 108 × 192 et une capture de 1080 × 1920 montrent le même dessin.
 */

type Pattern = NonNullable<FrameLook['pattern']>;
type Border = NonNullable<FrameLook['border']>;

const lattice = (size: Size, step: number, stagger: boolean): readonly { readonly x: number; readonly y: number; readonly row: number; readonly col: number }[] => {
  const cols = Math.ceil(size.width / step) + 2;
  const rows = Math.ceil(size.height / step) + 2;
  return Array.from({ length: cols * rows }, (_, index) => {
    const row = Math.floor(index / cols);
    const col = index % cols;
    return { x: (col - 0.5) * step + (stagger && row % 2 === 1 ? step / 2 : 0), y: (row - 0.5) * step, row, col };
  });
};

function fourPointStar(context: Surface2D, x: number, y: number, r: number): void {
  context.moveTo(x, y - r);
  context.quadraticCurveTo(x, y, x + r, y);
  context.quadraticCurveTo(x, y, x, y + r);
  context.quadraticCurveTo(x, y, x - r, y);
  context.quadraticCurveTo(x, y, x, y - r);
  context.closePath();
}

function damaskMotif(context: Surface2D, x: number, y: number, s: number): void {
  context.moveTo(x, y - s);
  context.bezierCurveTo(x + s * 0.55, y - s * 0.55, x + s * 0.2, y - s * 0.1, x, y);
  context.bezierCurveTo(x - s * 0.2, y - s * 0.1, x - s * 0.55, y - s * 0.55, x, y - s);
  context.moveTo(x, y + s);
  context.bezierCurveTo(x + s * 0.55, y + s * 0.55, x + s * 0.2, y + s * 0.1, x, y);
  context.bezierCurveTo(x - s * 0.2, y + s * 0.1, x - s * 0.55, y + s * 0.55, x, y + s);
  context.moveTo(x - s * 0.9, y);
  context.bezierCurveTo(x - s * 0.45, y - s * 0.35, x - s * 0.15, y - s * 0.12, x, y);
  context.bezierCurveTo(x - s * 0.15, y + s * 0.12, x - s * 0.45, y + s * 0.35, x - s * 0.9, y);
  context.moveTo(x + s * 0.9, y);
  context.bezierCurveTo(x + s * 0.45, y - s * 0.35, x + s * 0.15, y - s * 0.12, x, y);
  context.bezierCurveTo(x + s * 0.15, y + s * 0.12, x + s * 0.45, y + s * 0.35, x + s * 0.9, y);
}

export function paintPattern(context: Surface2D, pattern: Pattern, size: Size): void {
  const unit = unitOf(size);
  const { width: w, height: h } = size;
  context.save();
  context.globalAlpha = pattern.opacity;
  context.fillStyle = pattern.color;
  context.strokeStyle = pattern.color;
  context.lineCap = 'round';
  context.beginPath();
  const kind: FramePatternKind = pattern.kind;
  switch (kind) {
    case 'dots': {
      const step = unit * 0.045;
      lattice(size, step, true).forEach(({ x, y }) => {
        context.moveTo(x + step * 0.11, y);
        context.arc(x, y, step * 0.11, 0, TAU);
      });
      context.fill();
      break;
    }
    case 'stripes': {
      const step = unit * 0.06;
      const reach = w + h;
      Array.from({ length: Math.ceil(reach / step) + 1 }, (_, index) => index * step - h).forEach((x) => {
        context.moveTo(x, h);
        context.lineTo(x + step * 0.4, h);
        context.lineTo(x + step * 0.4 + h, 0);
        context.lineTo(x + h, 0);
        context.closePath();
      });
      context.fill();
      break;
    }
    case 'grid': {
      const step = unit * 0.06;
      context.lineWidth = Math.max(0.5, unit * 0.0016);
      Array.from({ length: Math.ceil(w / step) + 1 }, (_, index) => index * step).forEach((x) => {
        context.moveTo(x, 0);
        context.lineTo(x, h);
      });
      Array.from({ length: Math.ceil(h / step) + 1 }, (_, index) => index * step).forEach((y) => {
        context.moveTo(0, y);
        context.lineTo(w, y);
      });
      context.stroke();
      break;
    }
    case 'checker': {
      const step = unit * 0.08;
      lattice(size, step, false)
        .filter(({ row, col }) => (row + col) % 2 === 0)
        .forEach(({ x, y }) => context.rect(x - step / 2, y - step / 2, step, step));
      context.fill();
      break;
    }
    case 'halftone': {
      const step = unit * 0.028;
      lattice(size, step, true).forEach(({ x, y }) => {
        const r = step * 0.46 * Math.max(0, Math.min(1, (y / h) * 1.15 - 0.1));
        if (r < 0.3) return;
        context.moveTo(x + r, y);
        context.arc(x, y, r, 0, TAU);
      });
      context.fill();
      break;
    }
    case 'scanlines': {
      const step = Math.max(2, unit * 0.008);
      Array.from({ length: Math.ceil(h / step) }, (_, index) => index * step).forEach((y) => context.rect(0, y, w, step * 0.4));
      context.fill();
      break;
    }
    case 'grain': {
      const dot = Math.max(0.6, unit * 0.0022);
      Array.from({ length: 2600 }, (_, index) => context.rect(rand(301, index) * w, rand(302, index) * h, dot, dot));
      context.fill();
      break;
    }
    case 'stars':
      Array.from({ length: 70 }, (_, index) => fourPointStar(context, rand(311, index) * w, rand(312, index) * h, unit * (0.004 + rand(313, index) * 0.012)));
      context.fill();
      break;
    case 'confetti':
      Array.from({ length: 80 }, (_, index) => index).forEach((index) => {
        context.save();
        context.translate(rand(321, index) * w, rand(322, index) * h);
        context.rotate(rand(323, index) * TAU);
        context.fillRect(-unit * 0.009, -unit * 0.004, unit * 0.018, unit * 0.008);
        context.restore();
      });
      break;
    case 'sunburst': {
      const cx = w / 2;
      const cy = h * 0.42;
      const reach = Math.hypot(w, h);
      Array.from({ length: 18 }, (_, index) => index).forEach((index) => {
        const from = (index / 18) * TAU;
        const to = from + TAU / 36;
        context.moveTo(cx, cy);
        context.lineTo(cx + Math.cos(from) * reach, cy + Math.sin(from) * reach);
        context.lineTo(cx + Math.cos(to) * reach, cy + Math.sin(to) * reach);
        context.closePath();
      });
      context.fill();
      break;
    }
    case 'waves': {
      const step = unit * 0.05;
      const amplitude = unit * 0.012;
      const wavelength = unit * 0.16;
      context.lineWidth = Math.max(0.6, unit * 0.0022);
      Array.from({ length: Math.ceil(h / step) + 1 }, (_, index) => index * step).forEach((y) => {
        context.moveTo(0, y);
        Array.from({ length: Math.ceil(w / (wavelength / 8)) + 1 }, (_, point) => point * (wavelength / 8)).forEach((x) => context.lineTo(x, y + Math.sin((x / wavelength) * TAU) * amplitude));
      });
      context.stroke();
      break;
    }
    case 'circuit': {
      const step = unit * 0.05;
      context.lineWidth = Math.max(0.6, unit * 0.002);
      const traces = Array.from({ length: 46 }, (_, index) => {
        const x0 = Math.round((rand(331, index) * w) / step) * step;
        const y0 = Math.round((rand(332, index) * h) / step) * step;
        const run = (1 + Math.floor(rand(333, index) * 4)) * step;
        const turn = (1 + Math.floor(rand(334, index) * 3)) * step * (rand(335, index) > 0.5 ? 1 : -1);
        const across = rand(336, index) > 0.5;
        const [x1, y1] = across ? [x0 + run, y0] : [x0, y0 + run];
        const [x2, y2] = across ? [x1 + Math.abs(turn) * 0.7, y1 + turn] : [x1 + turn, y1 + Math.abs(turn) * 0.7];
        context.moveTo(x0, y0);
        context.lineTo(x1, y1);
        context.lineTo(x2, y2);
        return [
          { x: x0, y: y0 },
          { x: x2, y: y2 },
        ];
      });
      context.stroke();
      context.beginPath();
      traces.flat().forEach((pad) => {
        context.moveTo(pad.x + unit * 0.006, pad.y);
        context.arc(pad.x, pad.y, unit * 0.006, 0, TAU);
      });
      context.fill();
      break;
    }
    case 'damask': {
      const step = unit * 0.16;
      lattice(size, step, true).forEach(({ x, y }) => damaskMotif(context, x, y, step * 0.32));
      context.fill();
      break;
    }
    case 'hearts': {
      const step = unit * 0.09;
      lattice(size, step, true).forEach(({ x, y }) => {
        heartPath(context, { x: x - step * 0.14, y: y - step * 0.13, width: step * 0.28, height: step * 0.26 });
        context.fill();
      });
      break;
    }
  }
  context.restore();
}

/** Le chemin d'une bande entre `outer` et `inner` — à remplir en `evenodd`. */
function bandPath(context: Surface2D, outer: Rect, inner: Rect): void {
  context.beginPath();
  context.rect(outer.x, outer.y, outer.width, outer.height);
  context.rect(inner.x, inner.y, inner.width, inner.height);
}

function corners(frame: Rect): readonly { readonly x: number; readonly y: number; readonly sx: number; readonly sy: number }[] {
  return [
    { x: frame.x, y: frame.y, sx: 1, sy: 1 },
    { x: frame.x + frame.width, y: frame.y, sx: -1, sy: 1 },
    { x: frame.x + frame.width, y: frame.y + frame.height, sx: -1, sy: -1 },
    { x: frame.x, y: frame.y + frame.height, sx: 1, sy: -1 },
  ];
}

/** Des points également répartis le long du périmètre de `frame`, espacés d'environ `step`. */
function perimeter(frame: Rect, step: number): readonly { readonly x: number; readonly y: number; readonly side: number }[] {
  const sides = [
    { x: frame.x, y: frame.y, dx: frame.width, dy: 0 },
    { x: frame.x + frame.width, y: frame.y, dx: 0, dy: frame.height },
    { x: frame.x + frame.width, y: frame.y + frame.height, dx: -frame.width, dy: 0 },
    { x: frame.x, y: frame.y + frame.height, dx: 0, dy: -frame.height },
  ];
  return sides.flatMap((side, index) => {
    const length = Math.hypot(side.dx, side.dy);
    const count = Math.max(1, Math.round(length / step));
    return Array.from({ length: count }, (_, at) => ({ x: side.x + (side.dx * at) / count, y: side.y + (side.dy * at) / count, side: index }));
  });
}

function jagged(context: Surface2D, frame: Rect, depth: number): void {
  const points = perimeter(frame, depth * 1.6);
  points.forEach((point, index) => {
    const push = (rand(401, index) - 0.35) * depth;
    const nx = point.side === 1 ? -1 : point.side === 3 ? 1 : 0;
    const ny = point.side === 0 ? 1 : point.side === 2 ? -1 : 0;
    const x = point.x + nx * push;
    const y = point.y + ny * push;
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.closePath();
}

export function paintBorder(context: Surface2D, border: Border, size: Size): void {
  const unit = unitOf(size);
  const width = Math.max(0.75, border.width * unit);
  const frame = insetRect(rectOf(size), border.inset * unit + width / 2);
  context.save();
  context.strokeStyle = border.color;
  context.fillStyle = border.color;
  context.lineWidth = width;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  const kind: FrameBorderKind = border.kind;
  switch (kind) {
    case 'hairline':
      context.strokeRect(frame.x, frame.y, frame.width, frame.height);
      break;
    case 'double': {
      context.strokeRect(frame.x, frame.y, frame.width, frame.height);
      const inner = insetRect(frame, width * 2.6);
      context.lineWidth = width * 0.5;
      context.strokeRect(inner.x, inner.y, inner.width, inner.height);
      break;
    }
    case 'deco': {
      context.lineWidth = width * 0.6;
      context.strokeRect(frame.x, frame.y, frame.width, frame.height);
      const arm = unit * 0.13;
      const step = Math.max(width * 2.2, unit * 0.012);
      context.lineWidth = width;
      context.beginPath();
      corners(frame).forEach(({ x, y, sx, sy }) =>
        [1, 2, 3].forEach((level) => {
          const offset = step * level;
          const length = arm * (1 - level * 0.22);
          context.moveTo(x + sx * offset, y + sy * (offset + length));
          context.lineTo(x + sx * offset, y + sy * offset);
          context.lineTo(x + sx * (offset + length), y + sy * offset);
        }),
      );
      context.stroke();
      context.beginPath();
      corners(frame).forEach(({ x, y, sx, sy }) => {
        const cx = x + sx * step * 4.6;
        const cy = y + sy * step * 4.6;
        const r = step * 0.9;
        context.moveTo(cx, cy - r);
        context.lineTo(cx + r, cy);
        context.lineTo(cx, cy + r);
        context.lineTo(cx - r, cy);
        context.closePath();
      });
      context.fill();
      break;
    }
    case 'baroque': {
      context.lineWidth = width * 0.7;
      const inner = insetRect(frame, unit * 0.018);
      context.strokeRect(frame.x, frame.y, frame.width, frame.height);
      context.lineWidth = width * 0.4;
      context.strokeRect(inner.x, inner.y, inner.width, inner.height);
      const s = unit * 0.075;
      context.lineWidth = width;
      context.beginPath();
      corners(frame).forEach(({ x, y, sx, sy }) => {
        context.moveTo(x + sx * s * 1.9, y);
        context.bezierCurveTo(x + sx * s * 1.1, y + sy * s * 0.1, x + sx * s * 0.9, y + sy * s * 0.9, x + sx * s * 0.45, y + sy * s * 0.55);
        context.bezierCurveTo(x + sx * s * 0.15, y + sy * s * 0.3, x + sx * s * 0.4, y + sy * s * 0.05, x + sx * s * 0.6, y + sy * s * 0.3);
        context.moveTo(x, y + sy * s * 1.9);
        context.bezierCurveTo(x + sx * s * 0.1, y + sy * s * 1.1, x + sx * s * 0.9, y + sy * s * 0.9, x + sx * s * 0.55, y + sy * s * 0.45);
        context.bezierCurveTo(x + sx * s * 0.3, y + sy * s * 0.15, x + sx * s * 0.05, y + sy * s * 0.4, x + sx * s * 0.3, y + sy * s * 0.6);
      });
      context.stroke();
      context.beginPath();
      corners(frame).forEach(({ x, y, sx, sy }) => {
        const cx = x + sx * s * 0.72;
        const cy = y + sy * s * 0.72;
        context.moveTo(cx + s * 0.12, cy);
        context.arc(cx, cy, s * 0.12, 0, TAU);
      });
      context.fill();
      break;
    }
    case 'filmstrip': {
      const band = Math.max(width, unit * 0.045);
      const outer = insetRect(rectOf(size), border.inset * unit);
      const portrait = size.height >= size.width;
      const strips = portrait
        ? [
            { x: outer.x, y: outer.y, width: band, height: outer.height },
            { x: outer.x + outer.width - band, y: outer.y, width: band, height: outer.height },
          ]
        : [
            { x: outer.x, y: outer.y, width: outer.width, height: band },
            { x: outer.x, y: outer.y + outer.height - band, width: outer.width, height: band },
          ];
      strips.forEach((strip) => context.fillRect(strip.x, strip.y, strip.width, strip.height));
      const hole = band * 0.42;
      const holeColor = luminance(border.color) > 0.5 ? 'rgba(20, 20, 20, 0.85)' : 'rgba(246, 240, 226, 0.92)';
      context.fillStyle = holeColor;
      context.beginPath();
      strips.forEach((strip) => {
        const length = portrait ? strip.height : strip.width;
        const count = Math.max(2, Math.floor(length / (hole * 2.1)));
        Array.from({ length: count }, (_, index) => (length / count) * (index + 0.5)).forEach((at) => {
          const x = portrait ? strip.x + (band - hole * 0.8) / 2 : strip.x + at - hole / 2;
          const y = portrait ? strip.y + at - hole / 2 : strip.y + (band - hole * 0.8) / 2;
          roundedRectPath(context, portrait ? { x, y, width: hole * 0.8, height: hole } : { x, y, width: hole, height: hole * 0.8 }, hole * 0.18);
        });
      });
      context.fill();
      break;
    }
    case 'ticket': {
      const notch = unit * 0.045;
      const { x, y, width: w, height: h } = frame;
      context.beginPath();
      context.moveTo(x + notch, y);
      context.lineTo(x + w - notch, y);
      context.arc(x + w, y, notch, Math.PI, Math.PI / 2, true);
      context.lineTo(x + w, y + h / 2 - notch * 0.7);
      context.arc(x + w, y + h / 2, notch * 0.7, -Math.PI / 2, Math.PI / 2, true);
      context.lineTo(x + w, y + h - notch);
      context.arc(x + w, y + h, notch, -Math.PI / 2, -Math.PI, true);
      context.lineTo(x + notch, y + h);
      context.arc(x, y + h, notch, 0, -Math.PI / 2, true);
      context.lineTo(x, y + h / 2 + notch * 0.7);
      context.arc(x, y + h / 2, notch * 0.7, Math.PI / 2, -Math.PI / 2, true);
      context.lineTo(x, y + notch);
      context.arc(x, y, notch, Math.PI / 2, 0, true);
      context.closePath();
      context.stroke();
      context.setLineDash([width * 1.5, width * 2.5]);
      context.lineWidth = width * 0.6;
      context.beginPath();
      context.moveTo(x + notch * 0.9, y + h / 2);
      context.lineTo(x + w - notch * 0.9, y + h / 2);
      context.globalAlpha = 0.35;
      context.stroke();
      break;
    }
    case 'perforated': {
      const step = Math.max(width * 2.4, unit * 0.018);
      context.beginPath();
      perimeter(frame, step).forEach((point) => {
        context.moveTo(point.x + width * 0.7, point.y);
        context.arc(point.x, point.y, width * 0.7, 0, TAU);
      });
      context.fill();
      break;
    }
    case 'neon': {
      const radius = unit * 0.035;
      context.shadowColor = border.color;
      context.shadowBlur = unit * 0.035;
      context.beginPath();
      roundedRectPath(context, frame, radius);
      context.stroke();
      context.shadowBlur = unit * 0.012;
      context.strokeStyle = mix(border.color, '#FFFFFF', 0.65);
      context.lineWidth = width * 0.4;
      context.stroke();
      break;
    }
    case 'brackets': {
      const arm = unit * 0.075;
      context.beginPath();
      corners(frame).forEach(({ x, y, sx, sy }) => {
        context.moveTo(x, y + sy * arm);
        context.lineTo(x, y);
        context.lineTo(x + sx * arm, y);
      });
      context.stroke();
      break;
    }
    case 'torn': {
      const outer = insetRect(rectOf(size), border.inset * unit);
      const depth = Math.max(width, unit * 0.012);
      context.beginPath();
      context.rect(0, 0, size.width, size.height);
      jagged(context, insetRect(outer, width), depth);
      context.shadowColor = 'rgba(0, 0, 0, 0.28)';
      context.shadowBlur = unit * 0.012;
      context.fill('evenodd');
      break;
    }
    case 'mourning': {
      const outer = insetRect(rectOf(size), border.inset * unit);
      const inner = insetRect(outer, width);
      bandPath(context, outer, inner);
      context.fill('evenodd');
      const rule = insetRect(inner, unit * 0.012);
      context.lineWidth = Math.max(0.75, unit * 0.0025);
      context.strokeRect(rule.x, rule.y, rule.width, rule.height);
      break;
    }
    case 'vines': {
      const amplitude = unit * 0.012;
      const wavelength = unit * 0.12;
      context.lineWidth = Math.max(0.75, width * 0.6);
      context.beginPath();
      const points = perimeter(frame, wavelength / 6);
      points.forEach((point, index) => {
        const wave = Math.sin((index / 6) * TAU) * amplitude;
        const x = point.x + (point.side === 1 || point.side === 3 ? wave : 0);
        const y = point.y + (point.side === 0 || point.side === 2 ? wave : 0);
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
      context.closePath();
      context.stroke();
      points
        .filter((_, index) => index % 3 === 1)
        .forEach((point, index) => {
          const size2 = unit * (0.012 + rand(411, index) * 0.008);
          const angle = rand(412, index) * TAU;
          context.save();
          context.translate(point.x, point.y);
          context.rotate(angle);
          context.beginPath();
          context.moveTo(0, 0);
          context.quadraticCurveTo(size2, -size2 * 0.9, size2 * 2, 0);
          context.quadraticCurveTo(size2, size2 * 0.9, 0, 0);
          context.fill();
          context.restore();
        });
      break;
    }
    case 'bulbs': {
      const step = unit * 0.075;
      const r = Math.max(width, unit * 0.011);
      perimeter(frame, step).forEach((point) => {
        const glow = context.createRadialGradient(point.x, point.y, 0, point.x, point.y, r * 3.2);
        glow.addColorStop(0, tint(border.color, 0.55));
        glow.addColorStop(1, tint(border.color, 0));
        context.fillStyle = glow;
        context.beginPath();
        context.arc(point.x, point.y, r * 3.2, 0, TAU);
        context.fill();
        const bulb = context.createRadialGradient(point.x - r * 0.3, point.y - r * 0.3, 0, point.x, point.y, r);
        bulb.addColorStop(0, '#FFFFFF');
        bulb.addColorStop(1, border.color);
        context.fillStyle = bulb;
        context.beginPath();
        context.arc(point.x, point.y, r, 0, TAU);
        context.fill();
      });
      break;
    }
    case 'polaroid': {
      const outer = insetRect(rectOf(size), border.inset * unit);
      const foot = width * 3.2;
      const inner = { x: outer.x + width, y: outer.y + width, width: outer.width - width * 2, height: outer.height - width - foot };
      bandPath(context, outer, inner);
      context.fill('evenodd');
      context.beginPath();
      context.rect(inner.x, inner.y, inner.width, inner.height);
      context.strokeStyle = 'rgba(0, 0, 0, 0.12)';
      context.lineWidth = Math.max(0.5, unit * 0.0015);
      context.stroke();
      break;
    }
  }
  context.restore();
}
