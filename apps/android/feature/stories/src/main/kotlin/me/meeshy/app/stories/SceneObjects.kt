package me.meeshy.app.stories

import androidx.compose.runtime.Immutable
import me.meeshy.sdk.model.StoryEffects
import me.meeshy.sdk.model.StoryMediaObject
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
 * La barre d'actions de l'objet sélectionné (#13836) : ses actions libellées, et ce que la feuille de son Modifier range en
 * plus de ses sections (faire le fond, le remplacer). Aucun Ordre : toucher l'objet l'a déjà fait passer devant (#13917).
 */
@Immutable
data class SceneSelectionBar(
    val ref: SceneObjectRef,
    val actions: List<ComposerSelectionAction>,
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
                SceneObjectMenu.offered(textSubject(id)),
            )
        }
        return stickerMenuId?.takeIf { id -> slide.stickers.any { it.id == id } }?.let { id ->
            SceneObjectContextMenu(
                SceneObjectRef(ComposerObjectKind.STICKER, id),
                SceneObjectMenu.offered(stickerSubject(id)),
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
            mediaObjects = (slide.placedMedia.map { it.toFriseObject(placedMediaIsVideo(it.id)) } + listOfNotNull(friseBackground()))
                .takeIf { it.isNotEmpty() },
            drawingStrokes = slide.strokes.takeIf { it.isNotEmpty() },
            audioPlayerObjects = slide.audio.takeIf { it.isNotEmpty() },
            // Le fond a sa piste, en lecture seule (#14281, iOS `Plan2DLayout.tracks(from: currentEffects)`).
            background = slide.background?.serialized()?.takeIf { slide.backgroundMediaId == null },
        )
        return Plan2DLayout.tracks(effects, selectedSlideDurationSeconds, slide.places)
    }

/** Le média de FOND tel que la frise le lit (#14281) : au plan fond, verrouillé, il dure la diapo. */
private fun StoryComposerUiState.friseBackground(): StoryMediaObject? {
    val id = deck.selectedSlide.backgroundMediaId ?: return null
    val video = attachments.firstOrNull { it.id == id }?.mimeType?.startsWith("video", ignoreCase = true) == true
    return StoryMediaObject(id = id, postMediaId = id, mediaType = if (video) "video" else "image", isBackground = true)
}

/** Un média posé tel que la frise le lit : sa fenêtre d'apparition, jamais la longueur que joue sa source (#13904). */
private fun StoryPlacedMedia.toFriseObject(video: Boolean) = StoryMediaObject(
    id = id,
    postMediaId = mediaId,
    mediaType = if (video) "video" else "image",
    zIndex = zIndex,
    startTime = timing.startSeconds.toDouble().takeIf { timing.isActive },
    duration = timing.durationSeconds.toDouble().takeIf { timing.isTimed },
    keyframes = keyframes.takeIf { it.isNotEmpty() },
)

/**
 * Les pistes dont la fenêtre se règle à la main : tout objet POSÉ — texte, média, sticker, lieu, pastille de son
 * (#13904, iOS `sceneFriseTracks`). Le fond et le son d'ambiance se lisent seulement : ils durent la slide.
 */
val StoryComposerUiState.sceneEditableTrackIds: Set<String>
    get() = StorySceneStack.order(deck.selectedSlide).map { it.id }.toSet()

private fun StoryComposerUiState.textSubject(id: String) = SceneObjectMenu.Subject(
    hasEditor = true,
    canDuplicate = deck.selectedCanAddTextElement,
)

private fun StoryComposerUiState.stickerSubject(id: String) = SceneObjectMenu.Subject(
    canDuplicate = deck.selectedCanAddSticker,
)

/**
 * Un média se fait fond de la scène (ou le REMPLACE), et se retire ; POSÉ, il se duplique (la copie nomme le même fichier,
 * #13902). Le fond ne se duplique pas : il deviendrait un second fond.
 */
private val mediaActions = listOf(
    SceneObjectMenu.Action.DUPLICATE, SceneObjectMenu.Action.SET_AS_BACKGROUND, SceneObjectMenu.Action.REPLACE_BACKGROUND, SceneObjectMenu.Action.DELETE,
)

private fun StoryComposerUiState.mediaSubject(id: String) = SceneObjectMenu.Subject(
    isBackground = deck.selectedSlideBackgroundMediaId == id,
    canBecomeBackground = true,
    sceneHasBackground = deck.selectedSlideBackgroundMediaId != null,
    canDuplicate = canDuplicate(SceneObjectRef(ComposerObjectKind.MEDIA, id)),
)

private val controllerActions = listOf(SceneObjectMenu.Action.DUPLICATE, SceneObjectMenu.Action.DELETE)

/** Un lieu, une pastille de son : ils se dupliquent (#13902) et se retirent ; le son d'ambiance ne se duplique pas. */
private val pinActions = controllerActions

/**
 * Les contrôleurs de l'objet SÉLECTIONNÉ (dupliquer, supprimer) : ce que la loi [SceneObjectMenu] lui sert,
 * restreint aux actions de dimension — éditer et rogner ont leurs propres chemins. Ils vivent dans la colonne de droite
 * du plateau (iOS `ComposerTrailingRail`), jamais sur la scène.
 */
val StoryComposerUiState.selectedObjectControllers: SceneObjectContextMenu?
    get() {
        val ref = selectedSceneObject ?: return null
        val (subject, served) = when (ref.kind) {
            ComposerObjectKind.TEXT -> textSubject(ref.id) to controllerActions
            ComposerObjectKind.MEDIA -> mediaSubject(ref.id) to mediaActions
            ComposerObjectKind.AUDIO, ComposerObjectKind.PLACE ->
                SceneObjectMenu.Subject(canDuplicate = canDuplicate(ref)) to pinActions
            else -> stickerSubject(ref.id) to controllerActions
        }
        return SceneObjectContextMenu(ref, SceneObjectMenu.offered(subject).filter { it in served })
    }

/**
 * La barre d'actions de l'objet SÉLECTIONNÉ — ni écrit, ni sous le pinceau (#13836). Elle part de ce que la loi
 * [SceneObjectMenu] sert à l'objet : le MÊME menu que son appui long pour un texte ou un sticker, les contrôleurs d'un
 * média, d'un lieu ou d'un son ; le texte, le sticker et le lieu y câblent leur Modifier — écrire le texte, l'échange du
 * sticker, le lieu d'une pastille ; une image, une vidéo ou un son posés n'en ont pas, leurs outils sont à plat dans le rail (#14047). Le Temps est celui de tout objet POSÉ sur la scène (#13902, comme iOS) — texte, sticker, média
 * posé, lieu, pastille de son —, la scène animée ou non ; un fond dure la slide entière.
 */
/** Les familles dont les outils sont à plat dans le rail (#14047) : leur barre n'a pas de Modifier. */
private val FlatToolKinds = setOf(ComposerObjectKind.MEDIA, ComposerObjectKind.AUDIO)

val StoryComposerUiState.selectionBar: SceneSelectionBar?
    get() {
        if (isEditingTextElement || isDrawingActive) return null
        val controllers = selectedObjectControllers ?: return null
        val offered = when (controllers.ref.kind) {
            ComposerObjectKind.TEXT -> SceneObjectMenu.offered(textSubject(controllers.ref.id))
            ComposerObjectKind.STICKER -> SceneObjectMenu.offered(stickerSubject(controllers.ref.id))
            else -> controllers.actions
        }
        return SceneSelectionBar(
            ref = controllers.ref,
            actions = ComposerSelectionActions.served(
                ComposerSelectionActions.Input(
                    offered = offered,
                    editable = true,
                    timed = controllers.ref in StorySceneStack.order(deck.selectedSlide),
                ),
            ).filterNot { it == ComposerSelectionAction.EDIT && controllers.ref.kind in FlatToolKinds },
            sheetActions = ComposerSelectionActions.editSheetActions(offered),
        )
    }
