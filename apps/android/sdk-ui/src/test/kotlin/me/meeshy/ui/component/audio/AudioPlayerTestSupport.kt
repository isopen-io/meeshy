package me.meeshy.ui.component.audio

import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import me.meeshy.sdk.model.media.MediaPlayerContext

internal class RecordedActions {
    var plays = 0
    var downloads = 0
    var retries = 0
    var cycles = 0
    var fullscreens = 0
    val seeks = mutableListOf<Double>()
    val scrubbing = mutableListOf<Boolean>()

    fun actions(withFullscreen: Boolean = true, withComposer: Boolean = false) = AudioPlayerActions(
        onPlayPause = { plays++ },
        onSeek = { seeks += it },
        onCycleSpeed = { cycles++ },
        onDownload = { downloads++ },
        onRetry = { retries++ },
        onFullscreen = if (withFullscreen) ({ fullscreens++ }) else null,
        onEdit = if (withComposer) ({ }) else null,
        onDelete = if (withComposer) ({ }) else null,
        onScrubbingChange = { scrubbing += it },
    )
}

@Composable
internal fun PlayerUnderTest(
    state: AudioPlayerState,
    recorded: RecordedActions,
    context: MediaPlayerContext = MediaPlayerContext.FEED_POST,
    withComposer: Boolean = false,
) = AudioPlayerView(
    state = state,
    context = context,
    accent = Color(0xFF6366F1),
    actions = recorded.actions(withComposer = withComposer),
)
