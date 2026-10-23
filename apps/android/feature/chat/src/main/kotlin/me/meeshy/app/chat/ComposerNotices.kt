package me.meeshy.app.chat

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.HourglassEmpty
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import me.meeshy.feature.chat.R
import me.meeshy.sdk.composer.SlowModeState
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Read-only composer state for a participant whose permissions deny sending text
 * (a share-link guest with `canSendMessages = false`). The thin, coverage-exempt
 * Compose glue over [ComposerAffordances.isReadOnly] — a muted lock row that
 * replaces the input entirely so the guest can read but never post.
 */
@Composable
internal fun ComposerReadOnlyNotice(modifier: Modifier = Modifier) {
    Row(
        modifier = modifier,
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = Icons.Filled.Lock,
            contentDescription = null,
            tint = MeeshyTheme.tokens.textSecondary,
            modifier = Modifier.size(16.dp),
        )
        Text(
            text = stringResource(R.string.chat_composer_read_only),
            style = MaterialTheme.typography.bodySmall,
            color = MeeshyTheme.tokens.textSecondary,
            modifier = Modifier.padding(start = MeeshySpacing.xs),
        )
    }
}

/**
 * The live slow-mode posture for the composer, ticked once a second while a
 * cooldown is running. The ViewModel's [ChatViewModel.send] gate is authoritative;
 * this is the thin, coverage-exempt Compose glue that animates the countdown so the
 * send button re-enables the instant the interval clears. The ticker only spins
 * while slow mode is active for the viewer, so a normal conversation never pays for
 * a recomposition loop.
 */
@Composable
internal fun rememberComposerSlowMode(state: ChatUiState): SlowModeState {
    val throttled = (state.slowModeSeconds ?: 0) > 0 && !state.slowModeExempt
    val now by produceState(
        initialValue = System.currentTimeMillis(),
        throttled,
        state.lastSelfSentAtMillis,
    ) {
        value = System.currentTimeMillis()
        while (throttled) {
            delay(500)
            value = System.currentTimeMillis()
        }
    }
    return state.slowModeState(now)
}
