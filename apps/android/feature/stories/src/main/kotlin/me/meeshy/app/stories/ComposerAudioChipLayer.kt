package me.meeshy.app.stories

import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.semantics
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.StoryAudioPlayerObject
import me.meeshy.sdk.model.composer.ComposerObjectKind

/**
 * La pastille d'un son posé sur la scène, dans le compositeur (R4 de #13863) : la MÊME que celle que le lecteur peint
 * ([StoryAudioChipLayer]), à sa place dans la pile, et qui se touche et se glisse comme un sticker. Le son d'ambiance ne
 * vient jamais ici : il ne se pose pas sur la scène.
 */
@Composable
internal fun ComposerAudioChipLayer(
    track: StoryAudioPlayerObject,
    selected: Boolean,
    canvasWidthPx: Float,
    canvasHeightPx: Float,
    onTap: () -> Unit,
    onDrag: (Float, Float) -> Unit,
    onDragEnd: () -> Unit,
) {
    val currentTap by rememberUpdatedState(onTap)
    val currentDrag by rememberUpdatedState(onDrag)
    val currentDragEnd by rememberUpdatedState(onDragEnd)
    val spoken = stringResource(R.string.story_composer_scene_voice_a11y)
    StoryAudioChipLayer(
        chip = StorySceneObjectsProjection.audioChip(track),
        chipModifier = Modifier
            .testTag(sceneObjectTag(ComposerObjectKind.AUDIO, track.id))
            .pointerInput(track.id) { detectTapGestures(onTap = { currentTap() }) }
            .pointerInput(track.id) {
                detectDragGestures { change, amount ->
                    change.consume()
                    if (canvasWidthPx > 0f && canvasHeightPx > 0f) currentDrag(amount.x / canvasWidthPx, amount.y / canvasHeightPx)
                }
            }
            .pointerInput(track.id) {
                awaitEachGesture {
                    awaitFirstDown(requireUnconsumed = false)
                    do {
                        val event = awaitPointerEvent(PointerEventPass.Final)
                    } while (event.changes.any { it.pressed })
                    currentDragEnd()
                }
            }
            .semantics {
                contentDescription = spoken
                onClick { currentTap(); true }
            }
            .sceneSelection(selected),
    )
}

/** Le repère de test d'un objet de la scène, par famille et identité. */
internal fun sceneObjectTag(kind: ComposerObjectKind, id: String): String = "scene-object:${kind.name.lowercase()}:$id"

/** Glisse la pastille du son [id] sur la scène, bornée à la scène, un cran d'annulation par geste. */
internal fun StoryComposerViewModel.onSoundMoved(id: String, dx: Float, dy: Float) =
    onSceneGesture("sound:$id") { state ->
        state.copy(
            deck = state.deck.updateSelectedSound(id) {
                it.copy(x = (it.x + dx).coerceIn(0.0, 1.0), y = (it.y + dy).coerceIn(0.0, 1.0))
            },
        )
    }
