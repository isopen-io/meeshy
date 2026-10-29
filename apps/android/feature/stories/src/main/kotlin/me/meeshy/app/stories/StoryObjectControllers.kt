package me.meeshy.app.stories

import me.meeshy.sdk.model.composer.ComposerObjectKind
import me.meeshy.sdk.model.composer.SceneObjectMenu.Action

/** Applies a controller of the plateau's trailing column to the object it targets; an action the law does not serve does nothing. */
internal fun StoryComposerViewModel.onObjectController(ref: SceneObjectRef, action: Action) {
    when (ref.kind) {
        ComposerObjectKind.MEDIA -> return mediaController(ref.id, action)
        ComposerObjectKind.AUDIO -> return if (action == Action.DELETE) onRemoveSound(ref.id) else Unit
        else -> Unit
    }
    val text = ref.kind == ComposerObjectKind.TEXT
    when (action) {
        Action.DUPLICATE -> if (text) onDuplicateTextElement(ref.id) else onDuplicateSticker(ref.id)
        Action.DELETE -> if (text) onRemoveTextElement(ref.id) else onRemoveSticker(ref.id)
        Action.BRING_FORWARD -> reorder(ref, StoryZOrder.FORWARD)
        Action.SEND_BACKWARD -> reorder(ref, StoryZOrder.BACKWARD)
        else -> Unit
    }
}

private fun StoryComposerViewModel.reorder(ref: SceneObjectRef, op: StoryZOrder) =
    if (ref.kind == ComposerObjectKind.TEXT) onReorderTextElement(ref.id, op)
    else onSceneReduce { StoryComposerSceneReducer.stickerReordered(it, ref.id, op) }

/** Un média fait fond ou le remplace (la désignation est exclusive), ou se retire — sa sélection tombe avec lui. */
private fun StoryComposerViewModel.mediaController(id: String, action: Action) = when (action) {
    Action.SET_AS_BACKGROUND, Action.REPLACE_BACKGROUND -> onToggleSlideBackgroundMedia(id)
    Action.DELETE -> onRemoveMedia(id)
    else -> Unit
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
