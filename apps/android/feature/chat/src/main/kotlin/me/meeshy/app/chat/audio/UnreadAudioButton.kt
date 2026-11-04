package me.meeshy.app.chat.audio

import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.flow.Flow
import me.meeshy.app.chat.LocalChatVoicePlayback
import me.meeshy.feature.chat.R
import me.meeshy.ui.component.bubble.BubbleAudioPlayback

/**
 * Le ▶ / ⏸ de la pastille « dernier message non lu » quand ce message est un vocal (iOS `ConversationScrollControlsView`,
 * `onPlayAudio`) : un geste, sans quitter le bas du fil. Il bascule la lecture si ce vocal est le courant, sinon il démarre
 * la file depuis lui. Sans lecteur de fil (aperçus, tests de rendu), il ne s'affiche pas.
 */
@Composable
internal fun UnreadAudioButton(attachmentId: String, accentColor: Color, modifier: Modifier = Modifier) {
    val voice = LocalChatVoicePlayback.current ?: return
    val ids = remember(attachmentId) { listOf(attachmentId) }
    val flow: Flow<BubbleAudioPlayback?> = remember(voice, ids) { voice.playbackFor(ids) }
    val initial = remember(voice, ids) { voice.currentPlayback(ids) }
    val playback by flow.collectAsStateWithLifecycle(initialValue = initial)
    val isPlaying = playback?.isPlaying == true
    IconButton(onClick = { voice.tapAttachment(attachmentId) }, modifier = modifier.size(48.dp)) {
        Icon(
            imageVector = if (isPlaying) Icons.Filled.Pause else Icons.Filled.PlayArrow,
            contentDescription = stringResource(if (isPlaying) R.string.chat_media_pause else R.string.chat_media_play),
            tint = accentColor,
        )
    }
}
