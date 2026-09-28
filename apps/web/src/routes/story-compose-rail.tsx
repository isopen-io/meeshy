import { Glyph } from '@/components/glyph';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import type { StudioDoor } from '@/lib/stories/studio-page';
import { FrameMark, RedoMark, StudioTile, TextMark, UndoMark } from '@/routes/story-compose-chrome';
import { PageMark, SlidersMark, StudioDoorButton } from '@/routes/story-compose-parts';

/**
 * **LE COULOIR GAUCHE** — ce qu'on POSE sur la scène (les portes), en disques
 * de verre SÉPARÉS, sans libellé (lot 6). Les objets déjà posés ne s'y
 * listent plus : on les touche sur la scène (sélection silencieuse,
 * `story-compose-stage.tsx`). VERROUILLÉ pendant l'envoi (#7707).
 */
export function StudioLeadingRail({
  lang,
  locked,
  onPlace,
  sound = true,
}: {
  readonly lang: InterfaceLanguage;
  readonly locked: boolean;
  readonly onPlace: (door: StudioDoor, file: File) => void;
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
    </div>
  );
}

/**
 * **LE RAIL DROIT, EN TUILES LIBELLÉES** (#8413, miroir
 * `ComposerTrailingRail.tiles`) — ce qui agit sur la PUBLICATION (créer une
 * scène), sur l'OBJET (un texte, ses réglages, le Cadre du fond) et sur
 * l'HISTORIQUE (annuler, rétablir), dans l'ordre d'iOS.
 *
 * Loi 4 tenue tuile par tuile : une tuile sans effet n'est pas montée —
 * « Scène » disparaît au plafond (`STUDIO_PAGE_MAX`), « Cadre » sans média de
 * fond, « Annuler » sans rien à annuler, « Rétablir » sans rien à rétablir.
 */
export function StudioTrailingRail({
  lang,
  locked,
  onAddPage,
  onAddText,
  editorOpen,
  onToggleEditor,
  frameOpen,
  onToggleFrame,
  onUndo,
  onRedo,
}: {
  readonly lang: InterfaceLanguage;
  readonly locked: boolean;
  /** `null` au plafond de scènes. */
  readonly onAddPage: (() => void) | null;
  readonly onAddText: () => void;
  readonly editorOpen: boolean;
  /** `null` sans objet sélectionné : rien à modifier (lot 6). */
  readonly onToggleEditor: (() => void) | null;
  readonly frameOpen: boolean;
  /** `null` sans média de fond. */
  readonly onToggleFrame: (() => void) | null;
  /** `null` sans rien à annuler / rétablir. */
  readonly onUndo: (() => void) | null;
  readonly onRedo: (() => void) | null;
}) {
  return (
    <div
      data-story-studio-rail="trailing"
      role="group"
      aria-label={translate(lang, 'story.studio.editor.label')}
      className="absolute end-2.5 bottom-2 z-10 flex max-h-[calc(100%-1rem)] flex-col items-center gap-2 overflow-y-auto p-0.5"
    >
      {onAddPage !== null ? (
        <StudioTile label={translate(lang, 'story.studio.tile.page')} hint={translate(lang, 'story.studio.page.add')} probe="add-page" onPress={onAddPage} disabled={locked}>
          <PageMark size={20} />
        </StudioTile>
      ) : null}
      <StudioTile label={translate(lang, 'story.studio.tile.text')} hint={translate(lang, 'story.studio.text.add')} probe="add-text" onPress={onAddText} disabled={locked}>
        <span className="relative">
          <TextMark size={20} />
          <Glyph name="plus" size={10} className="absolute -end-2 -top-1" />
        </span>
      </StudioTile>
      {onToggleEditor !== null ? (
        <StudioTile
          label={translate(lang, 'story.studio.tile.editor')}
          hint={translate(lang, 'story.studio.editor.label')}
          probe="editor-toggle"
          pressed={editorOpen}
          onPress={onToggleEditor}
          disabled={locked}
        >
          <SlidersMark size={20} />
        </StudioTile>
      ) : null}
      {onToggleFrame !== null ? (
        <StudioTile label={translate(lang, 'story.studio.tile.frame')} probe="frame" pressed={frameOpen} onPress={onToggleFrame} disabled={locked}>
          <FrameMark size={20} />
        </StudioTile>
      ) : null}
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
    </div>
  );
}
