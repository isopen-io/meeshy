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
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.e2ee.ConversationEncryptionExplanation
import me.meeshy.ui.component.MeeshyInfoNote
import me.meeshy.ui.component.MeeshyInfoNoted
import me.meeshy.ui.component.chrome.MeeshyGlassSurface
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Ce que la fiche explique de la conversation ouverte, sujet par sujet (iOS `ConversationEncryptionExplanationSections`).
 * Le détail secondaire d'un sujet (appareils, bascule) passe derrière son (i) : sa question en nom
 * accessible, sa note lue par le lecteur d'écran même repliée (#17697).
 */
@Composable
internal fun ConversationEncryptionExplanationSections(explanation: ConversationEncryptionExplanation, footerStatesFinality: Boolean = false) {
    var openNote by rememberSaveable { mutableStateOf<String?>(null) }
    explanation.layout(footerStatesFinality).forEach { topic ->
        Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
            val note = topic.questionRes?.let { question ->
                MeeshyInfoNote(
                    question = stringResource(question),
                    text = topic.noted.joinToString(" ") { stringResource(it.textRes()) },
                )
            }
            MeeshyInfoNoted(
                note = note,
                openNoteId = openNote,
                onOpenNoteIdChange = { openNote = it },
                tint = MeeshyTheme.tokens.textMuted,
            ) {
                Text(
                    text = stringResource(topic.topic.titleRes()),
                    style = MaterialTheme.typography.titleSmall,
                    color = MeeshyTheme.tokens.textPrimary,
                    modifier = Modifier.semantics { heading() },
                )
            }
            topic.visible.forEach { fact -> FactRow(fact.icon(), stringResource(fact.textRes())) }
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

/** Une carte d'état : un glyphe teinté et son titre — le régime se lit dans le sujet « Qui peut lire » (#17697). */
@Composable
internal fun EncryptionStateCard(icon: ImageVector, tint: Color, title: String) {
    MeeshyGlassSurface(shape = RoundedCornerShape(MeeshyRadius.lg), modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.padding(MeeshySpacing.md),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(28.dp))
            Spacer(Modifier.width(MeeshySpacing.md))
            Text(title, style = MaterialTheme.typography.titleSmall, color = MeeshyTheme.tokens.textPrimary)
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
