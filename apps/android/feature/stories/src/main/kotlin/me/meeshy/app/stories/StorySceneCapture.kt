package me.meeshy.app.stories

import android.content.Context
import android.net.Uri
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shadow
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import me.meeshy.feature.stories.R
import me.meeshy.sdk.media.MediaIntake
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.model.composer.ComposerFormat
import me.meeshy.sdk.model.composer.ComposerOpening
import me.meeshy.sdk.model.composer.capture.CameraResult
import me.meeshy.sdk.model.composer.capture.SceneHoldRelay
import me.meeshy.sdk.model.composer.capture.SceneQuickCapture
import me.meeshy.ui.component.capture.CaptureViewfinder
import me.meeshy.ui.theme.MeeshySpacing
import java.io.File

/** Rien n'est posé sur la diapo : ni média, ni texte, ni sticker, ni trait, ni lieu, ni son. Une couleur de fond ne compte pas. */
internal val StorySlide.isBlankScene: Boolean
    get() = mediaIds.isEmpty() && backgroundMediaId == null && elements.isEmpty() && stickers.isEmpty() &&
        strokes.isEmpty() && places.isEmpty() && audio.isEmpty() && placedMedia.isEmpty()

/**
 * **Le viseur de la scène vide** (#13849, iOS `ComposerSceneCaptureGesture`) : un toucher sur la scène vide l'arme DANS la
 * scène — c'est le second toucher qui prend la photo —, un appui long l'arme et filme tant que le doigt tient ([hold] :
 * relâché, la prise se clôt ; glissé jusqu'au cadenas, elle continue sans lui). Armé, il est seul sur la scène ; sa
 * croix la rend. Ce qu'il prend se pose sur la scène par le même chemin que la photothèque. [offer] `null` : la porte ne
 * sert aucun viseur, la scène ne dit rien et un toucher n'arme rien.
 */
@Stable
internal class StorySceneCapture(
    val offer: SceneQuickCapture.Offer?,
    private val onCaptured: (CameraResult) -> Unit,
    private val onCapturedBackground: ((CameraResult, String) -> Unit)? = null,
    val viewfinder: @Composable (StorySceneCapture, Modifier) -> Unit = { scene, modifier -> StorySceneViewfinder(scene, modifier) },
) {
    var armed: Boolean by mutableStateOf(false)
        private set
    var filmsOnArm: Boolean by mutableStateOf(false)
        private set

    /** Le doigt qui a armé en tenant la scène, suivi jusqu'à sa levée et remis au viseur quand la caméra est liée. */
    val hold: SceneHoldRelay = SceneHoldRelay()

    /** Le fond que la prise remplacera (« Fond › Remplacer › Prendre une photo », #13973), `null` : une prise ordinaire. */
    var replacingBackground: String? by mutableStateOf(null)
        private set

    fun arm(films: Boolean = false, replacingBackground: String? = null) {
        val served = offer ?: return
        this.replacingBackground = replacingBackground
        filmsOnArm = films && SceneQuickCapture.filmsOnHold(served)
        if (filmsOnArm) hold.began() else hold.clear()
        armed = true
    }

    fun disarm() {
        armed = false
        replacingBackground = null
        filmsOnArm = false
        hold.clear()
    }

    fun deliver(result: CameraResult) {
        val replacing = replacingBackground
        disarm()
        val background = onCapturedBackground
        if (replacing != null && background != null) background(result, replacing) else onCaptured(result)
    }

    /** Le geste et sa ligne n'existent qu'au repos : scène vide, rien de sélectionné, aucun pinceau, texte ni panneau ouvert. */
    fun offeredOn(state: StoryComposerUiState, somethingOpen: Boolean): Boolean = SceneQuickCapture.offers(
        sceneIsBlank = state.deck.selectedSlide.isBlankScene,
        armed = armed,
        toolIsOpen = somethingOpen || state.isDrawingActive || state.isEditingTextElement ||
            state.band.activeTool != null || state.selectedSceneObject != null,
        offer = offer,
    )
}

/** Le viseur CameraX, posé dans la scène : photo au toucher, vidéo au maintien, cadenas, zoom, flash, objectif, segments. */
@Composable
private fun StorySceneViewfinder(scene: StorySceneCapture, modifier: Modifier) {
    val offer = scene.offer ?: return
    CaptureViewfinder(
        onDisarm = scene::disarm,
        onDeliver = scene::deliver,
        modifier = modifier,
        allowsPhoto = offer.allowsPhoto,
        allowsVideo = offer.allowsVideo,
        hold = scene.hold,
    )
}

/** Le viseur de la story ouverte par [opening] ; ce qu'il prend part au view model comme un média de la photothèque. */
@Composable
internal fun rememberStorySceneCapture(opening: ComposerOpening, viewModel: StoryComposerViewModel): StorySceneCapture {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    return remember(opening, viewModel) {
        fun captured(result: CameraResult, replacing: String?) {
            scope.launch {
                val item = withContext(NonCancellable + Dispatchers.IO) { context.capturedUploadItem(result) }
                if (item != null) viewModel.onMediaPicked(listOf(item), asBackground = replacing != null, replacing = replacing)
            }
        }
        StorySceneCapture(
            offer = SceneQuickCapture.offer(ComposerFormat.STORY, opening),
            onCaptured = { result -> captured(result, replacing = null) },
            onCapturedBackground = { result, replacing -> captured(result, replacing) },
        )
    }
}

/** La prise du viseur, copiée dans le cache d'envoi avec son type ; le fichier de la caméra part dans tous les cas. */
private fun Context.capturedUploadItem(result: CameraResult): MediaUploadItem? {
    val (uri, mime) = when (result) {
        is CameraResult.Photo -> result.uri to "image/jpeg"
        is CameraResult.Video -> result.uri to "video/mp4"
    }
    val file = Uri.parse(uri).path?.let(::File) ?: return null
    return try {
        runCatching { file.inputStream().use { MediaIntake.copy(it, cacheDir, file.name, mime) } }.getOrNull()
    } finally {
        runCatching { file.delete() }
    }
}

/** L'ombre qui détache la ligne d'aide de n'importe quel fond de scène, clair comme sombre. */
private val SCENE_HINT_SHADOW = Shadow(color = Color.Black.copy(alpha = 0.45f), offset = Offset(0f, 1f), blurRadius = 4f)

/** La ligne d'aide de la scène vide : une seule, discrète, au bas de la scène, à l'encre des contrôles posés sur la scène. */
@Composable
internal fun StorySceneCaptureHint(offer: SceneQuickCapture.Offer, modifier: Modifier = Modifier) {
    val label = when (SceneQuickCapture.hint(offer)) {
        SceneQuickCapture.Hint.TAP_OR_HOLD -> R.string.composer_capture_hint_tap_or_hold
        SceneQuickCapture.Hint.HOLD_TO_FILM -> R.string.composer_capture_hint_hold
    }
    Box(modifier.fillMaxSize(), contentAlignment = Alignment.BottomCenter) {
        Text(
            text = stringResource(label),
            style = MaterialTheme.typography.labelMedium.copy(shadow = SCENE_HINT_SHADOW),
            color = Color.White.copy(alpha = 0.85f),
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(horizontal = MeeshySpacing.lg, vertical = 96.dp),
        )
    }
}

/**
 * Suit le doigt qui a armé le viseur en tenant la scène (#13849) : posé sur le PARENT de la scène, ce suivi survit à la
 * scène qui cède sa place au viseur — le doigt, posé avant que le viseur existe, ne lui appartient pas. Il ne relaie que
 * ce doigt-là ([SceneHoldRelay.holding]) ; tout autre geste le traverse sans effet.
 */
internal fun Modifier.followsSceneHold(capture: StorySceneCapture?): Modifier =
    if (capture == null) this else pointerInput(capture) {
        awaitEachGesture {
            val down = awaitFirstDown(requireUnconsumed = false, pass = PointerEventPass.Final)
            while (true) {
                val change = awaitPointerEvent(PointerEventPass.Final).changes.firstOrNull { it.id == down.id } ?: break
                if (!change.pressed) break
                if (capture.hold.holding) {
                    capture.hold.moved((change.position.x - down.position.x) / density, (change.position.y - down.position.y) / density)
                }
            }
            capture.hold.released()
        }
    }
