package me.meeshy.ui.component.video

import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView

/**
 * SDK-pure vertical-reel video surface: an [ExoPlayer]-backed [PlayerView] that plays
 * [mediaUrl] looping and (by default) muted, cropped to fill the surface. It plays only
 * while [isActive] is true — the caller (the reels pager) sets exactly one page active
 * so the others stay paused and rewound. Opaque params only; the atom owns just the
 * player lifecycle (created for the current [mediaUrl], released on dispose).
 */
@UnstableApi
@Composable
fun ReelVideoSurface(
    mediaUrl: String,
    isActive: Boolean,
    modifier: Modifier = Modifier,
    muted: Boolean = true,
) {
    val context = LocalContext.current
    val player = remember(mediaUrl) {
        ExoPlayer.Builder(context).build().apply {
            setMediaItem(MediaItem.fromUri(mediaUrl))
            repeatMode = Player.REPEAT_MODE_ONE
            volume = if (muted) 0f else 1f
            playWhenReady = false
            prepare()
        }
    }

    LaunchedEffect(player, isActive) {
        player.playWhenReady = isActive
        if (!isActive) player.seekTo(0)
    }

    DisposableEffect(player) {
        onDispose { player.release() }
    }

    AndroidView(
        modifier = modifier,
        factory = { ctx ->
            PlayerView(ctx).apply {
                useController = false
                resizeMode = AspectRatioFrameLayout.RESIZE_MODE_ZOOM
            }
        },
        update = { view -> view.player = player },
        onRelease = { view -> view.player = null },
    )
}
