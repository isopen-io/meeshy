package me.meeshy.app.calls

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.selection.selectable
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import me.meeshy.feature.calls.R
import me.meeshy.sdk.model.call.CallFeedbackIssue
import me.meeshy.sdk.model.call.CallQualityFeedback
import me.meeshy.ui.theme.MeeshySpacing

private fun CallFeedbackIssue.labelRes(): Int = when (this) {
    CallFeedbackIssue.AUDIO_QUALITY -> R.string.call_feedback_issue_audio_quality
    CallFeedbackIssue.VIDEO_QUALITY -> R.string.call_feedback_issue_video_quality
    CallFeedbackIssue.ECHO -> R.string.call_feedback_issue_echo
    CallFeedbackIssue.DROPPED -> R.string.call_feedback_issue_dropped
    CallFeedbackIssue.SYNC -> R.string.call_feedback_issue_sync
    CallFeedbackIssue.OTHER -> R.string.call_feedback_issue_other
}

/**
 * Le retour de qualité de fin d'appel : une note en étoiles et des cases de problèmes.
 * Autonome et prévisualisable ; le gestionnaire reçoit la note par [onSubmit]
 * (`CallSocialSignalManager.emitQualityFeedback`).
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun CallQualityFeedbackSheet(
    callId: String,
    onSubmit: (CallQualityFeedback) -> Unit,
    onSkip: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var rating by rememberSaveable { mutableIntStateOf(0) }
    var issues by remember { mutableStateOf(emptyList<CallFeedbackIssue>()) }

    Column(
        modifier = modifier.fillMaxWidth().padding(MeeshySpacing.lg),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        Text(stringResource(R.string.call_feedback_title), style = MaterialTheme.typography.titleMedium)
        Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
            CallQualityFeedback.RATING_RANGE.forEach { star ->
                val label = stringResource(R.string.call_feedback_star, star)
                Icon(
                    imageVector = Icons.Filled.Star,
                    contentDescription = label,
                    tint = if (star <= rating) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant,
                    modifier = Modifier
                        .sizeIn(minWidth = 48.dp, minHeight = 48.dp)
                        .padding(MeeshySpacing.sm)
                        .selectable(selected = star == rating, role = Role.RadioButton, onClick = { rating = star }),
                )
            }
        }
        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
        ) {
            CallFeedbackIssue.entries.forEach { issue ->
                val selected = issue in issues
                FilterChip(
                    selected = selected,
                    onClick = { issues = if (selected) issues - issue else issues + issue },
                    label = { Text(stringResource(issue.labelRes())) },
                )
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
            TextButton(onClick = onSkip) { Text(stringResource(R.string.call_feedback_skip)) }
            Button(
                onClick = { CallQualityFeedback.of(callId, rating, issues)?.let(onSubmit) },
                enabled = rating in CallQualityFeedback.RATING_RANGE,
            ) { Text(stringResource(R.string.call_feedback_send)) }
        }
    }
}
