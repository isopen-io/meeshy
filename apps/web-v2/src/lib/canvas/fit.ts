/**
 * `fitScene` — l'AJUSTEMENT (aspect-fit, centré) partagé par le moteur de
 * scène (#6898, D-79) : la MÊME primitive sert au plafond d'une carte de fil
 * (`lib/feed/scene-framing.ts#cappedContentSize`), au cadre plein écran d'un
 * Réel, et à la vignette d'une mosaïque — une SEULE fonction, jamais
 * recopiée. Le rapport (`ratio` = largeur / hauteur) NE dépend PAS du mode du
 * player : `playerConfig` (`config.ts`) ne gouverne que le son, la boucle et
 * le chrome.
 */
export type ViewportSize = { readonly width: number; readonly height: number };

export function fitScene(params: { readonly viewport: ViewportSize; readonly ratio: number }): ViewportSize {
  const { viewport, ratio } = params;
  if (viewport.width <= 0 || viewport.height <= 0 || ratio <= 0) return { width: 0, height: 0 };
  const boxAspect = viewport.width / viewport.height;
  if (ratio > boxAspect) return { width: viewport.width, height: viewport.width / ratio };
  return { width: viewport.height * ratio, height: viewport.height };
}
