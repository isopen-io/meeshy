package me.meeshy.app.stories

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.semantics
import me.meeshy.sdk.model.StoryAudioPlayerObject
import me.meeshy.sdk.model.composer.ComposerObjectKind
import me.meeshy.sdk.model.scene.SceneAudioChipPose

/**
 * La pastille d'un son posé sur la scène, dans le compositeur (R4 de #13863) : la MÊME que celle que le lecteur peint
 * ([StoryAudioChipLayer]), à sa place dans la pile. Elle se touche, se glisse, se pince et se tourne par le pipeline de
 * tout objet de la scène ([sceneObjectGestures], #16293), toute son échelle portée par le calque comme un sticker ; son
 * chrono lit la tête du lecteur vivant du son ([clock]). Le son d'ambiance ne vient jamais ici : il ne se pose pas sur la
 * scène.
 */
@Composable
internal fun ComposerAudioChipLayer(
    track: StoryAudioPlayerObject,
    selected: Boolean,
    canvasWidthPx: Float,
    canvasHeightPx: Float,
    onTap: () -> Unit,
    onDrag: (Float, Float) -> Unit,
    onTransform: (Float, Float) -> Unit,
    onDragEnd: () -> Unit,
    clock: AudioChipClock = AudioChipClock.Still,
) {
    val currentTap by rememberUpdatedState(onTap)
    val currentDrag by rememberUpdatedState(onDrag)
    val currentTransform by rememberUpdatedState(onTransform)
    val currentDragEnd by rememberUpdatedState(onDragEnd)
    val currentPose by rememberUpdatedState(
        SceneObjectPose(SceneAudioChipPose.scale(track).toFloat(), SceneAudioChipPose.rotation(track).toFloat()),
    )
    StoryAudioChipLayer(
        chip = StorySceneObjectsProjection.audioChip(track),
        clock = clock,
        layoutScaled = false,
        chipModifier = Modifier
            .testTag(sceneObjectTag(ComposerObjectKind.AUDIO, track.id))
            .sceneObjectGestures(
                key = track.id,
                pose = { currentPose },
                onTap = { currentTap() },
                onLongPress = null,
                onMove = { pan, zoom, rotation ->
                    if (canvasWidthPx > 0f && canvasHeightPx > 0f) currentDrag(pan.x / canvasWidthPx, pan.y / canvasHeightPx)
                    currentTransform(zoom, rotation)
                },
                onEnd = { currentDragEnd() },
            )
            .semantics { onClick { currentTap(); true } }
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

/** Pince et tourne la pastille du son [id] comme tout objet de la scène (#16293), dans le même cran que son glissé. */
internal fun StoryComposerViewModel.onSoundTransformed(id: String, scaleBy: Float, rotateByDeg: Float) =
    onSceneGesture("sound:$id") { state ->
        state.copy(deck = state.deck.updateSelectedSound(id) { SceneAudioChipPose.transformed(it, scaleBy, rotateByDeg) })
    }
