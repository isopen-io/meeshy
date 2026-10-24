package me.meeshy.ui.component.retouch

import android.media.MediaMetadataRetriever
import android.view.ViewGroup
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.testTag
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView
import java.io.File
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import me.meeshy.sdk.media.RetouchVideoExporter
import me.meeshy.sdk.model.composer.look.ComposerCropPreset
import me.meeshy.sdk.model.composer.look.ComposerEditPanel
import me.meeshy.sdk.model.composer.look.ComposerEditTake
import me.meeshy.sdk.model.composer.look.ComposerEditTool
import me.meeshy.sdk.model.composer.look.ComposerEditTools
import me.meeshy.sdk.model.composer.look.ComposerLookCanvas
import me.meeshy.sdk.model.composer.look.ComposerRetouchDelivery
import me.meeshy.sdk.model.composer.look.ComposerRetouchState
import me.meeshy.sdk.model.composer.look.ComposerTakeGain

/** Ce qu'une vidéo prise déclare : sa durée, ses dimensions debout, et si elle porte du son. */
public data class RetouchVideoProbe(val durationSeconds: Double, val width: Int, val height: Int, val hasAudio: Boolean) {
    public companion object {
        /** La vidéo lue ; `null` si elle ne se lit pas (elle part alors telle quelle). */
        public fun of(file: File): RetouchVideoProbe? = runCatching {
            val retriever = MediaMetadataRetriever()
            try {
                retriever.setDataSource(file.absolutePath)
                fun number(key: Int) = retriever.extractMetadata(key)?.toLongOrNull()
                val duration = number(MediaMetadataRetriever.METADATA_KEY_DURATION) ?: return@runCatching null
                val width = number(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH)?.toInt() ?: return@runCatching null
                val height = number(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT)?.toInt() ?: return@runCatching null
                val turned = (number(MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION) ?: 0L) % 180 != 0L
                val audio = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_HAS_AUDIO) == "yes"
                RetouchVideoProbe(duration / 1000.0, if (turned) height else width, if (turned) width else height, audio)
            } finally {
                retriever.release()
            }
        }.getOrNull()
    }
}

/** Ce que « Terminé » remet pour une vidéo : la prise telle quelle, ou le fichier rendu. */
public sealed interface ComposerVideoRetouchResult {
    public data object Original : ComposerVideoRetouchResult
    public data class Rendered(val file: File) : ComposerVideoRetouchResult
}

/**
 * **LA RETOUCHE UNIQUE D'UNE VIDÉO** (#12650) — miroir de la retouche iOS d'une prise vidéo : la vidéo se
 * joue en boucle dans sa fenêtre de coupe, au volume réglé ; le rail offre Recadrer, Couper et, si elle a du
 * son, Son. « Terminé » rend la vidéo coupée, au son gravé et recadrée ([RetouchVideoExporter]).
 */
@Composable
public fun ComposerVideoRetouchScreen(
    source: File,
    probe: RetouchVideoProbe,
    output: File,
    onDone: suspend (ComposerVideoRetouchResult) -> Unit,
    onCancel: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val tools = remember(probe) { listOf(ComposerEditTool.CROP, ComposerEditTool.TRIM, ComposerEditTool.SOUND) }
    var state by remember {
        mutableStateOf(
            ComposerRetouchState.opening(ComposerEditTake.Video(probe.hasAudio), RetouchRenderableEffects, tools, probe.durationSeconds, lookFamilies = false),
        )
    }
    var finishing by remember { mutableStateOf(false) }
    var lockedPreset by remember { mutableStateOf<ComposerCropPreset?>(null) }
    val scope = rememberCoroutineScope()
    val player = remember(source) {
        ExoPlayer.Builder(context).build().apply {
            setMediaItem(MediaItem.fromUri(android.net.Uri.fromFile(source)))
            repeatMode = Player.REPEAT_MODE_ALL
            prepare()
            playWhenReady = true
        }
    }
    DisposableEffect(player) { onDispose { player.release() } }
    val edit = state.video
    LaunchedEffect(edit?.sound) { player.volume = ComposerTakeGain.volume((edit?.sound?.effectiveGain ?: 1.0).toFloat()) }
    LaunchedEffect(edit?.window) {
        val current = edit ?: return@LaunchedEffect
        player.seekTo(current.clipStartMs)
        while (true) {
            val position = player.currentPosition
            if (position >= current.clipEndMs || position < current.clipStartMs - LOOP_SLACK_MS) player.seekTo(current.clipStartMs)
            delay(LOOP_POLL_MS)
        }
    }

    fun cancel() {
        state.settling()?.let { settled ->
            state = settled
            onCancel()
        }
    }

    fun done() {
        val settled = state.settling() ?: return
        state = settled
        finishing = true
        scope.launch {
            val video = settled.video
            val result = when {
                settled.delivery == ComposerRetouchDelivery.ORIGINAL || video == null -> ComposerVideoRetouchResult.Original
                else -> runCatching { RetouchVideoExporter.export(context, source, video.copy(crop = settled.crop), output) }
                    .map { ComposerVideoRetouchResult.Rendered(output) }
                    .getOrNull()
            }
            if (result == null) {
                state = settled.copy(settled = false)
                finishing = false
                return@launch
            }
            player.pause()
            onDone(result)
        }
    }

    val cropping = ComposerEditTools.showsBrackets(state.activeTools)
    BackHandler(enabled = !state.settled) { if (cropping) state = state.tappingTool(ComposerEditTool.CROP) else cancel() }

    Box(modifier.fillMaxSize().background(Color.Black).semantics { testTag = "retouch.video" }) {
        BoxWithConstraints(Modifier.fillMaxSize()) {
            AndroidView(
                factory = { viewContext ->
                    PlayerView(viewContext).apply {
                        useController = false
                        resizeMode = AspectRatioFrameLayout.RESIZE_MODE_FIT
                        layoutParams = ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
                        this.player = player
                    }
                },
                modifier = Modifier.fillMaxSize(),
            )
            if (cropping) {
                val display = with(LocalDensity.current) { ComposerLookCanvas.displayRect(maxWidth.toPx(), maxHeight.toPx(), probe.width, probe.height) }
                RetouchCropBrackets(
                    crop = state.crop,
                    aspect = lockedPreset?.aspect(probe.width.toDouble(), probe.height.toDouble()),
                    display = display,
                    onCrop = { crop -> state = state.cropping(crop, probe.width, probe.height) },
                )
            }
        }
        if (state.showsTopRow || finishing) {
            RetouchTopRow(finishing = finishing, onCancel = ::cancel, onDone = ::done, modifier = Modifier.align(Alignment.TopCenter))
        }
        Column(Modifier.align(Alignment.BottomCenter).fillMaxWidth().navigationBarsPadding().padding(bottom = 12.dp)) {
            ComposerEditTools.panels(familyOpen = false, active = state.activeTools).forEach { panel ->
                when (panel) {
                    ComposerEditPanel.PRESETS -> RetouchCropPresets(chosen = state.cropPreset, enabled = !finishing) { preset ->
                        lockedPreset = preset
                        state = state.choosingPreset(preset, probe.width, probe.height)
                    }
                    ComposerEditPanel.TRIM -> edit?.let {
                        RetouchTrimPanel(edit = it, showsSound = ComposerEditTool.SOUND in state.activeTools, enabled = !finishing,
                            onTrim = { bounds -> state = state.trimming(bounds) },
                            onGain = { gain -> state = state.settingGain(gain) },
                            onMute = { state = state.togglingMute() })
                    }
                    ComposerEditPanel.SOUND -> edit?.let {
                        RetouchSoundPanel(sound = it.sound, enabled = !finishing, onGain = { gain -> state = state.settingGain(gain) }, onMute = { state = state.togglingMute() })
                    }
                    ComposerEditPanel.NONE, ComposerEditPanel.BAND -> Unit
                }
            }
            RetouchRail(state = state, enabled = !finishing, onFamily = {}, onTool = { tool -> state = state.tappingTool(tool) })
        }
    }
}

private const val LOOP_POLL_MS = 50L
private const val LOOP_SLACK_MS = 250L
