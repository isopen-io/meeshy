import type { CanvasObject } from '@/lib/canvas/document';
import { resolveSceneText } from '@/lib/canvas/text';
import { sceneTextAppearance } from '@/lib/canvas/text-appearance';

import type { SceneClockHandle } from './scene-clock';
import { SceneObjectFrame } from './scene-object-frame';

/**
 * Un objet TEXTE, positionné à son ancre — Prisme au rang de l'objet
 * (`resolveSceneText`, `lib/canvas/text.ts`, jamais `translations.first`).
 * `SceneObjectFrame` porte la pose (ancre, transform, fenêtre, keyframes) ;
 * ce composant ne peint que le CONTENU.
 */
export function SceneObjectText({
  object,
  preferredLanguages,
  clock,
}: {
  readonly object: CanvasObject;
  readonly preferredLanguages: readonly string[];
  readonly clock: SceneClockHandle | null;
}) {
  const resolved = resolveSceneText({ object, preferredLanguages });
  if (resolved.text === '') return null;
  // **CE QUE L'AUTEUR A CHOISI EST PEINT ICI, ou nulle part** (#6943) — famille
  // (les cinq qui ne coûtent aucun octet), graisse, alignement, effet
  // (`text-effect.ts`, les vingt-cinq ombres en `em`), contour des glyphes,
  // pastille et liseré de boîte. Un style ÉCRIT par le studio et non RENDU
  // ici serait une apparence annoncée et non servie — pire qu'une surface non
  // câblée (CLAUDE.md § Prisme, cycle 123). `glass` reste hors tranche (§ 9,
  // Q7 : un compositing par texte, question produit ouverte).
  const look = sceneTextAppearance(object.payload);
  const { webkitTextStroke, ...boxStyle } = look;
  return (
    <SceneObjectFrame object={object} kind="text" clock={clock}>
      <span
        data-scene-text
        {...(resolved.language !== '' ? { lang: resolved.language } : {})}
        className="block whitespace-pre-wrap font-semibold"
        style={{
          ...boxStyle,
          ...(webkitTextStroke !== undefined ? { WebkitTextStroke: webkitTextStroke } : {}),
          color: resolved.color,
          // 85 % DE LA SCÈNE, pas du cadre (revue-correction #6901). Un
          // `max-w-[85%]` résolvait contre `SceneObjectFrame`, dont la
          // largeur est AUTO (shrink-to-fit sur ce texte même) : la boîte
          // peinte valait alors 85 % du texte — mesuré 65,72 px pour un
          // texte de 77,33 px — et le texte DÉBORDAIT sa propre boîte de
          // 15 %, à chaque scène. Le studio, qui aligne sa saisie sur cette
          // boîte (`story-compose.tsx`, `textBox`), coupait « Bonjour » en
          // deux lignes (`check-story-studio.mjs`). `cqw` se résout contre le
          // CONTENEUR (`SceneCanvas`, `container-type: inline-size`), donc
          // contre la scène — le même référentiel que `fontSize` ci-dessous.
          maxWidth: '85cqw',
          // Un texte se dimensionne sur la LARGEUR de la scène rendue
          // (`CanvasGeometry.scaleFactor`), en unités de conteneur.
          fontSize: `${resolved.widthFraction * 100}cqw`,
          lineHeight: 1.2,
        }}
      >
        {resolved.text}
      </span>
    </SceneObjectFrame>
  );
}
