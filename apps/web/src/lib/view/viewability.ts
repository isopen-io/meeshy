import type { EventTargetRef, ImpressionVisibility, VisibleTarget } from '@/lib/api/social-events-v2-types';

/**
 * **L'IMPRESSION VISIBLE, NORME IAB/MRC** (#10501, décision § 3) — ≥ 50 % de
 * la surface pendant 1 000 ms continues, 2 000 ms pour une vidéo en lecture.
 * `viewable` est un ATTRIBUT de l'impression : la règle de comptage du
 * porteur (chaque listage compte) ne change pas.
 *
 * UN SEUL `IntersectionObserver` pour toute la page (seuils `[0, 0.5, 1]`) :
 * un observateur par carte coûtait un objet natif et un rappel par carte.
 */
export const MRC_VISIBLE_FRACTION = 0.5;
export const MRC_DISPLAY_MS = 1000;
export const MRC_VIDEO_MS = 2000;

export type ViewabilityKind = 'display' | 'video';

export type ViewabilityClock = {
  readonly update: (fraction: number, at: number) => void;
  readonly snapshot: (at: number) => ImpressionVisibility;
};

const round2 = (value: number): number => Math.round(Math.max(0, Math.min(1, value)) * 100) / 100;

export function createViewabilityClock(kind: ViewabilityKind): ViewabilityClock {
  const threshold = kind === 'video' ? MRC_VIDEO_MS : MRC_DISPLAY_MS;
  let maxFraction = 0;
  let visibleMs = 0;
  let runStart: number | null = null;
  let viewable = false;

  const settle = (at: number): void => {
    if (runStart !== null && at - runStart >= threshold) viewable = true;
  };

  return {
    update(fraction, at) {
      settle(at);
      maxFraction = Math.max(maxFraction, fraction);
      const visible = fraction >= MRC_VISIBLE_FRACTION;
      if (visible && runStart === null) {
        runStart = at;
        return;
      }
      if (!visible && runStart !== null) {
        visibleMs += at - runStart;
        runStart = null;
      }
    },
    snapshot(at) {
      settle(at);
      const running = runStart === null ? 0 : at - runStart;
      return { maxVisibleFraction: round2(maxFraction), visibleMs: Math.round(visibleMs + running), viewable };
    },
  };
}

type IntersectionEntry = { readonly target: Element; readonly isIntersecting: boolean; readonly intersectionRatio: number };

export type SharedObserverCtor = new (
  callback: (entries: readonly IntersectionEntry[]) => void,
  options: { threshold: number[] },
) => { observe(node: Element): void; unobserve(node: Element): void; disconnect(): void };

type Listener = (fraction: number) => void;

type Shared = { readonly observer: InstanceType<SharedObserverCtor>; readonly listeners: Map<Element, Set<Listener>> };

/** Un observateur vivant par constructeur ; libéré quand plus rien n'est observé. */
const shared = new WeakMap<SharedObserverCtor, Shared>();

function sharedFor(Observer: SharedObserverCtor): Shared {
  const known = shared.get(Observer);
  if (known !== undefined) return known;
  const listeners = new Map<Element, Set<Listener>>();
  const observer = new Observer((entries) => {
    entries.forEach((entry) => {
      const fraction = entry.isIntersecting ? entry.intersectionRatio : 0;
      listeners.get(entry.target)?.forEach((listener) => listener(fraction));
    });
  }, { threshold: [0, MRC_VISIBLE_FRACTION, 1] });
  const created = { observer, listeners };
  shared.set(Observer, created);
  return created;
}

export type VisibilityDeps = { readonly Observer?: SharedObserverCtor | undefined };

function resolveObserver(deps: VisibilityDeps): SharedObserverCtor | null {
  const Observer = deps.Observer ?? (globalThis as { IntersectionObserver?: SharedObserverCtor }).IntersectionObserver;
  return typeof Observer === 'function' ? Observer : null;
}

/** La fraction visible d'un nœud, à chaque seuil franchi. Sans `IntersectionObserver`, rien. */
export function observeVisibility(node: Element, listener: Listener, deps: VisibilityDeps = {}): () => void {
  const Observer = resolveObserver(deps);
  if (Observer === null) return () => undefined;
  const { observer, listeners } = sharedFor(Observer);
  const set = listeners.get(node) ?? new Set<Listener>();
  const first = set.size === 0;
  set.add(listener);
  listeners.set(node, set);
  if (first) observer.observe(node);
  return () => {
    set.delete(listener);
    if (set.size > 0) return;
    listeners.delete(node);
    observer.unobserve(node);
    if (listeners.size > 0) return;
    observer.disconnect();
    shared.delete(Observer);
  };
}

const onScreen = new Map<Element, { readonly target: EventTargetRef; fraction: number }>();

/**
 * Tient la cible d'un nœud au registre de ce qui est À L'ÉCRAN — lu par la
 * détection de capture (#10508). Rien n'est écrit ni envoyé ici.
 */
export function trackVisibleTarget(node: Element, target: EventTargetRef, deps: VisibilityDeps = {}): () => void {
  const entry = { target, fraction: 0 };
  onScreen.set(node, entry);
  const stop = observeVisibility(node, (fraction) => {
    entry.fraction = fraction;
  }, deps);
  return () => {
    stop();
    if (onScreen.get(node) === entry) onScreen.delete(node);
  };
}

export const VISIBLE_TARGETS_CAP = 10;

export function visibleTargets(): readonly VisibleTarget[] {
  return [...onScreen.values()]
    .filter((entry) => entry.fraction > 0)
    .sort((a, b) => b.fraction - a.fraction)
    .slice(0, VISIBLE_TARGETS_CAP)
    .map(({ target, fraction }) => ({ kind: target.kind, id: target.id, visibleFraction: round2(fraction) }));
}
