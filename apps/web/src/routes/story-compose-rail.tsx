import { Glyph } from '@/components/glyph';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import type { StudioDoor, StudioPage } from '@/lib/stories/studio-page';
import { FrameMark, RedoMark, StudioTile, TextMark, UndoMark } from '@/routes/story-compose-chrome';
import { LayerMark, PageMark, SlidersMark, StudioChip, StudioDoorButton } from '@/routes/story-compose-parts';

/**
 * **LE COULOIR GAUCHE** — ce qu'on POSE sur la scène (les trois portes), puis
 * ce qui y est déjà posé (`meeshy-composer-modele.md` § 6). VERROUILLÉ pendant
 * l'envoi (#7707) : le plan publié est figé au premier clic sur Publier —
 * poser un objet après coup ne rejoindrait jamais la séquence en cours.
 */
export function StudioLeadingRail({
  lang,
  page,
  locked,
  onPlace,
  onSelect,
}: {
  readonly lang: InterfaceLanguage;
  readonly page: StudioPage;
  readonly locked: boolean;
  readonly onPlace: (door: StudioDoor, file: File) => void;
  readonly onSelect: (id: string) => void;
}) {
  const selectedId = page.selected;
  return (
    <div
      data-story-studio-rail="leading"
      className="glass absolute start-2 top-1/2 z-10 flex w-14 -translate-y-1/2 flex-col items-center gap-2 overflow-y-auto rounded-3xl py-2"
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
      <StudioDoorButton
        door="sound"
        label={translate(lang, 'story.studio.sound.add')}
        glyph="microphone"
        accept="audio/*"
        onSelect={(file) => onPlace('sound', file)}
        disabled={locked}
      />
      <div role="group" aria-label={translate(lang, 'story.studio.objects.label')} className="flex w-full flex-col items-center gap-1 pt-1">
        {page.texts.map((layer, index) => (
          <StudioChip
            key={layer.id}
            label={translate(lang, 'story.studio.object.select', {
              name: translate(lang, 'story.studio.object.text', { index: String(index + 1) }),
            })}
            pressed={selectedId === layer.id}
            onPress={() => onSelect(layer.id)}
            probe={`select:${layer.id}`}
            style={{ minWidth: 44, paddingInline: 0 }}
            disabled={locked}
          >
            <span aria-hidden="true">T{index + 1}</span>
          </StudioChip>
        ))}
        {page.overlay !== null ? (
          <StudioChip
            label={translate(lang, 'story.studio.object.select', { name: translate(lang, 'story.studio.object.overlay') })}
            pressed={selectedId === 'overlay'}
            onPress={() => onSelect('overlay')}
            probe="select:overlay"
            style={{ minWidth: 44, paddingInline: 0 }}
            disabled={locked}
          >
            <LayerMark size={16} />
          </StudioChip>
        ) : null}
      </div>
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
  readonly onToggleEditor: () => void;
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
      className="absolute end-2 bottom-2 z-10 flex max-h-[calc(100%-1rem)] flex-col items-center gap-2 overflow-y-auto"
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
