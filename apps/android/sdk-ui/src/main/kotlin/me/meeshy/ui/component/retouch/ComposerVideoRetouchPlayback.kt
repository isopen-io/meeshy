package me.meeshy.ui.component.retouch

import android.content.Context
import android.graphics.Bitmap
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.State
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import java.io.File
import kotlin.math.max
import kotlin.math.roundToInt
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import me.meeshy.sdk.media.RetouchVideoEffects
import me.meeshy.sdk.media.RetouchVideoExporter
import me.meeshy.sdk.model.composer.look.ComposerLookCanvas
import me.meeshy.sdk.model.composer.look.ComposerPhotoFrame
import me.meeshy.sdk.model.composer.look.ComposerPhotoLook
import me.meeshy.sdk.model.composer.look.ComposerTakeGain
import me.meeshy.sdk.model.composer.look.ComposerVideoEdit
import me.meeshy.sdk.model.composer.look.ComposerVideoLook
import me.meeshy.sdk.model.composer.look.ComposerRetouchTextBoard
import me.meeshy.sdk.model.imageedit.NormalizedCrop

/** La taille de la vidéo rendue : la prise debout, recadrée. */
internal fun RetouchVideoProbe.rendered(crop: NormalizedCrop?): Pair<Int, Int> =
    ((crop?.width ?: 1f) * width).roundToInt().coerceAtLeast(2) to ((crop?.height ?: 1f) * height).roundToInt().coerceAtLeast(2)

/**
 * Le lecteur de la retouche : la vidéo en boucle dans sa fenêtre de coupe, au volume réglé. Le pipeline d'effets
 * est ouvert dès la préparation, pour que filtre, cadre et recadrage s'y posent à chaud ([rememberRetouchVideoLook]).
 */
@Composable
internal fun rememberRetouchVideoPlayer(source: File, edit: ComposerVideoEdit?): ExoPlayer {
    val context = LocalContext.current
    val player = remember(source) {
        ExoPlayer.Builder(context).build().apply {
            setVideoEffects(emptyList())
            setMediaItem(MediaItem.fromUri(android.net.Uri.fromFile(source)))
            repeatMode = Player.REPEAT_MODE_ALL
            prepare()
            playWhenReady = true
        }
    }
    DisposableEffect(player) { onDispose { player.release() } }
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
    return player
}

/**
 * **L'APERÇU EST LE RENDU** (#12736) : le recadrage, le filtre et le cadre se posent sur le lecteur par les MÊMES
 * effets que l'export ([RetouchVideoEffects]) — l'aperçu recadre la vidéo, il ne l'assombrit plus. Tant qu'un cadre
 * se peint, l'aperçu d'avant reste.
 */
@Composable
internal fun RetouchVideoPreviewLook(player: ExoPlayer, probe: RetouchVideoProbe, look: ComposerPhotoLook, crop: NormalizedCrop?, author: ComposerLookAuthor, still: Bitmap?) {
    LaunchedEffect(look, crop, still) {
        val effects = if (crop == null && !ComposerVideoLook.paints(look)) emptyList() else withContext(Dispatchers.Default) {
            val (width, height) = probe.rendered(crop)
            val framed = still?.let { ComposerLookPainter.cropped(it, crop) }
            RetouchVideoLookPainter.paint(look, author, width, height, framed)?.let { RetouchVideoEffects.of(crop?.let(RetouchVideoExporter::ndc), it) }
        } ?: return@LaunchedEffect
        player.setVideoEffects(effects)
    }
}

/** Ce que « Terminé » grave : la coupe, le son, le recadrage, le look et les textes ; `false` si le rendu échoue. */
internal suspend fun renderVideoRetouch(
    context: Context,
    source: File,
    probe: RetouchVideoProbe,
    edit: ComposerVideoEdit,
    look: ComposerPhotoLook,
    text: ComposerRetouchTextBoard,
    author: ComposerLookAuthor,
    output: File,
): Boolean = runCatching {
    val crop = edit.crop
    val (width, height) = probe.rendered(crop)
    val painted = withContext(Dispatchers.Default) {
        val still = if (look.frame == ComposerPhotoFrame.None) null
        else RetouchVideoStill.of(source, edit.clipStartMs, max(probe.width, probe.height))?.let { ComposerLookPainter.cropped(it, crop) }
        val videoLook = RetouchVideoLookPainter.paint(look, author, width, height, still) ?: return@withContext null
        videoLook to RetouchTextPainter.overlay(text.written, width, height)
    } ?: return false
    RetouchVideoExporter.export(context, source, edit, output, painted.second, painted.first)
    true
}.getOrDefault(false)

/** L'image fixe de la vidéo, à la taille de l'aperçu, lue hors du fil principal. */
@Composable
internal fun rememberRetouchVideoStill(source: File): State<Bitmap?> =
    produceState<Bitmap?>(null, source) {
        value = withContext(Dispatchers.IO) { RetouchVideoStill.of(source, 0, ComposerLookCanvas.PREVIEW_LONG_SIDE) }
    }

private const val LOOP_POLL_MS = 50L
private const val LOOP_SLACK_MS = 250L
