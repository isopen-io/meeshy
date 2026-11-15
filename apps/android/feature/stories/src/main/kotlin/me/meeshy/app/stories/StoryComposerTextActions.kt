package me.meeshy.app.stories

import me.meeshy.sdk.model.scene.StoryTextBackground

/** Glisser, pincer et tourner un même objet sont UN geste : une seule entrée d'annulation. */
internal fun transformGesture(id: String) = "transform:$id"

/** Routes the text field to the selected element, else the slide caption. */
fun StoryComposerViewModel.onTextChange(text: String) = onSceneGesture("type") { StoryComposerTextReducer.typed(it, text) }

/** Adds an empty on-canvas text element and selects it (warns at the ≤5-element cap). */
fun StoryComposerViewModel.onAddTextElement() = newTextElementId().let { id ->
    onSceneReduce { StoryComposerSceneReducer.placedAtPlayhead(it) { s -> StoryComposerTextReducer.added(s, id) } }
}

fun StoryComposerViewModel.onSelectTextElement(id: String) = onSceneReduce { StoryComposerTextReducer.selected(it, id) }

fun StoryComposerViewModel.onDeselectTextElement() = onSceneReduce { StoryComposerTextReducer.deselected(it) }

/** La saisie en place cède au doigt (geste de manipulation, clavier rangé) : le texte retrouve sa position réelle. */
fun StoryComposerViewModel.onInlineEditSuspended() = onSceneReduce { StoryComposerTextReducer.suspendedForManipulation(it) }

/** Drags element [id] by normalised deltas with magnetic snapping. */
fun StoryComposerViewModel.onTextElementMoved(id: String, dx: Float, dy: Float) =
    onSceneGesture(transformGesture(id)) { StoryComposerTextReducer.moved(it, id, dx, dy) }

fun StoryComposerViewModel.onTextElementDragEnd() = onSceneReduce { StoryComposerTextReducer.dragEnded(it) }

fun StoryComposerViewModel.onRemoveTextElement(id: String) = onSceneReduce { StoryComposerTextReducer.removed(it, id) }

fun StoryComposerViewModel.onTextElementStyle(id: String, style: StoryTextStyle) = onSceneReduce { StoryComposerTextReducer.styled(it, id, style) }

fun StoryComposerViewModel.onTextElementColor(id: String, color: String) = onSceneReduce { StoryComposerTextReducer.colored(it, id, color) }

fun StoryComposerViewModel.onTextElementAlign(id: String, align: StoryTextAlign) = onSceneReduce { StoryComposerTextReducer.aligned(it, id, align) }

fun StoryComposerViewModel.onTextElementBackground(id: String, background: StoryTextBackground) =
    onSceneReduce { StoryComposerTextReducer.backed(it, id, background) }

fun StoryComposerViewModel.onTextElementCycleSize(id: String) = onSceneReduce { StoryComposerTextReducer.sizeCycled(it, id) }

fun StoryComposerViewModel.onTextElementCycleOutline(id: String) = onSceneReduce { StoryComposerTextReducer.outlineCycled(it, id) }

fun StoryComposerViewModel.onTextElementCycleFadeIn(id: String) = onSceneReduce { StoryComposerTextReducer.fadeInCycled(it, id) }

fun StoryComposerViewModel.onTextElementCycleFadeOut(id: String) = onSceneReduce { StoryComposerTextReducer.fadeOutCycled(it, id) }

fun StoryComposerViewModel.onTextElementCycleStart(id: String) = onSceneReduce { StoryComposerTextReducer.startCycled(it, id) }

fun StoryComposerViewModel.onTextElementCycleDuration(id: String) = onSceneReduce { StoryComposerTextReducer.durationCycled(it, id) }

fun StoryComposerViewModel.onTextElementTransform(id: String, scaleBy: Float, rotateByDeg: Float) =
    onSceneGesture(transformGesture(id)) { StoryComposerTextReducer.transformed(it, id, scaleBy, rotateByDeg) }

fun StoryComposerViewModel.onDuplicateTextElement(id: String) {
    val newId = newTextElementId()
    onSceneReduce { StoryComposerTextReducer.duplicated(it, id, newId) }
}
