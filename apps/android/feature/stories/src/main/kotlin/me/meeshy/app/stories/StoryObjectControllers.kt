package me.meeshy.app.stories

import me.meeshy.sdk.model.composer.ComposerObjectKind
import me.meeshy.sdk.model.composer.SceneObjectMenu.Action

/** Applies a controller of the plateau's trailing column to the object it targets; an action the law does not serve does nothing. */
internal fun StoryComposerViewModel.onObjectController(ref: SceneObjectRef, action: Action) {
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
