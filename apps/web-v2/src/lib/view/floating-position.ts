import { safeLocalStorage } from '@/lib/storage';
import type { FloatingFraction } from './floating-pose';

/**
 * **LA POSITION MÉMORISÉE D'UN BOUTON FLOTTANT** (#6215) — miroir de
 * `@AppStorage("feedButtonPosition")` / `@AppStorage("menuButtonPosition")`
 * (`RootView.swift:259-260`), format compris : la chaîne `"x,y"`.
 *
 * **Ce qui voyage est une FRACTION, jamais des pixels**, et c'est la seule
 * chose qui rend cette persistance sûre plutôt que dangereuse : une position
 * en pixels enregistrée en portrait pose le bouton HORS de l'écran en paysage,
 * sur un écran plus étroit, ou après un simple redimensionnement de fenêtre.
 *
 * Le même format que celui d'iOS n'est pas de la coquetterie : c'est ce qui
 * permettra à la coque Capacitor de lire une position posée par l'application
 * native, le jour où les deux partagent un appareil.
 */

const KEYS = {
  feed: 'feedButtonPosition',
  menu: 'menuButtonPosition',
} as const;

export type FloatingButtonKey = keyof typeof KEYS;

export function serializeFloatingPosition({ x, y }: FloatingFraction): string {
  return `${x},${y}`;
}

/**
 * **Une valeur illisible retombe sur le DÉFAUT, jamais sur `NaN`.**
 *
 * Le stockage local n'est pas un canal sûr : une mise à jour partielle, une
 * écriture concurrente ou une main dans les outils du navigateur y laissent ce
 * qu'elles veulent. Et l'échec est SILENCIEUX au pire endroit — un `NaN` dans
 * le `calc()` de la pose ne lève aucune erreur, il fait disparaître le bouton.
 *
 * Les fractions hors bornes sont RAMENÉES plutôt que refusées : `"99,-4"` est
 * une position d'un cadre qu'on ne connaît plus, pas une corruption.
 */
export function parseFloatingPosition(raw: string | null, fallback: FloatingFraction): FloatingFraction {
  if (raw === null) return fallback;
  const morceaux = raw.split(',');
  if (morceaux.length !== 2) return fallback;

  const x = Number(morceaux[0]);
  const y = Number(morceaux[1]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return fallback;

  const borne = (valeur: number) => Math.min(1, Math.max(0, valeur));
  return { x: borne(x) < 0.5 ? 0 : 1, y: borne(y) };
}

export function readFloatingPosition(key: FloatingButtonKey, fallback: FloatingFraction): FloatingFraction {
  return parseFloatingPosition(safeLocalStorage().getItem(KEYS[key]), fallback);
}

export function writeFloatingPosition(key: FloatingButtonKey, position: FloatingFraction): void {
  safeLocalStorage().setItem(KEYS[key], serializeFloatingPosition(position));
}
