/**
 * **LE FILTRE D'UN MÉDIA** (lot 7, #8474) — `payload.filter` d'un objet
 * `media` de CanvasV3, aux valeurs de `StoryFilter`
 * (`packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift`).
 *
 * C'est la place que `CanvasV3Migration.swift` donne déjà au filtre de SLIDE
 * (porté par le média de fond) ; un média POSÉ porte le sien sur SA charge, et
 * le filtre ne peint jamais que l'objet qui le porte — ni la scène, ni ses
 * voisins. Le moteur partagé le relit, donc le composer et le lecteur peignent
 * la même chose.
 *
 * iOS peint par `CIFilter` ; le web approche chaque effet par une chaîne de
 * filtres CSS — l'intention (noir et blanc, chaud, froid…) est la même, pas
 * le pixel. Une valeur inconnue ne filtre rien : un document venu d'une
 * version plus récente reste lisible.
 */
export const STORY_FILTERS = ['vintage', 'bw', 'warm', 'cool', 'dramatic', 'vivid', 'fade', 'chrome'] as const;

export type StoryFilterId = (typeof STORY_FILTERS)[number];

const FILTER_CSS = {
  vintage: 'sepia(0.45) contrast(1.05) saturate(0.85) brightness(1.05)',
  bw: 'grayscale(1) contrast(1.1)',
  warm: 'sepia(0.25) saturate(1.25) hue-rotate(-8deg)',
  cool: 'saturate(0.9) hue-rotate(12deg) brightness(1.03)',
  dramatic: 'contrast(1.4) saturate(1.1) brightness(0.95)',
  vivid: 'saturate(1.6) contrast(1.08)',
  fade: 'contrast(0.82) saturate(0.7) brightness(1.1)',
  chrome: 'contrast(1.15) saturate(1.3) brightness(1.02)',
} as const satisfies Record<StoryFilterId, string>;

export const isStoryFilter = (value: unknown): value is StoryFilterId =>
  typeof value === 'string' && (STORY_FILTERS as readonly string[]).includes(value);

export const readMediaFilter = (payload: Readonly<Record<string, unknown>>): StoryFilterId | null =>
  isStoryFilter(payload.filter) ? payload.filter : null;

export const storyFilterCss = (filter: StoryFilterId): string => FILTER_CSS[filter];

export function mediaFilterCss(payload: Readonly<Record<string, unknown>>): string | undefined {
  const filter = readMediaFilter(payload);
  return filter === null ? undefined : FILTER_CSS[filter];
}
