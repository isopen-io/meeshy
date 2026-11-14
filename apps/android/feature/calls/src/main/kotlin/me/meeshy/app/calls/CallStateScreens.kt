package me.meeshy.app.calls

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import me.meeshy.feature.calls.R
import me.meeshy.sdk.model.call.CallEndMotive
import me.meeshy.sdk.model.call.CallEndReason
import me.meeshy.sdk.model.call.CallFailureReason
import me.meeshy.sdk.model.call.CallStatusLabelLaw
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing

/** The latest live caption of the remote speaker, on a dark pill so it stays legible over any video. */
@Composable
internal fun CallCaption(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.bodyMedium,
        color = Color.White,
        textAlign = TextAlign.Center,
        modifier = Modifier
            .padding(horizontal = MeeshySpacing.lg)
            .clip(RoundedCornerShape(MeeshyRadius.md))
            .background(Color.Black.copy(alpha = 0.55f))
            .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.sm),
    )
}

@Composable
internal fun endedLabel(reason: CallEndReason?): String = when (CallStatusLabelLaw.motive(reason)) {
    CallEndMotive.Local -> stringResource(R.string.call_ended_local)
    CallEndMotive.Remote -> stringResource(R.string.call_ended_remote)
    CallEndMotive.Rejected -> stringResource(R.string.call_ended_declined)
    CallEndMotive.Missed -> stringResource(R.string.call_ended_missed)
    CallEndMotive.ConnectionLost -> stringResource(R.string.call_ended_connection_lost)
    CallEndMotive.Failed -> failureLabel(reason)
}

@Composable
private fun failureLabel(reason: CallEndReason?): String =
    when (CallFailureReason.classify((reason as? CallEndReason.Failed)?.message)) {
        CallFailureReason.InitiateTimedOut -> stringResource(R.string.call_failed_initiate_timed_out)
        CallFailureReason.InitiateMalformed -> stringResource(R.string.call_failed_initiate_malformed)
        CallFailureReason.ConnectTimedOut -> stringResource(R.string.call_failed_connect_timed_out)
        CallFailureReason.JoinRefused -> stringResource(R.string.call_failed_join_refused)
        CallFailureReason.MediaSetup -> stringResource(R.string.call_failed_media_setup)
        CallFailureReason.Unknown -> stringResource(R.string.call_ended_failed)
    }
