package me.meeshy.app.calls

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import me.meeshy.feature.calls.R
import me.meeshy.sdk.model.call.CallRecordingKind
import me.meeshy.ui.component.chrome.MeeshyGlassSurface
import me.meeshy.ui.theme.MeeshyMediaChromeColors
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing

private val ANSWER_TARGET_MIN = 48.dp
private val RECORDING_DOT_SIZE = 10.dp

/**
 * La question posée à un participant requis : « X veut enregistrer l'appel », Refuser, Accepter.
 * Aucune sortie sans réponse — c'est une obligation de répondre (pas de croix, pas de toucher
 * à côté). Dessinée dans un emplacement qui reste visible chrome masqué. L'accent est celui de
 * la conversation, passé en paramètre.
 */
@Composable
internal fun CallRecordingConsentCard(
    requesterName: String,
    kind: CallRecordingKind,
    accent: Color,
    onAnswer: (accepted: Boolean) -> Unit,
    modifier: Modifier = Modifier,
) {
    val video = kind == CallRecordingKind.VIDEO
    val who = requesterName.ifBlank { stringResource(R.string.call_recording_someone) }
    val title = stringResource(if (video) R.string.call_recording_ask_video else R.string.call_recording_ask, who)
    val detail = stringResource(if (video) R.string.call_recording_askDetail_video else R.string.call_recording_askDetail)
    MeeshyGlassSurface(
        modifier = modifier
            .padding(horizontal = MeeshySpacing.lg)
            .fillMaxWidth()
            .semantics { liveRegion = LiveRegionMode.Assertive },
        shape = RoundedCornerShape(MeeshyRadius.xl),
    ) {
        Column(
            modifier = Modifier.background(Color.Black.copy(alpha = 0.25f)).padding(MeeshySpacing.lg),
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
                RecordingDot()
                Text(
                    text = title,
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                    color = Color.White,
                )
            }
            Text(text = detail, style = MaterialTheme.typography.bodySmall, color = MeeshyMediaChromeColors.OnMediaSecondary)
            Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.smPlus)) {
                AnswerButton(stringResource(R.string.call_recording_refuse), Color.White.copy(alpha = 0.16f), Modifier.weight(1f)) {
                    onAnswer(false)
                }
                AnswerButton(stringResource(R.string.call_recording_accept), accent, Modifier.weight(1f)) { onAnswer(true) }
            }
        }
    }
}

@Composable
internal fun RecordingDot(modifier: Modifier = Modifier) {
    Box(modifier.size(RECORDING_DOT_SIZE).clip(CircleShape).background(MeeshyPalette.Error))
}

@Composable
private fun AnswerButton(label: String, background: Color, modifier: Modifier, onClick: () -> Unit) {
    Box(
        modifier = modifier
            .heightIn(min = ANSWER_TARGET_MIN)
            .clip(CircleShape)
            .background(background)
            .clickable(role = Role.Button, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Text(text = label, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold, color = Color.White, maxLines = 1)
    }
}
