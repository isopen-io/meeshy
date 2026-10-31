package me.meeshy.app.stories

import me.meeshy.sdk.model.composer.ComposerObjectKind
import me.meeshy.sdk.model.composer.ComposerSelectionAction
import me.meeshy.sdk.model.composer.SceneObjectMenu.Action

/** Applies a controller of the selected object — its bar, its sheet — to the object it targets; an action the law does not serve does nothing. */
internal fun StoryComposerViewModel.onObjectController(ref: SceneObjectRef, action: Action) {
    if (action == Action.DUPLICATE && (ref.kind == ComposerObjectKind.MEDIA || ref.kind == ComposerObjectKind.AUDIO || ref.kind == ComposerObjectKind.PLACE)) {
        return onDuplicateSceneObject(ref)
    }
    when (ref.kind) {
        ComposerObjectKind.MEDIA -> return mediaController(ref.id, action)
        ComposerObjectKind.AUDIO -> return if (action == Action.DELETE) onRemoveSound(ref.id) else Unit
        ComposerObjectKind.PLACE -> return if (action == Action.DELETE) onRemovePlace(ref.id) else Unit
        else -> Unit
    }
    val text = ref.kind == ComposerObjectKind.TEXT
    when (action) {
        Action.DUPLICATE -> if (text) onDuplicateTextElement(ref.id) else onDuplicateSticker(ref.id)
        Action.DELETE -> if (text) onRemoveTextElement(ref.id) else onRemoveSticker(ref.id)
        else -> Unit
    }
}

/** A text touched on the scene is framed; touched again, written (#13836). */
internal fun StoryComposerViewModel.onTapTextElement(id: String) = onSceneReduce { StoryComposerTextReducer.tapped(it, id) }

/** Touching the empty scene releases whatever is selected, of any family, and gives the tools back (#13836). */
internal fun StoryComposerViewModel.onSceneBackgroundTap() = onSceneReduce(StoryComposerSelectionReducer::cleared)

/**
 * Une action de la barre de l'élément sélectionné (#13836) : Modifier écrit le texte, ouvre la feuille d'un média ou d'un
 * son, l'échange d'un sticker ou le lieu d'une pastille ; Temps ouvre sa feuille ; Dupliquer et Retirer passent par les contrôleurs de l'objet.
 */
internal fun StoryComposerViewModel.onSelectionAction(
    ref: SceneObjectRef,
    action: ComposerSelectionAction,
    openSheet: (StoryComposerSheet) -> Unit,
) = when (action) {
    ComposerSelectionAction.EDIT -> when (ref.kind) {
        ComposerObjectKind.TEXT -> onSelectTextElement(ref.id)
        ComposerObjectKind.STICKER -> openSheet(StoryComposerSheet.STICKER_SWAP)
        ComposerObjectKind.PLACE -> openSheet(StoryComposerSheet.PLACE_REPOINT)
        else -> openSheet(StoryComposerSheet.OBJECT_EDIT)
    }
    ComposerSelectionAction.TIME -> openSheet(StoryComposerSheet.OBJECT_TIME)
    ComposerSelectionAction.DUPLICATE -> onObjectController(ref, Action.DUPLICATE)
    ComposerSelectionAction.REMOVE -> onObjectController(ref, Action.DELETE)
}

/**
 * Un média fait fond ou le remplace (la désignation est exclusive et porte sur son FICHIER ; seul l'objet choisi quitte la
 * scène, ses copies y restent, #13905), ou se retire — sa sélection
 * tombe avec lui. Retirer un objet dont le fichier est encore posé ailleurs (sa source ou sa copie, #13902) ne retire que
 * lui : le fichier reste à la slide ; retirer le dernier retire le média.
 */
private fun StoryComposerViewModel.mediaController(id: String, action: Action) {
    val slide = state.value.deck.selectedSlide
    val file = slide.mediaFileOf(id)
    when (action) {
        Action.SET_AS_BACKGROUND, Action.REPLACE_BACKGROUND ->
            onSceneReduce { StoryComposerBackgroundReducer.backgroundMediaToggled(it, file, objectId = id) }
        Action.DELETE ->
            if (slide.placedMedia.any { it.id != id && it.mediaId == file }) onSceneReduce { StoryComposerPlacedMediaReducer.objectRemoved(it, id) }
            else onRemoveMedia(file)
        else -> Unit
    }
}

/** Dupliquer un média posé, un lieu ou une pastille de son (#13902) : la copie, neuve, devient la sélection ; un cran d'historique. */
private fun StoryComposerViewModel.onDuplicateSceneObject(ref: SceneObjectRef) {
    val newId = java.util.UUID.randomUUID().toString()
    onSceneReduce { StoryComposerObjectCopyReducer.duplicated(it, ref, newId) }
}

/**
 * « Éditer le fond » de la vignette d'une slide (iOS #5041) : la slide devient la courante AVANT que l'éditeur de son fond
 * s'ouvre — l'éditeur lit la slide sélectionnée, ouvert sur une autre il chercherait un objet introuvable. Ici, l'éditeur
 * du fond est la sélection du média de fond, dont les sections se rangent dans la colonne droite.
 */
internal fun StoryComposerViewModel.onEditSlideBackground(slideId: String) = onSceneReduce { state ->
    val onSlide = state.withDeckTransform { it.select(slideId) }
    val background = onSlide.deck.selectedSlideBackgroundMediaId ?: return@onSceneReduce onSlide
    StoryComposerSelectionReducer.mediaSelected(onSlide, background)
}
