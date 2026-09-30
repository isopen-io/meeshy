import type { ReactNode } from 'react';

import { Glyph } from '@/components/glyph';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import type { StudioDoor } from '@/lib/stories/studio-page';
import { chromeFade, StudioTile, TextMark } from '@/routes/story-compose-chrome';
import { StudioDoorButton } from '@/routes/story-compose-parts';

/**
 * **LE COULOIR GAUCHE** — ce qu'on POSE sur la scène (les portes), en disques
 * de verre SÉPARÉS, sans libellé (lot 6), dans l'ordre d'iOS
 * (`ComposerRailDoor.canonicalRail` : média, son, texte). Le TEXTE y vit
 * (#8516) : c'est une porte de niveau objet, qui se voit sur la scène
 * (`appearsOnCanvas`). Les objets déjà posés ne s'y listent plus : on les
 * touche sur la scène (sélection silencieuse, `story-compose-stage.tsx`).
 * VERROUILLÉ pendant l'envoi (#7707).
 */
export function StudioLeadingRail({
  lang,
  locked,
  onPlace,
  onAddText,
  onImport,
  sound = true,
  hidden = false,
  children,
}: {
  readonly lang: InterfaceLanguage;
  readonly locked: boolean;
  readonly onPlace: (door: StudioDoor, file: File) => void;
  /** « T+ » — pose un texte et ouvre sa saisie (#8515). */
  readonly onAddText: () => void;
  /** L'IMPORT MULTIPLE de la porte du fond (#8533) — absent d'une retouche,
   * qui ne travaille qu'une image. */
  readonly onImport?: (files: readonly File[]) => void;
  /** La porte du SON — absente d'une retouche d'image (#8416). */
  readonly sound?: boolean;
  /** UN OUTIL OUVERT (#8654) — les portes et leurs (+) cèdent en fondu. */
  readonly hidden?: boolean;
  /** LES BOUTONS DE SCÈNE après la dernière porte (#8713) — l'éclair, puis le
   * Cadre (`studioLeadingSceneToggles`). */
  readonly children?: ReactNode;
}) {
  return (
    <div
      data-story-studio-rail="leading"
      {...chromeFade(!hidden)}
      className="absolute start-2.5 top-1/2 z-10 flex -translate-y-1/2 flex-col items-center gap-2 overflow-y-auto p-0.5"
      style={{ maxHeight: 'calc(100% - 1rem)' }}
    >
      <StudioDoorButton
        door="visual"
        label={translate(lang, 'story.studio.background.add')}
        glyph="image"
        accept="image/*,video/*"
        onSelect={(file) => onPlace('visual', file)}
        {...(onImport !== undefined ? { onSelectMany: onImport } : {})}
        disabled={locked}
      />
      <StudioDoorButton
        door="overlay"
        label={translate(lang, 'story.studio.overlay.add')}
        glyph="layer"
        accept="image/*,video/*"
        onSelect={(file) => onPlace('overlay', file)}
        disabled={locked}
      />
      {sound ? (
        <StudioDoorButton
          door="sound"
          label={translate(lang, 'story.studio.sound.add')}
          glyph="microphone"
          accept="audio/*"
          onSelect={(file) => onPlace('sound', file)}
          disabled={locked}
        />
      ) : null}
      <StudioTile label={translate(lang, 'story.studio.tile.text')} hint={translate(lang, 'story.studio.text.add')} probe="add-text" onPress={onAddText} disabled={locked}>
        <span className="relative">
          <TextMark size={20} />
          <Glyph name="plus" size={10} className="absolute -end-2 -top-1" />
        </span>
      </StudioTile>
      {children}
    </div>
  );
}
