/**
 * `river-metrics.ts` — les DEUX nombres que le tracé SVG doit connaître en
 * PIXELS (R-134). Tout le reste de la peau consomme `--lentille-river-*` en
 * CSS pur (`style={{ … : 'var(--lentille-river-*)' }}`) ; ces deux-là sont
 * l'exception STRUCTURELLE : un attribut `d` de `<path>` SVG ne peut pas
 * contenir `var(...)` — le format n'admet que des nombres littéraux, jamais
 * une expression CSS. C'est une contrainte du SVG, pas un choix de ce fichier.
 *
 * `readRiverPixelToken` lit la valeur RÉELLEMENT résolue de la variable CSS
 * (`getComputedStyle`) — jamais un second nombre dupliqué en dur : la peau
 * CONSOMME le token, elle ne le recopie pas. `fallbackPx` ne sert que quand la
 * feuille de styles n'est pas chargée (jsdom en test, ou tout rendu avant
 * hydratation — `lentille-tokens.css` se documente lui-même « NOT imported
 * anywhere by default », WL-100) ; il MIROITE littéralement
 * `packages/shared/design/lentille-tokens.json` → `river.connector`
 * (R-131), exactement comme `RiverMetrics.Connector` (Swift) mirore le même
 * JSON pour la même raison structurelle côté iOS.
 */

const RIVER_CONNECTOR_MIN_BOW_CSS_VAR = '--lentille-river-connector-min-bow';
const RIVER_CONNECTOR_BOW_RATIO_CSS_VAR = '--lentille-river-connector-bow-ratio';

/** Repli — miroir de `river.connector.minBow` (lentille-tokens.json). */
export const RIVER_CONNECTOR_MIN_BOW_FALLBACK_PX = 34;
/** Repli — miroir de `river.connector.bowRatio` (lentille-tokens.json). */
export const RIVER_CONNECTOR_BOW_RATIO_FALLBACK = 0.5;

/**
 * Lit un token `--lentille-river-*` numérique depuis le DOM. `root` défaut à
 * `document.documentElement` (là où `lentille-tokens.css` déclare `:root`).
 * Hors navigateur (SSR) ou valeur non résolue/non numérique, rend
 * `fallbackPx` plutôt que `NaN`.
 */
export function readRiverPixelToken(
  cssVarName: string,
  fallbackPx: number,
  root?: Element | null
): number {
  if (typeof window === 'undefined' || typeof window.getComputedStyle !== 'function') {
    return fallbackPx;
  }
  const element = root ?? document.documentElement;
  const raw = window.getComputedStyle(element).getPropertyValue(cssVarName).trim();
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : fallbackPx;
}

/**
 * `bow = max(minBow, |Δcouloir| · bowRatio)` — le contrôle de la courbe de
 * Bézier d'un connecteur de réponse (`river.connector`, §7ter). Mot pour mot
 * la formule de la maquette normative et de `RiverMetrics.Connector.bow`
 * (Swift) : seule la SOURCE des deux nombres change (CSS ici, `RiverMetrics`
 * là-bas) — la formule, elle, ne se recalcule JAMAIS différemment (garde
 * R15).
 */
export function connectorBow(laneDistancePx: number, root?: Element | null): number {
  const minBow = readRiverPixelToken(
    RIVER_CONNECTOR_MIN_BOW_CSS_VAR,
    RIVER_CONNECTOR_MIN_BOW_FALLBACK_PX,
    root
  );
  const bowRatio = readRiverPixelToken(
    RIVER_CONNECTOR_BOW_RATIO_CSS_VAR,
    RIVER_CONNECTOR_BOW_RATIO_FALLBACK,
    root
  );
  return Math.max(minBow, Math.abs(laneDistancePx) * bowRatio);
}
