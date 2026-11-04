package me.meeshy.app.chat

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import me.meeshy.feature.chat.R
import me.meeshy.sdk.model.EntryLinkRequirement
import me.meeshy.sdk.model.EntryLinkSettings
import me.meeshy.sdk.model.ParticipantCardPresenter
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * « Réglages du lien » : encadré d'un liseré pointillé de 1 dp (4/3) à 30 % de l'accent. État désactivé en orange,
 * entrées n/max, expiration, exigences jointes par « · », langues admises en majuscules. Servi aux seuls hôtes.
 */
@Composable
internal fun ParticipantEntryLinkSection(
    settings: EntryLinkSettings,
    accent: Color,
    formatDay: (String) -> String,
) {
    val outline = accent.copy(alpha = 0.3f)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .drawBehind {
                drawRoundRect(
                    color = outline,
                    cornerRadius = CornerRadius(12.dp.toPx()),
                    style = Stroke(
                        width = 1.dp.toPx(),
                        pathEffect = PathEffect.dashPathEffect(floatArrayOf(4.dp.toPx(), 3.dp.toPx())),
                    ),
                )
            }
            .padding(MeeshySpacing.md),
        verticalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        Text(
            text = stringResource(R.string.participant_profile_entry_link_title),
            style = MaterialTheme.typography.labelLarge,
            color = MeeshyTheme.tokens.textPrimary,
        )
        if (settings.inactive) {
            Text(
                text = stringResource(R.string.participant_profile_entry_link_inactive),
                style = MaterialTheme.typography.bodySmall,
                color = MeeshyTheme.tokens.warning,
            )
        }
        Line(R.string.participant_profile_entry_link_uses, settings.uses)
        settings.expiresAt?.let { Line(R.string.participant_profile_entry_link_expires, formatDay(it)) }
        if (settings.requirements.isNotEmpty()) {
            Line(
                R.string.participant_profile_entry_link_requires,
                ParticipantCardPresenter.joinRequirements(settings.requirements.map { stringResource(requirementLabel(it)) }),
            )
        }
        settings.languages?.let { Line(R.string.participant_profile_entry_link_languages, it) }
    }
}

@Composable
private fun Line(label: Int, value: String) {
    Text(
        text = stringResource(label) + " : " + value,
        style = MaterialTheme.typography.bodySmall,
        color = MeeshyTheme.tokens.textSecondary,
    )
}

private fun requirementLabel(requirement: EntryLinkRequirement): Int = when (requirement) {
    EntryLinkRequirement.NICKNAME -> R.string.participant_profile_require_nickname
    EntryLinkRequirement.EMAIL -> R.string.participant_profile_require_email
    EntryLinkRequirement.BIRTHDAY -> R.string.participant_profile_require_birthday
}
