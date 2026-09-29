import {
  demonEyesOf,
  haloOf,
  hornsOf,
  lavaGlow,
  nextEffectLoad,
  risingParticles,
  sparklesOf,
  toadOf,
  type Box,
  type EffectLoad,
  type Particle,
} from './face-effects';
import { createFaceTracker, type FaceDetectorPort } from './face-tracker';
import type { FaceLayer, FaceTarget } from './video-effects-pipeline';
import type { FaceEffect } from './video-effects';

/**
 * **LE CALQUE DES EFFETS DE VISAGE** (#8551) — la couche MINCE : elle trace ce
 * que `face-effects.ts` calcule, sur l'image que le traitement vient de
 * dessiner. Aucun calcul de position ici ; seulement des tracés.
 *
 * Le coût de chaque image est mesuré ; quand la moyenne glissante dépasse le
 * budget, les ornements (particules, étincelles, fumée) sont abandonnés et
 * l'effet garde sa forme et sa couleur.
 */

type Surface2D = FaceTarget['context'];

type Draw = (target: FaceTarget, face: Box, rich: boolean) => void;

const clock = (): number => (typeof performance === 'undefined' ? Date.now() : performance.now());

function dots(context: Surface2D, particles: readonly Particle[], color: (alpha: number) => string): void {
  particles.forEach((particle) => {
    context.fillStyle = color(particle.alpha);
    context.beginPath();
    context.arc(particle.x, particle.y, particle.r, 0, Math.PI * 2);
    context.fill();
  });
}

const smoothing: Draw = ({ context, source, width, height }, face) => {
  context.save();
  context.beginPath();
  context.ellipse(face.x + face.width / 2, face.y + face.height / 2, face.width * 0.55, face.height * 0.62, 0, 0, Math.PI * 2);
  context.clip();
  context.filter = `blur(${Math.max(2, Math.round(face.width * 0.018))}px) brightness(1.04)`;
  context.globalAlpha = 0.75;
  context.drawImage(source, 0, 0, width, height);
  context.restore();
};

const toad: Draw = ({ context }, face, rich) => {
  const shape = toadOf(face);
  context.save();
  context.globalCompositeOperation = 'multiply';
  context.fillStyle = 'rgba(120, 200, 80, 0.55)';
  context.beginPath();
  context.ellipse(face.x + face.width / 2, face.y + face.height / 2, face.width * 0.62, face.height * 0.66, 0, 0, Math.PI * 2);
  context.fill();
  context.globalCompositeOperation = 'source-over';
  shape.cheeks.forEach((cheek) => {
    context.fillStyle = 'rgba(150, 210, 90, 0.7)';
    context.beginPath();
    context.ellipse(cheek.cx, cheek.cy, cheek.rx, cheek.ry, 0, 0, Math.PI * 2);
    context.fill();
  });
  shape.eyes.forEach((eye) => {
    context.fillStyle = '#6fbf3f';
    context.beginPath();
    context.arc(eye.cx, eye.cy, eye.r * 1.12, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#fbf6d8';
    context.beginPath();
    context.arc(eye.cx, eye.cy, eye.r, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#1b1b10';
    context.beginPath();
    context.ellipse(eye.cx, eye.cy, eye.pupil, eye.pupil * 0.55, 0, 0, Math.PI * 2);
    context.fill();
  });
  if (rich) {
    context.fillStyle = 'rgba(90, 140, 50, 0.85)';
    shape.warts.forEach((wart) => {
      context.beginPath();
      context.arc(wart.x, wart.y, wart.r, 0, Math.PI * 2);
      context.fill();
    });
  }
  context.restore();
};

const angel: Draw = ({ context, t }, face, rich) => {
  const halo = haloOf(face, t);
  context.save();
  context.globalCompositeOperation = 'screen';
  const bloom = context.createRadialGradient(halo.cx, face.y + face.height / 2, face.width * 0.2, halo.cx, face.y + face.height / 2, face.width * 1.1);
  bloom.addColorStop(0, `rgba(255, 244, 214, ${0.35 * halo.glow})`);
  bloom.addColorStop(1, 'rgba(255, 244, 214, 0)');
  context.fillStyle = bloom;
  context.fillRect(face.x - face.width, face.y - face.height, face.width * 3, face.height * 3);
  context.globalCompositeOperation = 'source-over';
  context.shadowColor = 'rgba(255, 214, 102, 0.9)';
  context.shadowBlur = halo.lineWidth * 3 * halo.glow;
  context.strokeStyle = '#ffd666';
  context.lineWidth = halo.lineWidth;
  context.beginPath();
  context.ellipse(halo.cx, halo.cy, halo.rx, halo.ry, 0, 0, Math.PI * 2);
  context.stroke();
  context.shadowBlur = 0;
  if (rich) dots(context, sparklesOf(face, t), (alpha) => `rgba(255, 250, 220, ${alpha})`);
  context.restore();
};

const demon: Draw = ({ context, width, height, t }, face, rich) => {
  const horns = hornsOf(face);
  context.save();
  context.globalCompositeOperation = 'multiply';
  context.fillStyle = 'rgba(210, 40, 30, 0.28)';
  context.fillRect(0, 0, width, height);
  context.globalCompositeOperation = 'source-over';
  [horns.left, horns.right].forEach((horn) => {
    const gradient = context.createLinearGradient(horn.base[0].x, horn.base[0].y, horn.tip.x, horn.tip.y);
    gradient.addColorStop(0, '#5a0d0d');
    gradient.addColorStop(1, '#d9301f');
    context.fillStyle = gradient;
    context.beginPath();
    context.moveTo(horn.base[0].x, horn.base[0].y);
    context.quadraticCurveTo(horn.control.x, horn.control.y, horn.tip.x, horn.tip.y);
    context.lineTo(horn.base[1].x, horn.base[1].y);
    context.closePath();
    context.fill();
  });
  demonEyesOf(face, t).forEach((eye) => {
    context.shadowColor = 'rgba(255, 60, 20, 1)';
    context.shadowBlur = eye.r * 3 * eye.glow;
    context.fillStyle = `rgba(255, 70, 30, ${0.55 + 0.35 * eye.glow})`;
    context.beginPath();
    context.arc(eye.cx, eye.cy, eye.r, 0, Math.PI * 2);
    context.fill();
  });
  context.shadowBlur = 0;
  if (rich) dots(context, risingParticles({ seed: 7, t, count: 18, area: { x: 0, y: height * 0.4, width, height: height * 0.6 } }), (alpha) => `rgba(255, 110, 40, ${alpha})`);
  context.restore();
};

const volcano: Draw = ({ context, width, height, t }, _face, rich) => {
  const glow = lavaGlow(t);
  context.save();
  const lava = context.createLinearGradient(0, height, 0, height * 0.35);
  lava.addColorStop(0, `rgba(255, 90, 0, ${0.75 * glow})`);
  lava.addColorStop(0.45, `rgba(255, 140, 20, ${0.35 * glow})`);
  lava.addColorStop(1, 'rgba(255, 140, 20, 0)');
  context.globalCompositeOperation = 'screen';
  context.fillStyle = lava;
  context.fillRect(0, 0, width, height);
  context.globalCompositeOperation = 'source-over';
  if (rich) {
    dots(context, risingParticles({ seed: 3, t, count: 12, area: { x: 0, y: 0, width, height: height * 0.5 }, size: width * 0.03, period: 5200 }), (alpha) => `rgba(60, 50, 45, ${0.25 * alpha})`);
    dots(context, risingParticles({ seed: 11, t, count: 28, area: { x: 0, y: 0, width, height } }), (alpha) => `rgba(255, ${150 + Math.round(alpha * 80)}, 40, ${alpha})`);
  }
  context.restore();
};

const DRAW: Readonly<Record<Exclude<FaceEffect, 'none'>, Draw>> = { smoothing, toad, angel, demon, volcano };

/** Le calque du traitement des images : le visage suivi, le coût surveillé, l'effet tracé. */
export function createFaceLayer(detector: FaceDetectorPort | null): FaceLayer {
  const tracker = createFaceTracker(detector);
  let frameIndex = 0;
  let load: EffectLoad = { ema: 0, degraded: false };
  return (target, effects) => {
    if (effects.faceEffect === 'none') return;
    const started = clock();
    const face = tracker.next(target.source, target, frameIndex);
    frameIndex += 1;
    try {
      DRAW[effects.faceEffect](target, face, !load.degraded);
    } finally {
      load = nextEffectLoad(load, clock() - started);
    }
  };
}
