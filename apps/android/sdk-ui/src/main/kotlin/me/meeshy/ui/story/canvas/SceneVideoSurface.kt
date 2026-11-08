package me.meeshy.ui.story.canvas

import android.content.Context
import android.graphics.Bitmap
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.SeekParameters
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView
import kotlinx.coroutines.delay
import me.meeshy.sdk.model.StorySourceWindowMs
import me.meeshy.sdk.model.scene.DriftSeekGate
import me.meeshy.sdk.model.scene.PlayheadTickClock
import me.meeshy.sdk.model.scene.VideoDriftCorrection
import me.meeshy.ui.component.viewer.VideoFirstFrameExtractor

internal const val SCENE_MEDIA_POSTER_TAG: String = "scene-media-poster"

/**
 * Une vidéo de premier plan : sa première image sert d'AFFICHE immédiate et reste tant que la première trame du lecteur
 * n'est pas rendue (et pendant un rechargement) ; le lecteur joue la fenêtre de source ([window]) au volume
 * effectif ([volume], déjà soumis au mute global). [play] faux : l'affiche seule, aucun lecteur n'est créé.
 */
@Composable
internal fun SceneVideoSurface(
    url: String,
    knownPoster: Bitmap?,
    window: StorySourceWindowMs?,
    volume: Float,
    loop: Boolean,
    play: Boolean,
    modifier: Modifier = Modifier,
    expectedPositionMs: (() -> Long?)? = null,
) {
    val poster by produceState(initialValue = knownPoster, url, knownPoster) {
        if (knownPoster != null) return@produceState
        val frame = if (url.startsWith("file:")) {
            VideoFirstFrameExtractor.extractFromFile(url.removePrefix("file://"))
        } else {
            VideoFirstFrameExtractor.extractFromRemoteUrl(url)
        }
        if (frame != null) value = frame
    }
    var firstFrameRendered by remember(url) { mutableStateOf(false) }
    Box(modifier.fillMaxSize()) {
        if (play) {
            ScenePlayerView(url, window, volume, loop, expectedPositionMs) { firstFrameRendered = true }
        }
        val shown = poster
        if (shown != null && (!play || !firstFrameRendered)) {
            Image(
                bitmap = shown.asImageBitmap(),
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize().testTag(SCENE_MEDIA_POSTER_TAG),
            )
        }
    }
}

@Composable
private fun ScenePlayerView(
    url: String,
    window: StorySourceWindowMs?,
    volume: Float,
    loop: Boolean,
    expectedPositionMs: (() -> Long?)?,
    onFirstFrame: () -> Unit,
) {
    val context = LocalContext.current
    val player = remember(url, window, loop) { createScenePlayer(context, url, window, loop) }
    LaunchedEffect(player, volume) { player.volume = volume.coerceIn(0f, 1f) }
    if (expectedPositionMs != null) {
        LaunchedEffect(player) {
            val gate = DriftSeekGate()
            val seekDone = object : Player.Listener {
                override fun onPositionDiscontinuity(
                    oldPosition: Player.PositionInfo,
                    newPosition: Player.PositionInfo,
                    reason: Int,
                ) {
                    if (reason == Player.DISCONTINUITY_REASON_SEEK) gate.release()
                }

                override fun onPlaybackStateChanged(playbackState: Int) {
                    if (playbackState == Player.STATE_READY) gate.release()
                }
            }
            player.addListener(seekDone)
            try {
              while (true) {
                delay((PlayheadTickClock.DRIFT_CHECK_INTERVAL_SECONDS * 1000).toLong())
                val expected = expectedPositionMs() ?: continue
                val target = VideoDriftCorrection.driftCorrectionMs(
                    expectedSeconds = expected / 1000.0,
                    actualSeconds = player.currentPosition / 1000.0,
                ) ?: continue
                if (gate.claim()) {
                    player.setSeekParameters(
                        SeekParameters(VideoDriftCorrection.SEEK_TOLERANCE_MS * 1000, VideoDriftCorrection.SEEK_TOLERANCE_MS * 1000),
                    )
                    player.seekTo(target)
                }
              }
            } finally {
                player.removeListener(seekDone)
            }
        }
    }
    DisposableEffect(player) {
        val listener = object : Player.Listener {
            override fun onRenderedFirstFrame() = onFirstFrame()
        }
        player.addListener(listener)
        onDispose {
            player.removeListener(listener)
            player.release()
        }
    }
    AndroidView(
        modifier = Modifier.fillMaxSize(),
        factory = { ctx ->
            PlayerView(ctx).apply {
                useController = false
                resizeMode = AspectRatioFrameLayout.RESIZE_MODE_ZOOM
                this.player = player
            }
        },
        update = { it.player = player },
    )
}

private fun createScenePlayer(context: Context, url: String, window: StorySourceWindowMs?, loop: Boolean): ExoPlayer {
    val item = MediaItem.Builder().setUri(url).apply {
        if (window != null) {
            setClippingConfiguration(
                MediaItem.ClippingConfiguration.Builder()
                    .setStartPositionMs(window.startMs)
                    .apply { window.endMs?.let { setEndPositionMs(it) } }
                    .build(),
            )
        }
    }.build()
    return ExoPlayer.Builder(context).build().apply {
        setMediaItem(item)
        repeatMode = if (loop) Player.REPEAT_MODE_ONE else Player.REPEAT_MODE_OFF
        playWhenReady = true
        prepare()
    }
}
