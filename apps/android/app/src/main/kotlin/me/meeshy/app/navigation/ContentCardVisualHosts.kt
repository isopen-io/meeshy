package me.meeshy.app.navigation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.app.feed.FeedAudioPlaybackViewModel
import me.meeshy.app.stories.PostSceneCard
import me.meeshy.sdk.model.contentcard.ContentCardVisual
import me.meeshy.sdk.model.media.MediaPlayerContext
import me.meeshy.sdk.model.playback.AudioPlaybackState
import me.meeshy.sdk.util.resolveMediaUrl
import me.meeshy.ui.component.LocalMediaBaseUrl
import me.meeshy.ui.component.audio.AudioPlayerActions
import me.meeshy.ui.component.audio.AudioPlayerState
import me.meeshy.ui.component.audio.AudioPlayerView
import me.meeshy.ui.component.contentcard.ContentCardScenePainter
import me.meeshy.ui.component.contentcard.ContentCardSoundPlayer
import me.meeshy.ui.theme.MeeshyPalette

/**
 * La scène d'un contenu partagé, peinte par le player des stories ARRÊTÉ (#20233, iOS `MeeshyScenePlayer` en mode carte,
 * en pause) : le fond et les objets posés, sans lecture ni son ; on la joue en ouvrant le contenu.
 */
internal val contentCardScenePainter: ContentCardScenePainter = { item, accentHex, modifier ->
    PostSceneCard(item = item, accentHex = accentHex, live = false, modifier = modifier)
}

/**
 * Le son seul d'un contenu partagé dans le lecteur audio du kit, branché sur le moteur UNIQUE des vocaux (un seul son à
 * la fois : lancer celui-ci arrête le vocal en cours), comme un son du fil (#20233, iOS `AudioPlayerView` de la carte).
 */
internal val contentCardSoundPlayer: ContentCardSoundPlayer = { sound, modifier -> ContentCardSound(sound, modifier) }

@Composable
private fun ContentCardSound(sound: ContentCardVisual.Sound, modifier: Modifier, viewModel: FeedAudioPlaybackViewModel = hiltViewModel()) {
    val engine by viewModel.playback.collectAsStateWithLifecycle()
    val baseUrl = LocalMediaBaseUrl.current
    val url = remember(sound.url, baseUrl) { resolveMediaUrl(sound.url, baseUrl) }
    AudioPlayerView(
        state = ContentCardSoundState.of(sound, engine),
        context = MediaPlayerContext.MESSAGE_BUBBLE,
        accent = MeeshyPalette.Indigo500,
        actions = AudioPlayerActions(
            onPlayPause = { viewModel.toggle(sound.attachmentId, url) },
            onSeek = { fraction -> viewModel.seek(sound.attachmentId, fraction) },
            onCycleSpeed = viewModel::cycleSpeed,
        ),
        modifier = modifier,
    )
}

/** L'état du lecteur pour ce son : celui du moteur quand c'est lui qui joue, sinon sa durée servie au repos. */
internal object ContentCardSoundState {
    private const val MILLIS_PER_SECOND = 1000.0

    fun of(sound: ContentCardVisual.Sound, engine: AudioPlaybackState): AudioPlayerState {
        val served = sound.durationSeconds?.toDouble() ?: 0.0
        if (engine.attachmentId != sound.attachmentId) return AudioPlayerState(durationSeconds = served)
        return AudioPlayerState(
            isPlaying = engine.isPlaying,
            isLoading = engine.isLoading,
            liveFraction = engine.progress,
            liveElapsedSeconds = engine.currentTimeMs / MILLIS_PER_SECOND,
            durationSeconds = if (engine.durationMs > 0) engine.durationMs / MILLIS_PER_SECOND else served,
            speed = engine.speed,
        )
    }
}
