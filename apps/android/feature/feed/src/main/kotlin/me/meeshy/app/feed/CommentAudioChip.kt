package me.meeshy.app.feed

import android.media.AudioAttributes
import android.media.MediaPlayer
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import me.meeshy.feature.feed.R
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Un commentaire vocal s'écoute dans le fil (#14265) : toucher la pastille lance la lecture, la retoucher la met en
 * pause. Le lecteur ne vit que le temps de l'écoute et se libère quand la rangée quitte l'écran.
 */
@Composable
internal fun CommentAudioChip(item: CommentMediaPreview) {
    val url = item.url ?: return
    var playing by remember(url) { mutableStateOf(false) }
    var player by remember(url) { mutableStateOf<MediaPlayer?>(null) }
    DisposableEffect(url) { onDispose { player?.release() } }
    val label = stringResource(R.string.post_comments_media_audio)
    val action = stringResource(if (playing) R.string.post_comments_media_pause_audio else R.string.post_comments_media_play_audio)
    val toggle: () -> Unit = {
        val current = player
        when {
            current != null && playing -> current.pause().also { playing = false }
            current != null -> current.start().also { playing = true }
            else -> player = commentAudioPlayer(url, onPrepared = { playing = true }, onDone = { playing = false })
        }
    }
    Row(
        modifier = Modifier
            .heightIn(min = 44.dp)
            .clip(RoundedCornerShape(MeeshyRadius.pill))
            .background(MeeshyPalette.Indigo500.copy(alpha = 0.12f))
            .clickable(onClickLabel = action, role = Role.Button, onClick = toggle)
            .semantics(mergeDescendants = true) { contentDescription = "$label · $action" }
            .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.xs),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        Icon(if (playing) MeeshyIcons.Pause else MeeshyIcons.Play, contentDescription = null, tint = MeeshyPalette.Indigo500, modifier = Modifier.size(20.dp))
        Icon(MeeshyIcons.Waveform, contentDescription = null, tint = MeeshyPalette.Indigo500, modifier = Modifier.size(20.dp))
        item.durationMillis?.takeIf { it > 0 }?.let { millis ->
            Text(commentAudioDuration(millis), style = MaterialTheme.typography.labelMedium, color = MeeshyTheme.tokens.textSecondary)
        }
    }
}

/** `m:ss` d'une durée en millisecondes. */
internal fun commentAudioDuration(millis: Int): String {
    val seconds = (millis + 500) / 1_000
    return "%d:%02d".format(seconds / 60, seconds % 60)
}

private fun commentAudioPlayer(url: String, onPrepared: () -> Unit, onDone: () -> Unit): MediaPlayer? = runCatching {
    MediaPlayer().apply {
        setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
        setDataSource(url)
        setOnPreparedListener { it.start(); onPrepared() }
        setOnCompletionListener { onDone() }
        setOnErrorListener { _, _, _ -> onDone(); true }
        prepareAsync()
    }
}.getOrNull()
