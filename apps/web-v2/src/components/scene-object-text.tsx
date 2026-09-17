import { hexColorCss } from '@/lib/canvas/background';
import type { CanvasObject } from '@/lib/canvas/document';
import { resolveSceneText } from '@/lib/canvas/text';

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
  const { payload } = object;
  const textAlign = typeof payload.textAlign === 'string' ? payload.textAlign : 'center';
  // `textBg`/`backgroundStyle.solid(hex)` — une pastille SOLIDE derrière le
  // texte ; `glass` (backdrop-filter) est HORS TRANCHE (§ 9, Q7 : un
  // compositing par texte, question produit ouverte).
  const backgroundStyle = payload.backgroundStyle;
  const solidHex =
    typeof backgroundStyle === 'object' && backgroundStyle !== null && 'solid' in backgroundStyle
      ? (backgroundStyle as { solid?: unknown }).solid
      : payload.textBg;
  const pillColor = hexColorCss(solidHex);
  return (
    <SceneObjectFrame object={object} kind="text" clock={clock}>
      <span
        data-scene-text
        {...(resolved.language !== '' ? { lang: resolved.language } : {})}
        className="block max-w-[85%] whitespace-pre-wrap font-semibold"
        style={{
          textAlign: textAlign as 'left' | 'center' | 'right',
          color: resolved.color,
          // Un texte se dimensionne sur la LARGEUR de la scène rendue
          // (`CanvasGeometry.scaleFactor`), en unités de conteneur.
          fontSize: `${resolved.widthFraction * 100}cqw`,
          lineHeight: 1.2,
          ...(pillColor !== undefined ? { backgroundColor: pillColor, borderRadius: '0.25em', padding: '0.2em 0.5em' } : {}),
        }}
      >
        {resolved.text}
      </span>
    </SceneObjectFrame>
  );
}
