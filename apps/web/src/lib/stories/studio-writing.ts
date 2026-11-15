import { SCENE_TEXT_WRAP_FRACTION, sceneTextAppearance } from '@/lib/canvas/text-appearance';

import { textLayerPayload, type StudioTextLayer } from './studio-text';

/**
 * **LE TEXTE S'ÉCRIT À L'ÉCHELLE DE LA SCÈNE** (#8681, jumelle web de #8680 —
 * porteur 2026-09-29 : « le texte qui apparaît pour écrire doit être
 * proportionnel en taille par rapport à cette scène »).
 *
 * La saisie est TRANSPARENTE au-dessus du texte que le moteur peint : on voit
 * le texte peint, on touche la saisie. Ce qu'elle montre d'elle-même — le
 * curseur, l'invite d'un texte neuf, la sélection — doit donc avoir la taille,
 * la place, l'angle et la typographie du texte peint. Mesuré avant ce lot
 * (Chromium 390×844, `scratchpad/lot-8681`) :
 *
 *  - la police était celle de l'objet SANS son échelle : un texte agrandi ×1,6
 *    s'écrivait avec un curseur 1,6 fois trop petit, droit sur un texte tourné,
 *    dans la famille système sur un texte « Machine » ;
 *  - la boîte était l'ENVELOPPE écran du texte peint (transformée), et un
 *    texte neuf, qui ne peint rien, empruntait celle du PREMIER texte de la
 *    scène — l'invite « Ajouter du texte » s'affichait sur l'autre texte.
 *
 * La saisie reprend désormais la pose de `SceneObjectFrame` (ancre en %, puis
 * `translate(-50%, -50%) rotate scale`) et la police en `cqw` du moteur
 * (`scene-object-text.tsx`) : `cqw` se résout contre la carte, donc la taille
 * RENDUE vaut `fontSize / 1080 × scale × largeur de la scène visible` — la
 * taille publiée, rapportée à la scène réduite par l'outil ouvert (#8654).
 * La boîte, quand le texte est peint, est sa taille AVANT transformation.
 */
export type StudioWritingBox = { readonly width: number; readonly height: number };

export type StudioWritingStyle = {
  readonly left: string;
  readonly top: string;
  readonly width: string;
  readonly maxWidth: string;
  readonly height?: string;
  readonly transform: string;
  readonly fontSize: string;
  readonly textAlign: 'left' | 'center' | 'right';
  readonly fontFamily?: string;
  readonly fontWeight?: number;
  readonly fontStyle?: 'italic';
  readonly padding?: string;
};

/** La borne du moteur : un texte peint ne dépasse jamais 88 % de la scène. */
const MAX_WIDTH = `${SCENE_TEXT_WRAP_FRACTION * 100}cqw`;

const percent = (fraction: number): string => `${Math.round(fraction * 1e6) / 1e4}%`;

/** Un pixel de marge : la largeur peinte est fractionnaire, et une saisie
 * plus étroite d'un souffle couperait sa dernière ligne ailleurs. La borne
 * `MAX_WIDTH` la ramène au bord exact quand le texte peint est lui-même borné. */
const SLACK_PX = 1;

export function studioWritingStyle({
  layer,
  widthFraction,
  box,
}: {
  readonly layer: StudioTextLayer;
  /** `resolveSceneText(…).widthFraction` — la taille du texte en fraction de la scène. */
  readonly widthFraction: number;
  /** La boîte du texte PEINT avant transformation — `null` tant qu'il ne peint rien. */
  readonly box: StudioWritingBox | null;
}): StudioWritingStyle {
  const look = sceneTextAppearance(textLayerPayload(layer));
  const { pose } = layer;
  return {
    left: percent(pose.x),
    top: percent(pose.y),
    width: box === null ? MAX_WIDTH : `${Math.round((box.width + SLACK_PX) * 100) / 100}px`,
    maxWidth: MAX_WIDTH,
    ...(box === null ? {} : { height: `${Math.round(box.height * 100) / 100}px` }),
    transform: `translate(-50%, -50%) rotate(${pose.rotation}deg) scale(${pose.scale})`,
    fontSize: `${widthFraction * 100}cqw`,
    textAlign: look.textAlign,
    ...(look.fontFamily !== undefined ? { fontFamily: look.fontFamily } : {}),
    ...(look.fontWeight !== undefined ? { fontWeight: look.fontWeight } : {}),
    ...(look.fontStyle !== undefined ? { fontStyle: look.fontStyle } : {}),
    ...(look.padding !== undefined ? { padding: look.padding } : {}),
  };
}
