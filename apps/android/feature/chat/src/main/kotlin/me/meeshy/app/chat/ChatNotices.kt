package me.meeshy.app.chat

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.Videocam
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
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.unit.dp
import me.meeshy.feature.chat.R
import me.meeshy.ui.component.MeeshySkeletonBox
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

@Composable
internal fun ChatSkeleton() {
    Column(modifier = Modifier.fillMaxSize().padding(MeeshySpacing.lg)) {
        repeat(6) { index ->
            MeeshySkeletonBox(
                modifier = Modifier
                    .padding(vertical = MeeshySpacing.sm)
                    .fillMaxWidth(if (index % 2 == 0) 0.6f else 0.45f)
                    .height(36.dp),
            )
        }
    }
}

/**
 * Header affordance to rejoin a call the local session lost but that is still
 * live server-side (crash/relaunch mid-call). A green success pill — a tap joins
 * the EXISTING call (adopting its server id via the shared auto-answer path), it
 * never places a new one. Parité iOS pill « Rejoindre » (b69509366).
 */
@Composable
internal fun RejoinCallPill(isVideo: Boolean, onClick: () -> Unit) {
    Button(
        onClick = onClick,
        colors = ButtonDefaults.buttonColors(
            containerColor = MeeshyTheme.tokens.success,
            contentColor = Color.White,
        ),
        contentPadding = PaddingValues(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.xs),
        modifier = Modifier.padding(end = MeeshySpacing.sm),
    ) {
        Icon(
            imageVector = if (isVideo) Icons.Filled.Videocam else Icons.Filled.Call,
            contentDescription = null,
            modifier = Modifier.size(18.dp),
        )
        Spacer(Modifier.size(MeeshySpacing.xs))
        Text(
            text = stringResource(R.string.chat_call_rejoin),
            style = MaterialTheme.typography.labelLarge,
        )
    }
}

@Composable
internal fun ChatNotice(message: String, onRetry: (() -> Unit)?) {
    Column(
        modifier = Modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(
            text = message,
            style = MaterialTheme.typography.bodyMedium,
            color = MeeshyTheme.tokens.textSecondary,
        )
        if (onRetry != null) {
            Button(onClick = onRetry, modifier = Modifier.padding(top = MeeshySpacing.lg)) {
                Text(stringResource(R.string.chat_retry))
            }
        }
    }
}
