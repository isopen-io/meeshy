import type { CanvasObject } from '@/lib/canvas/document';
import { parsePlace, placeLabel, PLACE_FONT_SIZE, PLACE_H_PAD, PLACE_ICON_EM, PLACE_ICON_GAP, PLACE_V_PAD } from '@/lib/canvas/place';
import { cqw } from '@/lib/canvas/units';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';

import { GlyphSvg } from './glyph';
import { FEED_GLYPHS } from './glyphs-feed';
import type { SceneClockHandle } from './scene-clock';
import { SceneObjectFrame } from './scene-object-frame';

/**
 * Un LIEU — pastille arrondie, nom sinon adresse sinon « Ici » localisé
 * (`placeLabel`, miroir `StoryLocationLayer.resolvedLabel`). Couleurs PAR
 * JETONS (D-4) — jamais une valeur en dur : `--ios-indigo-50`/`900` pour la
 * pastille, `--ios-error` pour l'épingle.
 */
export function SceneObjectPlace({ object, clock }: { readonly object: CanvasObject; readonly clock: SceneClockHandle | null }) {
  const place = parsePlace(object.payload);
  if (place === null) return null;
  const language = currentInterfaceLanguage();
  const label = placeLabel(place, translate(language, 'scene.place.here'));

  return (
    <SceneObjectFrame object={object} kind="place" clock={clock}>
      <span
        className="flex items-center whitespace-nowrap"
        style={{
          gap: cqw(PLACE_ICON_GAP / 1080),
          padding: `${cqw(PLACE_V_PAD / 1080)} ${cqw(PLACE_H_PAD / 1080)}`,
          borderRadius: 9999,
          fontSize: cqw(PLACE_FONT_SIZE / 1080),
          // `lineHeight: 1` et `fontWeight: 600` — les deux cotes du gabarit
          // que le legacy pose aussi (`CanvasV3Scene.tsx:735-737`) : sans
          // elles la pastille prenait la hauteur de ligne du document, donc
          // une hauteur qui ne suit plus l'espace design.
          lineHeight: 1,
          fontWeight: 600,
          backgroundColor: 'color-mix(in srgb, var(--ios-indigo-50) 94%, transparent)',
          color: 'var(--ios-indigo-900)',
        }}
      >
        <GlyphSvg
          glyph={FEED_GLYPHS.mapPin}
          style={{ width: `${PLACE_ICON_EM}em`, height: `${PLACE_ICON_EM}em`, color: 'var(--ios-error)', flexShrink: 0 }}
        />
        {label}
      </span>
    </SceneObjectFrame>
  );
}
