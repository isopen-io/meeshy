import { mix, TAU, tint, type Surface2D } from './frame-paint-kit';

/**
 * **LES GLYPHES DES ORNEMENTS** (#8741) — les petits dessins que
 * `frame-paint-ornaments.ts` sème : étoiles, étincelles, halos, runes, notes,
 * chauves-souris, crânes, roses. Chacun se trace autour de (`x`, `y`) à la
 * taille `r`/`s`, dans la couleur déjà posée par l'appelant sauf mention.
 */

export const star5 = (context: Surface2D, x: number, y: number, r: number, turn = 0): void => {
  Array.from({ length: 10 }, (_, index) => {
    const angle = -Math.PI / 2 + turn + (index * Math.PI) / 5;
    const radius = index % 2 === 0 ? r : r * 0.45;
    return [x + Math.cos(angle) * radius, y + Math.sin(angle) * radius] as const;
  }).forEach(([px, py], index) => (index === 0 ? context.moveTo(px, py) : context.lineTo(px, py)));
  context.closePath();
};

export const sparkle = (context: Surface2D, x: number, y: number, r: number): void => {
  context.moveTo(x, y - r);
  context.quadraticCurveTo(x + r * 0.12, y - r * 0.12, x + r, y);
  context.quadraticCurveTo(x + r * 0.12, y + r * 0.12, x, y + r);
  context.quadraticCurveTo(x - r * 0.12, y + r * 0.12, x - r, y);
  context.quadraticCurveTo(x - r * 0.12, y - r * 0.12, x, y - r);
  context.closePath();
};

export const glowDisc = (context: Surface2D, x: number, y: number, r: number, color: string, core = 0.55): void => {
  const glow = context.createRadialGradient(x, y, 0, x, y, r);
  glow.addColorStop(0, tint(color, core));
  glow.addColorStop(0.45, tint(color, core * 0.45));
  glow.addColorStop(1, tint(color, 0));
  context.fillStyle = glow;
  context.beginPath();
  context.arc(x, y, r, 0, TAU);
  context.fill();
};

/** Les glyphes des runes : des traits dans un carré unité (x, y de 0 à 1). */
export const RUNES: readonly (readonly (readonly [number, number, number, number])[])[] = [
  [[0.5, 0, 0.5, 1], [0.5, 0.15, 0.85, 0.4], [0.5, 0.4, 0.85, 0.65]],
  [[0.3, 0, 0.3, 1], [0.3, 0.2, 0.75, 0.5], [0.75, 0.5, 0.3, 0.8]],
  [[0.5, 0, 0.5, 1], [0.2, 0.3, 0.8, 0.7], [0.8, 0.3, 0.2, 0.7]],
  [[0.25, 0, 0.25, 1], [0.75, 0, 0.75, 1], [0.25, 0.25, 0.75, 0.6]],
  [[0.5, 0, 0.2, 0.5], [0.2, 0.5, 0.5, 1], [0.5, 0, 0.8, 0.5], [0.8, 0.5, 0.5, 1]],
  [[0.3, 0, 0.3, 1], [0.3, 0.1, 0.8, 0.35], [0.3, 0.55, 0.8, 0.35]],
  [[0.5, 0, 0.5, 1], [0.15, 0.2, 0.5, 0.5], [0.85, 0.2, 0.5, 0.5]],
  [[0.2, 1, 0.5, 0], [0.5, 0, 0.8, 1], [0.35, 0.55, 0.65, 0.55]],
];

export const note = (context: Surface2D, x: number, y: number, s: number, double: boolean): void => {
  const head = (hx: number, hy: number) => {
    context.save();
    context.translate(hx, hy);
    context.rotate(-0.35);
    context.beginPath();
    context.ellipse(0, 0, s * 0.32, s * 0.22, 0, 0, TAU);
    context.fill();
    context.restore();
  };
  head(x, y);
  context.lineWidth = s * 0.08;
  context.beginPath();
  context.moveTo(x + s * 0.28, y - s * 0.05);
  context.lineTo(x + s * 0.28, y - s * 1.1);
  if (double) {
    head(x + s * 0.75, y - s * 0.15);
    context.moveTo(x + s * 1.03, y - s * 0.2);
    context.lineTo(x + s * 1.03, y - s * 1.25);
    context.stroke();
    context.beginPath();
    context.moveTo(x + s * 0.24, y - s * 1.1);
    context.lineTo(x + s * 1.07, y - s * 1.25);
    context.lineTo(x + s * 1.07, y - s * 1.05);
    context.lineTo(x + s * 0.24, y - s * 0.9);
    context.closePath();
    context.fill();
    return;
  }
  context.stroke();
  context.beginPath();
  context.moveTo(x + s * 0.28, y - s * 1.1);
  context.bezierCurveTo(x + s * 0.4, y - s * 0.75, x + s * 0.85, y - s * 0.75, x + s * 0.7, y - s * 0.35);
  context.stroke();
};

export const bat = (context: Surface2D, x: number, y: number, s: number): void => {
  context.beginPath();
  context.moveTo(x, y - s * 0.12);
  context.lineTo(x - s * 0.08, y - s * 0.3);
  context.lineTo(x - s * 0.1, y - s * 0.12);
  context.quadraticCurveTo(x - s * 0.45, y - s * 0.4, x - s, y - s * 0.15);
  context.quadraticCurveTo(x - s * 0.8, y - s * 0.05, x - s * 0.72, y + s * 0.12);
  context.quadraticCurveTo(x - s * 0.6, y + s * 0.02, x - s * 0.45, y + s * 0.15);
  context.quadraticCurveTo(x - s * 0.3, y + s * 0.05, x - s * 0.16, y + s * 0.22);
  context.quadraticCurveTo(x, y + s * 0.1, x + s * 0.16, y + s * 0.22);
  context.quadraticCurveTo(x + s * 0.3, y + s * 0.05, x + s * 0.45, y + s * 0.15);
  context.quadraticCurveTo(x + s * 0.6, y + s * 0.02, x + s * 0.72, y + s * 0.12);
  context.quadraticCurveTo(x + s * 0.8, y - s * 0.05, x + s, y - s * 0.15);
  context.quadraticCurveTo(x + s * 0.45, y - s * 0.4, x + s * 0.1, y - s * 0.12);
  context.lineTo(x + s * 0.08, y - s * 0.3);
  context.closePath();
  context.fill();
};

export const skull = (context: Surface2D, x: number, y: number, s: number): void => {
  context.beginPath();
  context.moveTo(x - s * 0.5, y + s * 0.05);
  context.bezierCurveTo(x - s * 0.62, y - s * 0.75, x + s * 0.62, y - s * 0.75, x + s * 0.5, y + s * 0.05);
  context.quadraticCurveTo(x + s * 0.45, y + s * 0.28, x + s * 0.3, y + s * 0.32);
  context.lineTo(x + s * 0.3, y + s * 0.55);
  context.quadraticCurveTo(x, y + s * 0.66, x - s * 0.3, y + s * 0.55);
  context.lineTo(x - s * 0.3, y + s * 0.32);
  context.quadraticCurveTo(x - s * 0.45, y + s * 0.28, x - s * 0.5, y + s * 0.05);
  context.closePath();
  context.moveTo(x - s * 0.08, y + s * 0.02);
  context.ellipse(x - s * 0.21, y + s * 0.02, s * 0.13, s * 0.15, 0, 0, TAU);
  context.moveTo(x + s * 0.34, y + s * 0.02);
  context.ellipse(x + s * 0.21, y + s * 0.02, s * 0.13, s * 0.15, 0, 0, TAU);
  context.moveTo(x, y + s * 0.18);
  context.lineTo(x + s * 0.07, y + s * 0.3);
  context.lineTo(x - s * 0.07, y + s * 0.3);
  context.closePath();
  [-0.15, 0, 0.15].forEach((dx) => {
    context.moveTo(x + s * dx + s * 0.02, y + s * 0.42);
    context.rect(x + s * dx - s * 0.02, y + s * 0.4, s * 0.04, s * 0.14);
  });
  context.fill('evenodd');
};

export const rose = (context: Surface2D, x: number, y: number, s: number, color: string): void => {
  const leaf = '#3F6B45';
  context.fillStyle = leaf;
  [-0.6, 0.6].forEach((side) => {
    context.beginPath();
    context.moveTo(x + side * s * 0.5, y + s * 0.3);
    context.quadraticCurveTo(x + side * s * 1.15, y + s * 0.05, x + side * s * 1.35, y + s * 0.55);
    context.quadraticCurveTo(x + side * s * 0.9, y + s * 0.75, x + side * s * 0.5, y + s * 0.3);
    context.fill();
  });
  const bloom = context.createRadialGradient(x - s * 0.2, y - s * 0.25, s * 0.1, x, y, s);
  bloom.addColorStop(0, mix(color, '#FFFFFF', 0.25));
  bloom.addColorStop(1, mix(color, '#000000', 0.25));
  context.fillStyle = bloom;
  context.beginPath();
  context.arc(x, y, s * 0.72, 0, TAU);
  context.fill();
  context.strokeStyle = mix(color, '#000000', 0.45);
  context.lineWidth = Math.max(0.6, s * 0.07);
  context.beginPath();
  Array.from({ length: 40 }, (_, index) => {
    const angle = index * 0.42;
    const radius = s * 0.04 + index * s * 0.0155;
    return [x + Math.cos(angle) * radius, y + Math.sin(angle) * radius * 0.92] as const;
  }).forEach(([px, py], index) => (index === 0 ? context.moveTo(px, py) : context.lineTo(px, py)));
  context.stroke();
};
