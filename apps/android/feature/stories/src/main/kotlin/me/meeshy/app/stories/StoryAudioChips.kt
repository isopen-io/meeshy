package me.meeshy.app.stories

import android.util.Log
import androidx.compose.foundation.clickable
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import me.meeshy.feature.stories.R

private const val TAG = "StoryAudio"

/**
 * Le tap d'une pastille audio de premier plan : il coupe ou rétablit SA piste (iOS `StoryReaderAudioMuteRegistry`) et,
 * consommé ici, n'avance pas la story. Sans [onToggle] (export, aperçu) la pastille reste muette au toucher.
 */
@Composable
internal fun Modifier.storyAudioChipTap(muted: Boolean, onToggle: (() -> Unit)?): Modifier {
    if (onToggle == null) return this
    val state = stringResource(if (muted) R.string.story_audio_chip_muted else R.string.story_audio_chip_playing)
    return this
        .semantics { stateDescription = state }
        .clickable(role = Role.Button, onClick = onToggle)
}

/** Une piste posée sans adresse ne se tait pas en silence : le lecteur le journalise (identifiants seulement, aucune URL). */
@Composable
internal fun StoryUnresolvedAudioLog(slideId: String, unresolvedIds: List<String>) {
    if (unresolvedIds.isEmpty()) return
    LaunchedEffect(slideId, unresolvedIds) {
        Log.w(TAG, "piste audio sans URL sur la slide $slideId : ${unresolvedIds.joinToString()}")
    }
}
