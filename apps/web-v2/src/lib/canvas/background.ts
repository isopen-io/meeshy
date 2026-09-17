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

/** `"RRGGBB"` — six chiffres hexadécimaux, rien d'autre. */
const HEX_COLOR = /^[0-9a-fA-F]{6}$/;

/**
 * `hexColorCss` (#6899) — une couleur hexadécimale du corpus (`"RRGGBB"` ou
 * `"#RRGGBB"`, les deux formes que la passerelle sert : `Color(hex:)` côté iOS
 * lit l'une et l'autre) vers une déclaration CSS VALIDE ; `undefined` pour tout
 * le reste. SITE UNIQUE de la lecture d'une couleur de scène : le fond
 * (`backgroundCss`) et le texte (`lib/canvas/text.ts`) la partagent.
 */
export function hexColorCss(value: unknown): string | undefined {
  if (typeof value !== 'string' || value === '') return undefined;
  const digits = value.startsWith('#') ? value.slice(1) : value;
  return HEX_COLOR.test(digits) ? `#${digits}` : undefined;
}

/**
 * `backgroundCss` (#6899, T6) — LE SITE UNIQUE de validation d'une valeur de
 * fond `StoryBackgroundValue` (`StoryBackgroundValue.swift:1-38`) vers le CSS,
 * partagé par le fond v1 du lecteur (`routes/story.tsx#sceneBackground`, qui
 * en devient un APPEL) et le fond v3 du moteur (`SceneCanvas`, qui posait
 * `payload.background` TEL QUEL — un fond v1 hérité `"RRGGBB"` sans `#` y
 * aurait été une déclaration CSS INVALIDE, § 2 de la spécification
 * `stories-lecteur`).
 *
 * Ce qui vient du corpus n'entre JAMAIS tel quel dans une déclaration CSS :
 * `storyEffects` est un `Json?` Prisma, donc une chaîne libre côté serveur.
 * Toute forme non reconnue retombe sur le repli de l'APPELANT — un fond
 * illisible vaut mieux servi par un défaut que par une valeur non validée.
 */
export function backgroundCss(value: unknown, fallback: string): string {
  if (typeof value !== 'string' || value === '') return fallback;
  if (value.startsWith('gradient:')) {
    const [, from, to] = value.split(':');
    if (from !== undefined && to !== undefined && HEX_COLOR.test(from) && HEX_COLOR.test(to)) {
      return `linear-gradient(135deg, #${from}, #${to})`;
    }
    return fallback;
  }
  return hexColorCss(value) ?? fallback;
}

export function backgroundFraming(scene: CanvasScene): BackgroundFraming {
  const declared = scene.objects
    .filter((object) => object.kind === 'media' && object.plane === 'bg')
    .map((object) => (isRecord(object.payload.transform) ? object.payload.transform.videoFitMode : undefined))
    .find((mode): mode is string => typeof mode === 'string');
  return declared === 'fit' ? 'fit' : 'fill';
}
