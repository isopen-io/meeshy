import type { CanvasScene } from './document';

/**
 * LE CADRAGE DU FOND D'UNE SCÈNE — miroir de
 * `StoryBackgroundFraming.rendersFilled` (`StoryBackgroundFraming.swift:62`)
 * et de la gravité que `StoryBackgroundLayer` en tire
 * (`StoryBackgroundLayer.swift:512-513`, `:590-592`) : le fond REMPLIT le
 * canvas (`aspectFill`) sauf si son porteur déclare `"fit"`.
 *
 * Le cadrage voyage dans la charge du PORTEUR de fond — l'objet `media` de
 * plan `bg`, `payload.transform.videoFitMode` (`CanvasV3Migration.swift:
 * 202-240`, relu `:776-778`) —, jamais dans l'objet qui adresse l'image.
 *
 * La première forme du moteur (#6898) ajustait TOUJOURS : un fond panorama
 * sous un texte se peignait en bande étroite au milieu de la page là où iOS
 * le montre plein cadre (cible `scenes-fil.light.png`, `RECETTE C`).
 */
export type BackgroundFraming = 'fill' | 'fit';

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> => typeof value === 'object' && value !== null;

export function backgroundFraming(scene: CanvasScene): BackgroundFraming {
  const declared = scene.objects
    .filter((object) => object.kind === 'media' && object.plane === 'bg')
    .map((object) => (isRecord(object.payload.transform) ? object.payload.transform.videoFitMode : undefined))
    .find((mode): mode is string => typeof mode === 'string');
  return declared === 'fit' ? 'fit' : 'fill';
}
