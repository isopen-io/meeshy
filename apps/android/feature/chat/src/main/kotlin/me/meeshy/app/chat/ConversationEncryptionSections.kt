package me.meeshy.app.chat

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.e2ee.ConversationEncryptionExplanation
import me.meeshy.ui.component.chrome.MeeshyGlassSurface
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/** Ce que la fiche explique de la conversation ouverte, sujet par sujet (iOS `ConversationEncryptionExplanationSections`). */
@Composable
internal fun ConversationEncryptionExplanationSections(explanation: ConversationEncryptionExplanation) {
    explanation.sections.forEach { section ->
        Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
            Text(
                text = stringResource(section.topic.titleRes()),
                style = MaterialTheme.typography.titleSmall,
                color = MeeshyTheme.tokens.textPrimary,
                modifier = Modifier.semantics { heading() },
            )
            section.facts.forEach { fact -> FactRow(fact.icon(), stringResource(fact.textRes())) }
        }
    }
}

@Composable
private fun FactRow(icon: ImageVector, text: String) {
    Row(verticalAlignment = Alignment.Top) {
        Icon(icon, contentDescription = null, tint = MeeshyTheme.tokens.textMuted, modifier = Modifier.size(18.dp))
        Spacer(Modifier.width(MeeshySpacing.sm))
        Text(text = text, style = MaterialTheme.typography.bodySmall, color = MeeshyTheme.tokens.textSecondary)
    }
}

/** Une carte d'état : un glyphe teinté, un titre, une phrase. */
@Composable
internal fun EncryptionStateCard(icon: ImageVector, tint: Color, title: String, subtitle: String) {
    MeeshyGlassSurface(shape = RoundedCornerShape(MeeshyRadius.lg), modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.padding(MeeshySpacing.md),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(28.dp))
            Spacer(Modifier.width(MeeshySpacing.md))
            Column {
                Text(title, style = MaterialTheme.typography.titleSmall, color = MeeshyTheme.tokens.textPrimary)
                Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MeeshyTheme.tokens.textMuted)
            }
        }
    }
}

@Composable
internal fun EncryptionDetailLine(label: String, value: String) {
    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, style = MaterialTheme.typography.bodyMedium, color = MeeshyTheme.tokens.textSecondary)
        Text(value, style = MaterialTheme.typography.bodyMedium, color = MeeshyTheme.tokens.textPrimary)
    }
}

internal val EncryptionSuccessTint: Color get() = MeeshyPalette.Success
internal val EncryptionWarningTint: Color get() = MeeshyPalette.Warning
