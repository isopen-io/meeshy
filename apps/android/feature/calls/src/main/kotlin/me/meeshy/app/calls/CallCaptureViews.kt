package me.meeshy.app.calls

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import me.meeshy.feature.calls.R
import me.meeshy.sdk.model.call.CallCaptureKind
import me.meeshy.ui.theme.MeeshyTheme

/** Where the capsule sits: under the header row (44 dp and its margin), in audio as in video. */
internal val CALL_CAPTURE_CAPSULE_TOP = 56.dp

/**
 * #16665 — R1 : la capsule rouge « Karim capture l’écran de l’appel », 44 dp, un petit anneau
 * blanc puis la phrase. Posée UNE fois sous l'en-tête, elle ne suit pas le chrome : une capture ne
 * se cache pas (iOS `CallCaptureAlertCapsule`, web `CallCaptureAlerts`). TalkBack l'annonce.
 */
@Composable
internal fun CallCaptureCapsule(name: String, modifier: Modifier = Modifier) {
    val text = stringResource(R.string.call_peer_screen_capturing, name)
    Row(
        modifier = modifier
            .height(44.dp)
            .background(MeeshyTheme.tokens.error.copy(alpha = 0.9f), CircleShape)
            .padding(horizontal = 14.dp)
            .semantics {
                contentDescription = text
                liveRegion = LiveRegionMode.Assertive
            },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Box(Modifier.size(10.dp).border(2.dp, Color.White, CircleShape))
        Text(
            text = text,
            color = Color.White,
            fontSize = 13.sp,
            fontWeight = FontWeight.SemiBold,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.clearAndSetSemantics { },
        )
    }
}

/**
 * « Karim · a capturé l’écran · 12:40 » : le pseudo et son point à SA couleur, la phrase et l'heure
 * à l'encre secondaire, sur une ligne. Partagée par le bandeau vivant et le journal d'après l'appel.
 */
internal fun captureSentence(name: String, nameColor: Color, phrase: String, elapsed: String?, ink: Color): AnnotatedString =
    buildAnnotatedString {
        if (name.isNotBlank()) {
            withStyle(SpanStyle(color = nameColor, fontWeight = FontWeight.SemiBold)) { append("$name · ") }
        }
        withStyle(SpanStyle(color = ink)) { append(listOfNotNull(phrase, elapsed).joinToString(" · ")) }
    }

/** One capture line, with its spoken form. */
@Composable
internal fun CallCaptureLine(name: String, nameColor: Color, kind: CallCaptureKind, elapsed: String?, ink: Color) {
    val phrase = stringResource(captureKindPhrase(kind))
    val spoken = listOfNotNull(name.takeIf { it.isNotBlank() }, phrase, elapsed).joinToString(", ")
    Text(
        text = captureSentence(name, nameColor, phrase, elapsed, ink),
        style = MaterialTheme.typography.bodyMedium,
        modifier = Modifier.fillMaxWidth().clearAndSetSemantics { contentDescription = spoken },
    )
}

internal fun captureKindPhrase(kind: CallCaptureKind): Int = when (kind) {
    CallCaptureKind.SCREENSHOT -> R.string.call_capture_journal_screenshot
    CallCaptureKind.RECORDING -> R.string.call_capture_journal_recording
    CallCaptureKind.CALL_RECORDING_STARTED -> R.string.call_capture_journal_call_recording_started
    CallCaptureKind.CALL_RECORDING_STOPPED -> R.string.call_capture_journal_call_recording_stopped
}

/** Who a live capture names: me, or the peer (the roster name in a group arrives with the name of the duo). */
internal fun liveCaptureName(capture: CallLiveCapture, selfId: String?, youLabel: String, peerName: String): String = when {
    !capture.kind.namesCapturer -> ""
    selfId != null && capture.userId == selfId -> youLabel
    else -> capture.name.ifBlank { peerName }
}
