import { Glyph } from '@/components/glyph';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import type { StudioDoor } from '@/lib/stories/studio-page';
import { FrameMark, RedoMark, StudioTile, TextMark, UndoMark } from '@/routes/story-compose-chrome';
import { PageMark, StudioDoorButton, TimeMark } from '@/routes/story-compose-parts';

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
}) {
  return (
    <div
      data-story-studio-rail="leading"
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
    </div>
  );
}

/**
 * **LE RAIL DROIT** (#8413, #8516, miroir `ComposerTrailingRail.tiles`) — les
 * outils de la SCÈNE, dans l'ordre d'iOS : annuler, rétablir, Temps, Cadre,
 * nouvelle scène. Les actions d'un OBJET n'y sont pas : elles vivent dans son
 * appui long (et son double-tap, et la voie du clavier) ; le Texte est une
 * porte du couloir gauche.
 *
 * Loi 4 tenue tuile par tuile : une tuile sans effet n'est pas montée —
 * « Annuler » / « Rétablir » sans rien à défaire, « Temps » sur une scène
 * statique, « Cadre » sans média de fond, « Scène » au plafond
 * (`STUDIO_PAGE_MAX`). Sans aucune tuile, le rail n'existe pas.
 */
export function StudioTrailingRail({
  lang,
  locked,
  onUndo,
  onRedo,
  timeOpen,
  onToggleTime,
  frameOpen,
  onToggleFrame,
  onAddPage,
}: {
  readonly lang: InterfaceLanguage;
  readonly locked: boolean;
  /** `null` sans rien à annuler / rétablir. */
  readonly onUndo: (() => void) | null;
  readonly onRedo: (() => void) | null;
  readonly timeOpen: boolean;
  /** `null` sur une scène statique. */
  readonly onToggleTime: (() => void) | null;
  readonly frameOpen: boolean;
  /** `null` sans média de fond. */
  readonly onToggleFrame: (() => void) | null;
  /** `null` au plafond de scènes. */
  readonly onAddPage: (() => void) | null;
}) {
  if (onUndo === null && onRedo === null && onToggleTime === null && onToggleFrame === null && onAddPage === null) return null;
  return (
    <div
      data-story-studio-rail="trailing"
      role="group"
      aria-label={translate(lang, 'story.studio.rail.scene')}
      className="absolute end-2.5 bottom-2 z-10 flex max-h-[calc(100%-1rem)] flex-col items-center gap-2 overflow-y-auto p-0.5"
    >
      {onUndo !== null ? (
        <StudioTile label={translate(lang, 'story.studio.undo')} probe="undo" onPress={onUndo} disabled={locked}>
          <UndoMark size={20} />
        </StudioTile>
      ) : null}
      {onRedo !== null ? (
        <StudioTile label={translate(lang, 'story.studio.redo')} probe="redo" onPress={onRedo} disabled={locked}>
          <RedoMark size={20} />
        </StudioTile>
      ) : null}
      {onToggleTime !== null ? (
        <StudioTile label={translate(lang, 'story.studio.tile.time')} probe="time" pressed={timeOpen} onPress={onToggleTime} disabled={locked}>
          <TimeMark size={20} />
        </StudioTile>
      ) : null}
      {onToggleFrame !== null ? (
        <StudioTile label={translate(lang, 'story.studio.tile.frame')} probe="frame" pressed={frameOpen} onPress={onToggleFrame} disabled={locked}>
          <FrameMark size={20} />
        </StudioTile>
      ) : null}
      {onAddPage !== null ? (
        <StudioTile label={translate(lang, 'story.studio.tile.page')} hint={translate(lang, 'story.studio.page.add')} probe="add-page" onPress={onAddPage} disabled={locked}>
          <PageMark size={20} />
        </StudioTile>
      ) : null}
    </div>
  );
}
