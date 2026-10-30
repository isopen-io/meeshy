package me.meeshy.app.stories

import androidx.compose.runtime.Immutable
import me.meeshy.sdk.model.StoryEffects
import me.meeshy.sdk.model.composer.ComposerObjectChips
import me.meeshy.sdk.model.composer.ComposerObjectKind
import me.meeshy.sdk.model.composer.ComposerSelectionAction
import me.meeshy.sdk.model.composer.ComposerSelectionActions
import me.meeshy.sdk.model.composer.SceneObjectMenu
import me.meeshy.sdk.model.composer.timeline.Plan2DLayout
import me.meeshy.sdk.model.composer.timeline.Plan2DTrack

/** Un objet de la scène : sa famille et son identité — la SÉLECTION est unique, un seul à la fois. */
@Immutable
data class SceneObjectRef(val kind: ComposerObjectKind, val id: String)

/** Le menu d'appui long résolu : l'objet touché et les seules actions qu'il accepte. */
@Immutable
data class SceneObjectContextMenu(val ref: SceneObjectRef, val actions: List<SceneObjectMenu.Action>)

/**
 * La barre d'actions de l'objet sélectionné (#13836) : ses actions libellées, ce que son Ordre ouvre, et ce que la feuille
 * de son Modifier range en plus de ses sections (faire le fond, le remplacer).
 */
@Immutable
data class SceneSelectionBar(
    val ref: SceneObjectRef,
    val actions: List<ComposerSelectionAction>,
    val orderChoices: List<SceneObjectMenu.Action>,
    val sheetActions: List<SceneObjectMenu.Action>,
)

/** L'inspecteur : une rangée de jetons au-dessus du socle, qui change de contenu selon la famille. */
@Immutable
data class SceneInspector(val ref: SceneObjectRef, val chips: List<ComposerObjectChips.Chip>)

/** L'objet sélectionné sur la scène — texte ou sticker, jamais les deux. */
val StoryComposerUiState.selectedSceneObject: SceneObjectRef?
    get() = selectedTextElement?.let { SceneObjectRef(ComposerObjectKind.TEXT, it.id) }
        ?: selectedSticker?.let { SceneObjectRef(ComposerObjectKind.STICKER, it.id) }
        ?: selectedMedia?.let { SceneObjectRef(ComposerObjectKind.MEDIA, it) }
        ?: selectedSound?.let { SceneObjectRef(ComposerObjectKind.AUDIO, it.id) }
        ?: selectedPlace?.let { SceneObjectRef(ComposerObjectKind.PLACE, it.id) }

val StoryComposerUiState.sceneContextMenu: SceneObjectContextMenu?
    get() {
        val slide = deck.selectedSlide
        elementMenuId?.takeIf { id -> slide.elements.any { it.id == id } }?.let { id ->
            return SceneObjectContextMenu(
                SceneObjectRef(ComposerObjectKind.TEXT, id),
                SceneObjectMenu.offered(textSubject()),
            )
        }
        return stickerMenuId?.takeIf { id -> slide.stickers.any { it.id == id } }?.let { id ->
            SceneObjectContextMenu(
                SceneObjectRef(ComposerObjectKind.STICKER, id),
                SceneObjectMenu.offered(stickerSubject()),
            )
        }
    }

val StoryComposerUiState.sceneInspector: SceneInspector?
    get() {
        selectedTextElement?.let { e ->
            return SceneInspector(
                SceneObjectRef(ComposerObjectKind.TEXT, e.id),
                ComposerObjectChips.textChips(
                    textStyle = e.style.wire,
                    fontSize = e.size.designSize.toDouble(),
                    textAlign = e.align.wire,
                    start = e.timing.startSeconds.toDouble(),
                    duration = e.timing.durationSeconds.toDouble(),
                ),
            )
        }
        return selectedSticker?.let { s ->
            SceneInspector(
                SceneObjectRef(ComposerObjectKind.STICKER, s.id),
                ComposerObjectChips.stickerChips(
                    scale = s.scale.toDouble(),
                    rotation = s.rotationDeg.toDouble(),
                    start = s.timing.startSeconds.toDouble(),
                    duration = s.timing.durationSeconds.toDouble(),
                ),
            )
        }
    }

/** Les pistes du plan 2D de la slide sélectionnée, lues par la loi pure [Plan2DLayout]. */
val StoryComposerUiState.sceneTracks: List<Plan2DTrack>
    get() {
        val slide = deck.selectedSlide
        val effects = StoryEffects(
            textObjects = slide.elements.map { it.toTextObject("") },
            stickerObjects = slide.stickers.map { it.toSticker() }.takeIf { it.isNotEmpty() },
            drawingStrokes = slide.strokes.takeIf { it.isNotEmpty() },
            audioPlayerObjects = slide.audio.takeIf { it.isNotEmpty() },
        )
        return Plan2DLayout.tracks(effects, selectedSlideDurationSeconds)
    }

/** Les pistes dont la fenêtre se règle à la main : un texte, un sticker — le son et le fond se lisent seulement. */
val StoryComposerUiState.sceneEditableTrackIds: Set<String>
    get() = deck.selectedSlide.let { slide -> slide.elements.map { it.id } + slide.stickers.map { it.id } }.toSet()

private fun StoryComposerUiState.textSubject() = SceneObjectMenu.Subject(
    sharesPlaneWithAnother = deck.selectedSlide.elements.size > 1,
    hasEditor = true,
    canDuplicate = deck.selectedCanAddTextElement,
)

private fun StoryComposerUiState.stickerSubject() = SceneObjectMenu.Subject(
    sharesPlaneWithAnother = deck.selectedSlide.stickers.size > 1,
    canDuplicate = deck.selectedCanAddSticker,
)

/** Un média se fait fond de la scène (ou le REMPLACE) et se retire ; il ne se duplique ni ne s'empile. */
private val mediaActions = listOf(
    SceneObjectMenu.Action.SET_AS_BACKGROUND, SceneObjectMenu.Action.REPLACE_BACKGROUND, SceneObjectMenu.Action.DELETE,
)

private fun StoryComposerUiState.mediaSubject(id: String) = SceneObjectMenu.Subject(
    isBackground = deck.selectedSlideBackgroundMediaId == id,
    canBecomeBackground = true,
    sceneHasBackground = deck.selectedSlideBackgroundMediaId != null,
    canDuplicate = false,
)

private val controllerActions = listOf(
    SceneObjectMenu.Action.DUPLICATE, SceneObjectMenu.Action.BRING_FORWARD,
    SceneObjectMenu.Action.SEND_BACKWARD, SceneObjectMenu.Action.DELETE,
)

/**
 * Les contrôleurs de l'objet SÉLECTIONNÉ (empilement, dupliquer, supprimer) : ce que la loi [SceneObjectMenu] lui sert,
 * restreint aux actions de dimension — éditer et rogner ont leurs propres chemins. Ils vivent dans la colonne de droite
 * du plateau (iOS `ComposerTrailingRail`), jamais sur la scène.
 */
val StoryComposerUiState.selectedObjectControllers: SceneObjectContextMenu?
    get() {
        val ref = selectedSceneObject ?: return null
        val (subject, served) = when (ref.kind) {
            ComposerObjectKind.TEXT -> textSubject() to controllerActions
            ComposerObjectKind.MEDIA -> mediaSubject(ref.id) to mediaActions
            ComposerObjectKind.AUDIO, ComposerObjectKind.PLACE ->
                SceneObjectMenu.Subject(canDuplicate = false) to listOf(SceneObjectMenu.Action.DELETE)
            else -> stickerSubject() to controllerActions
        }
        return SceneObjectContextMenu(ref, SceneObjectMenu.offered(subject).filter { it in served })
    }

/**
 * La barre d'actions de l'objet SÉLECTIONNÉ — ni écrit, ni sous le pinceau (#13836). Elle part de ce que la loi
 * [SceneObjectMenu] sert à l'objet : le MÊME menu que son appui long pour un texte ou un sticker, les contrôleurs d'un
 * média ou d'un son ; chaque famille y câble son Modifier — écrire le texte, la feuille du média ou du son, l'échange du
 * sticker. Le Temps est celui des objets qui ont une fenêtre propre, un texte ou un sticker, dans une scène animée.
 */
val StoryComposerUiState.selectionBar: SceneSelectionBar?
    get() {
        if (isEditingTextElement || isDrawingActive) return null
        val controllers = selectedObjectControllers ?: return null
        val offered = when (controllers.ref.kind) {
            ComposerObjectKind.TEXT -> SceneObjectMenu.offered(textSubject())
            ComposerObjectKind.STICKER -> SceneObjectMenu.offered(stickerSubject())
            else -> controllers.actions
        }
        val timed = controllers.ref.kind == ComposerObjectKind.TEXT || controllers.ref.kind == ComposerObjectKind.STICKER
        return SceneSelectionBar(
            ref = controllers.ref,
            actions = ComposerSelectionActions.served(
                ComposerSelectionActions.Input(
                    offered = offered,
                    editable = controllers.ref.kind != ComposerObjectKind.PLACE,
                    timed = timed,
                    sceneAnimated = sceneIsAnimated,
                ),
            ),
            orderChoices = ComposerSelectionActions.orderChoices(offered),
            sheetActions = ComposerSelectionActions.editSheetActions(offered),
        )
    }
