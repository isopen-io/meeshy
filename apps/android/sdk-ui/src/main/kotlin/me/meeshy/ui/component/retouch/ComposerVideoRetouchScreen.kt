package me.meeshy.ui.component.retouch

import android.graphics.Bitmap
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
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView
import java.io.File
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.composer.look.CallFaceEffect
import me.meeshy.sdk.model.composer.look.ComposerCropPreset
import me.meeshy.sdk.model.composer.look.ComposerEditPanel
import me.meeshy.sdk.model.composer.look.ComposerEditTake
import me.meeshy.sdk.model.composer.look.ComposerEditTool
import me.meeshy.sdk.model.composer.look.ComposerEditTools
import me.meeshy.sdk.model.composer.look.ComposerLookCanvas
import me.meeshy.sdk.model.composer.look.ComposerRetouchDelivery
import me.meeshy.sdk.model.composer.look.ComposerRetouchState
import me.meeshy.sdk.model.composer.look.ComposerRetouchTextBoard
import java.util.UUID

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
 * **LA RETOUCHE UNIQUE D'UNE VIDÉO** (#12650, #12736) — miroir de la retouche iOS d'une prise vidéo : la vidéo se
 * joue en boucle dans sa fenêtre de coupe, au volume réglé, avec le filtre et le cadre choisis et recadrée ; le rail
 * offre Filtres · Cadres, puis Recadrer, Texte, Couper et, si elle a du son, Son. « Terminé » rend la vidéo coupée,
 * au son gravé, recadrée, avec son look et ses textes ([renderVideoRetouch]).
 */
@Composable
public fun ComposerVideoRetouchScreen(
    source: File,
    probe: RetouchVideoProbe,
    output: File,
    author: ComposerLookAuthor,
    onDone: suspend (ComposerVideoRetouchResult) -> Unit,
    onCancel: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val tools = remember(probe) { listOf(ComposerEditTool.CROP, ComposerEditTool.TEXT, ComposerEditTool.TRIM, ComposerEditTool.SOUND) }
    var state by remember {
        mutableStateOf(ComposerRetouchState.opening(ComposerEditTake.Video(probe.hasAudio), RetouchVideoEffectsOffered, tools, probe.durationSeconds))
    }
    var finishing by remember { mutableStateOf(false) }
    var lockedPreset by remember { mutableStateOf<ComposerCropPreset?>(null) }
    var text by remember { mutableStateOf(ComposerRetouchTextBoard()) }
    val newTextId = { UUID.randomUUID().toString() }
    val scope = rememberCoroutineScope()
    val edit = state.video
    val player = rememberRetouchVideoPlayer(source, edit)
    val still by rememberRetouchVideoStill(source)
    val cropping = ComposerEditTools.showsBrackets(state.activeTools)
    val writing = ComposerEditTool.TEXT in state.activeTools && state.openFamily == null
    val previewCrop = if (cropping) null else state.crop
    RetouchVideoPreviewLook(player, probe, if (cropping) state.look.withoutFrame else state.look, previewCrop, author, still)

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
            val board = text.endingTyping()
            val result = when {
                video == null || (settled.delivery == ComposerRetouchDelivery.ORIGINAL && board.written.isEmpty()) -> ComposerVideoRetouchResult.Original
                renderVideoRetouch(context, source, probe, video.copy(crop = settled.crop), settled.look, board, author, output) -> ComposerVideoRetouchResult.Rendered(output)
                else -> null
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

    BackHandler(enabled = !state.settled) {
        val open = state.openFamily
        when {
            open != null -> state = state.tappingFamily(open)
            text.typingId != null -> text = text.endingTyping()
            writing -> state = state.tappingTool(ComposerEditTool.TEXT)
            cropping -> state = state.tappingTool(ComposerEditTool.CROP)
            else -> cancel()
        }
    }

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
            val (shownWidth, shownHeight) = probe.rendered(previewCrop)
            val display = with(LocalDensity.current) { ComposerLookCanvas.displayRect(maxWidth.toPx(), maxHeight.toPx(), shownWidth, shownHeight) }
            if (!cropping) RetouchTextLayer(board = text, display = display, interactive = writing && !finishing, newId = newTextId, onBoard = { text = it })
            if (cropping) {
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
            if (writing) RetouchTextToolbar(board = text, newId = newTextId, onBoard = { text = it })
            RetouchVideoPanels(state = state, still = still, author = author, enabled = !finishing, onState = { state = it }, onPreset = { lockedPreset = it }, probe = probe)
            RetouchRail(state = state, enabled = !finishing, onFamily = { family -> state = state.tappingFamily(family) }, onTool = { tool ->
                state = state.tappingTool(tool)
                text = if (ComposerEditTool.TEXT in state.activeTools) text.begin(newTextId()) else text.endingTyping()
            })
        }
    }
}

/** Les effets de visage ne suivent pas encore une vidéo sur Android : la retouche vidéo offre Filtres et Cadres. */
internal val RetouchVideoEffectsOffered: List<CallFaceEffect> = emptyList()

/** Sous la scène : la bande d'une famille ouverte, sinon les proportions, la coupe et le son. */
@Composable
private fun RetouchVideoPanels(
    state: ComposerRetouchState,
    still: Bitmap?,
    author: ComposerLookAuthor,
    enabled: Boolean,
    probe: RetouchVideoProbe,
    onState: (ComposerRetouchState) -> Unit,
    onPreset: (ComposerCropPreset) -> Unit,
) {
    val edit = state.video
    val thumbs = remember(still) { still?.let { scaledCopy(it, ComposerLookCanvas.THUMBNAIL_LONG_SIDE) } }
    ComposerEditTools.panels(familyOpen = state.openFamily != null, active = state.activeTools).forEach { panel ->
        when (panel) {
            ComposerEditPanel.BAND -> state.openFamily?.let { family ->
                thumbs?.let { thumbSource ->
                    ComposerLookStrip(family = family, look = state.look, thumbSource = thumbSource, author = author, selects = enabled,
                        effects = RetouchVideoEffectsOffered, onChoose = { item -> onState(state.choosing(item)) })
                }
            }
            ComposerEditPanel.PRESETS -> RetouchCropPresets(chosen = state.cropPreset, enabled = enabled) { preset ->
                onPreset(preset)
                onState(state.choosingPreset(preset, probe.width, probe.height))
            }
            ComposerEditPanel.TRIM -> edit?.let {
                RetouchTrimPanel(edit = it, showsSound = ComposerEditTool.SOUND in state.activeTools, enabled = enabled,
                    onTrim = { bounds -> onState(state.trimming(bounds)) },
                    onGain = { gain -> onState(state.settingGain(gain)) },
                    onMute = { onState(state.togglingMute()) })
            }
            ComposerEditPanel.SOUND -> edit?.let {
                RetouchSoundPanel(sound = it.sound, enabled = enabled, onGain = { gain -> onState(state.settingGain(gain)) }, onMute = { onState(state.togglingMute()) })
            }
            ComposerEditPanel.NONE -> Unit
        }
    }
}
