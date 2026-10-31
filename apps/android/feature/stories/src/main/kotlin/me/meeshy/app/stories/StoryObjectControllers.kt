package me.meeshy.app.stories

import me.meeshy.sdk.model.composer.ComposerObjectKind
import me.meeshy.sdk.model.composer.ComposerSelectionAction
import me.meeshy.sdk.model.composer.SceneObjectMenu.Action

/** Applies a controller of the selected object — its bar, its sheet — to the object it targets; an action the law does not serve does nothing. */
internal fun StoryComposerViewModel.onObjectController(ref: SceneObjectRef, action: Action) {
    orderOf(action)?.let { return reorder(ref, it) }
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

/** Le geste de pile qu'une action de l'Ordre porte, `null` pour toute autre action. */
private fun orderOf(action: Action): StoryZOrder? = when (action) {
    Action.BRING_TO_FRONT -> StoryZOrder.TO_FRONT
    Action.BRING_FORWARD -> StoryZOrder.FORWARD
    Action.SEND_BACKWARD -> StoryZOrder.BACKWARD
    Action.SEND_TO_BACK -> StoryZOrder.TO_BACK
    else -> null
}

/** A text touched on the scene is framed; touched again, written (#13836). */
internal fun StoryComposerViewModel.onTapTextElement(id: String) = onSceneReduce { StoryComposerTextReducer.tapped(it, id) }

/** Touching the empty scene releases whatever is selected, of any family, and gives the tools back (#13836). */
internal fun StoryComposerViewModel.onSceneBackgroundTap() = onSceneReduce(StoryComposerSelectionReducer::cleared)

/**
 * Une action de la barre de l'élément sélectionné (#13836) : Modifier écrit le texte, ouvre la feuille d'un média ou d'un
 * son, ou l'échange d'un sticker ; Temps ouvre sa feuille ; Dupliquer et Retirer passent par les contrôleurs de l'objet.
 * L'Ordre ouvre son propre menu, dont chaque choix arrive ici par [onObjectController].
 */
internal fun StoryComposerViewModel.onSelectionAction(
    ref: SceneObjectRef,
    action: ComposerSelectionAction,
    openSheet: (StoryComposerSheet) -> Unit,
) = when (action) {
    ComposerSelectionAction.EDIT -> when (ref.kind) {
        ComposerObjectKind.TEXT -> onSelectTextElement(ref.id)
        ComposerObjectKind.STICKER -> openSheet(StoryComposerSheet.STICKER_SWAP)
        else -> openSheet(StoryComposerSheet.OBJECT_EDIT)
    }
    ComposerSelectionAction.TIME -> openSheet(StoryComposerSheet.OBJECT_TIME)
    ComposerSelectionAction.DUPLICATE -> onObjectController(ref, Action.DUPLICATE)
    ComposerSelectionAction.REMOVE -> onObjectController(ref, Action.DELETE)
    ComposerSelectionAction.ORDER -> Unit
}

private fun StoryComposerViewModel.reorder(ref: SceneObjectRef, op: StoryZOrder) =
    if (ref.kind == ComposerObjectKind.TEXT) onReorderTextElement(ref.id, op)
    else onSceneReduce { StoryComposerSceneReducer.restacked(it, ref, op) }

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
