package me.meeshy.app.chat

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import me.meeshy.feature.chat.R
import me.meeshy.sdk.model.ForwardRefusalReason
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/** The sentence a refused forward is explained with, in the reader's language. */
@Composable
internal fun forwardRefusalBody(reason: ForwardRefusalReason): String = stringResource(
    when (reason) {
        ForwardRefusalReason.VIEW_ONCE -> R.string.chat_exit_blocked_view_once
        ForwardRefusalReason.AFTER_READ -> R.string.chat_exit_blocked_after_read
        ForwardRefusalReason.SOURCE_UNAVAILABLE -> R.string.chat_exit_blocked_source_unavailable
        ForwardRefusalReason.ENCRYPTED_SOURCE -> R.string.chat_exit_blocked_encrypted_source
        ForwardRefusalReason.ATTACHMENT_NOT_IN_SOURCE -> R.string.chat_exit_blocked_attachment_not_in_source
    },
)

/**
 * « Ce message ne sort pas de Meeshy » — shown instead of the recipient list when the
 * message cannot be forwarded (exit law or gateway refusal): the reason, then "Compris".
 */
@Composable
internal fun ForwardRefusalCard(
    reason: ForwardRefusalReason,
    accentColor: Color,
    onUnderstood: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.lg),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        Icon(
            imageVector = Icons.Filled.Lock,
            contentDescription = null,
            tint = accentColor,
            modifier = Modifier.size(36.dp),
        )
        Text(
            text = stringResource(R.string.chat_exit_blocked_title),
            style = MaterialTheme.typography.titleMedium,
            color = MeeshyTheme.tokens.textPrimary,
            textAlign = TextAlign.Center,
        )
        Text(
            text = forwardRefusalBody(reason),
            style = MaterialTheme.typography.bodyMedium,
            color = MeeshyTheme.tokens.textSecondary,
            textAlign = TextAlign.Center,
        )
        Button(
            onClick = onUnderstood,
            colors = ButtonDefaults.buttonColors(containerColor = accentColor),
        ) {
            Text(stringResource(R.string.chat_exit_blocked_understood))
        }
    }
}
