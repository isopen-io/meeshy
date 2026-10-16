import { rainPose, RAIN_GLYPH_PX, type RainEngine, type RainViewport } from './rain';

/**
 * **LA PLUIE, POSÉE DANS LE DOM** (#10813) — le pilote du moteur (`rain.ts`) :
 * une instance vivante = UN nœud, créé à sa naissance, déplacé à chaque image
 * par `transform` et `opacity` seulement, et RETIRÉ du document à l'image où
 * le moteur le déclare fondu. Rien ne passe par le rendu de Preact : une pluie
 * de quatorze glyphes à 60 images par seconde n'a aucune raison de réconcilier
 * un arbre.
 *
 * Le démontage annule l'image demandée et retire tous les nœuds : la pluie ne
 * laisse rien derrière elle — ni nœud, ni rappel, ni carte.
 */
export type RainScheduler = {
  readonly frame: (callback: (now: number) => void) => number;
  readonly cancel: (id: number) => void;
};

export const browserRainScheduler: RainScheduler = {
  frame: (callback) => requestAnimationFrame(callback),
  cancel: (id) => cancelAnimationFrame(id),
};

const glyphOf = (emoji: string): HTMLSpanElement => {
  const node = document.createElement('span');
  node.textContent = emoji;
  node.setAttribute('aria-hidden', 'true');
  node.setAttribute('data-mood-rain-glyph', '');
  node.style.position = 'absolute';
  node.style.left = '0';
  node.style.top = '0';
  node.style.width = `${RAIN_GLYPH_PX}px`;
  node.style.height = `${RAIN_GLYPH_PX}px`;
  node.style.fontSize = `${Math.round(RAIN_GLYPH_PX * 0.8)}px`;
  node.style.lineHeight = `${RAIN_GLYPH_PX}px`;
  node.style.textAlign = 'center';
  node.style.transformOrigin = '50% 50%';
  node.style.willChange = 'transform, opacity';
  node.style.pointerEvents = 'none';
  node.style.opacity = '0';
  return node;
};

export function mountMoodRain(
  host: HTMLElement,
  params: {
    readonly emoji: string;
    readonly engine: RainEngine;
    readonly viewport: () => RainViewport;
    readonly scheduler: RainScheduler;
  },
): () => void {
  const { engine, scheduler } = params;
  const nodes = new Map<number, HTMLSpanElement>();
  let pending: number | null = null;
  let disposed = false;

  const render = (now: number) => {
    pending = null;
    if (disposed) return;
    const { born, retired } = engine.tick(now);
    retired.forEach((id) => {
      nodes.get(id)?.remove();
      nodes.delete(id);
    });
    born.forEach((particle) => {
      const node = glyphOf(params.emoji);
      nodes.set(particle.id, node);
      host.appendChild(node);
    });
    const viewport = params.viewport();
    engine.live().forEach((particle) => {
      const node = nodes.get(particle.id);
      const pose = rainPose(particle, now, viewport);
      if (node === undefined || pose === null) return;
      node.style.transform = pose.transform;
      node.style.opacity = pose.opacity.toFixed(3);
    });
    pending = scheduler.frame(render);
  };

  pending = scheduler.frame(render);

  return () => {
    disposed = true;
    if (pending !== null) scheduler.cancel(pending);
    pending = null;
    nodes.forEach((node) => node.remove());
    nodes.clear();
  };
}
