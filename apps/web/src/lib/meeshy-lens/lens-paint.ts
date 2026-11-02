import type { Surface2D } from '@/lib/calls/video-effects-frames';

import type { LensDrawOp, LensParticlePreset } from './lens-plan';

/**
 * **LE PEINTRE 2D D'UNE LENS** (W14, #11320) — trace sur le canevas de l'image
 * ce que `planLens` a décidé : le cadre, les stickers, les textes, les
 * particules. La LUT n'est pas de son ressort : elle se joue sur le GPU, avant
 * lui (`lens-lut-stage.ts`).
 *
 * Les fichiers d'une lens (stickers) sont REMIS par l'hôte, déjà décodés
 * (`assets`) : le peintre n'ouvre rien, ne télécharge rien — le contrat v1
 * interdit tout réseau à une lens. Un fichier absent n'est pas peint, et le
 * reste de la lens l'est. Le cadre se délègue au peintre des cadres du
 * catalogue (`frame`), quand l'hôte en a un.
 */
export type LensAssets = (asset: string) => CanvasImageSource | null;

export type LensFramePainter = (context: Surface2D, motif: string, size: { readonly width: number; readonly height: number }, opacity: number) => void;

export type LensPaintEnv = {
  readonly assets: LensAssets;
  readonly frame?: LensFramePainter;
};

const PARTICLE_COLORS: Readonly<Record<LensParticlePreset, string>> = {
  sparkles: '#FFF4B8',
  confetti: '#F472B6',
  hearts: '#FB7185',
  stars: '#FDE68A',
  snow: '#F8FAFC',
  petals: '#F9A8D4',
  bubbles: '#BAE6FD',
  fireflies: '#D9F99D',
};

type PaintOp = Exclude<LensDrawOp, { readonly kind: 'lut' }>;

function paintSticker(context: Surface2D, op: Extract<PaintOp, { readonly kind: 'sticker' }>, env: LensPaintEnv): void {
  const image = env.assets(op.asset);
  if (image === null) return;
  context.save();
  context.translate(op.x, op.y);
  if (op.rotation !== 0) context.rotate(op.rotation);
  context.drawImage(image, -op.size / 2, -op.size / 2, op.size, op.size);
  context.restore();
}

function paintText(context: Surface2D, op: Extract<PaintOp, { readonly kind: 'text' }>): void {
  context.save();
  context.font = op.font;
  context.fillStyle = op.color;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.direction = op.language === 'ar' ? 'rtl' : 'ltr';
  context.fillText(op.text, op.x, op.y);
  context.restore();
}

function paintParticles(context: Surface2D, op: Extract<PaintOp, { readonly kind: 'particles' }>): void {
  context.save();
  context.fillStyle = PARTICLE_COLORS[op.preset];
  op.dots.forEach((dot) => {
    if (dot.alpha <= 0) return;
    context.globalAlpha = dot.alpha;
    context.beginPath();
    context.arc(dot.x, dot.y, dot.r, 0, Math.PI * 2);
    context.fill();
  });
  context.restore();
}

/** Peint les opérations d'un plan, dans leur ordre ; la LUT est sautée (déjà jouée sur le GPU). */
export function paintLens(context: Surface2D, ops: readonly LensDrawOp[], size: { readonly width: number; readonly height: number }, env: LensPaintEnv): void {
  ops.forEach((op) => {
    switch (op.kind) {
      case 'lut':
        return;
      case 'frame':
        env.frame?.(context, op.motif, size, op.opacity);
        return;
      case 'sticker':
        paintSticker(context, op, env);
        return;
      case 'text':
        paintText(context, op);
        return;
      case 'particles':
        paintParticles(context, op);
        return;
    }
  });
}
