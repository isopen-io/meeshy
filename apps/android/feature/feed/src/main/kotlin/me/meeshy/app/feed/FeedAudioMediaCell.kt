package me.meeshy.app.feed

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.StateFlow
import me.meeshy.sdk.lang.ReaderPrism
import me.meeshy.sdk.model.media.MediaPlayerContext
import me.meeshy.sdk.model.playback.AudioPlaybackState
import me.meeshy.sdk.playback.AudioPlaybackEngine
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.ui.component.audio.AudioPlayerActions
import me.meeshy.ui.component.audio.AudioPlayerState
import me.meeshy.ui.component.audio.AudioPlayerView
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

internal const val FEED_AUDIO_TRANSCRIPT_TAG: String = "feed-audio-transcript"

/**
 * Le lecteur audio des cartes du fil : le moteur de lecture est UN (un seul vocal sonne à la fois, le suivant arrête le précédent) ;
 * la carte lit son état et lui adresse ses gestes. Le prisme du lecteur vient de la session.
 */
@HiltViewModel
class FeedAudioPlaybackViewModel @Inject constructor(
    private val engine: AudioPlaybackEngine,
    private val session: SessionRepository,
) : ViewModel() {

    val playback: StateFlow<AudioPlaybackState> get() = engine.state

    val preferredLanguages: List<String>
        get() = ReaderPrism.resolve(session.currentUser.value ?: EmptyContentPreferences)

    fun toggle(attachmentId: String, url: String) {
        if (engine.state.value.attachmentId == attachmentId) engine.togglePlayPause() else engine.play(attachmentId, url, isProtected = false)
    }

    fun seek(attachmentId: String, fraction: Double) {
        if (engine.state.value.attachmentId == attachmentId) engine.seek(fraction)
    }

    fun cycleSpeed() = engine.cycleSpeed()
}

/** L'audio d'un post : lecteur à forme d'onde, piste et transcription élues par le Prisme du lecteur. */
@Composable
internal fun FeedAudioMediaCell(
    item: FeedMediaItem,
    carrierLanguage: String?,
    accent: Color,
    modifier: Modifier = Modifier,
    viewModel: FeedAudioPlaybackViewModel = hiltViewModel(),
) {
    val engine by viewModel.playback.collectAsStateWithLifecycle()
    val cell = remember(item, carrierLanguage) { FeedAudioCellPrism.serve(item, carrierLanguage, viewModel.preferredLanguages) }
    FeedAudioMediaCellContent(
        cell = cell,
        state = FeedAudioCellPrism.playerState(item, cell, engine),
        accent = accent,
        actions = AudioPlayerActions(
            onPlayPause = { viewModel.toggle(item.id, cell.url) },
            onSeek = { fraction -> viewModel.seek(item.id, fraction) },
            onCycleSpeed = viewModel::cycleSpeed,
        ),
        modifier = modifier,
    )
}

/** La projection sans état : testable sans moteur ni Hilt. */
@Composable
internal fun FeedAudioMediaCellContent(
    cell: FeedAudioCell,
    state: AudioPlayerState,
    accent: Color,
    actions: AudioPlayerActions,
    modifier: Modifier = Modifier,
) {
    Column(modifier.fillMaxWidth()) {
        AudioPlayerView(
            state = state,
            context = MediaPlayerContext.FEED_POST,
            accent = accent,
            actions = actions,
            bottomSlot = cell.transcript?.let { text ->
                {
                    Text(
                        text = text,
                        style = MaterialTheme.typography.bodySmall,
                        color = MeeshyTheme.tokens.textSecondary,
                        modifier = Modifier
                            .padding(horizontal = MeeshySpacing.md)
                            .padding(bottom = MeeshySpacing.sm)
                            .testTag(FEED_AUDIO_TRANSCRIPT_TAG),
                    )
                }
            },
        )
    }
}
