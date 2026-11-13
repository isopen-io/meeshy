package me.meeshy.app.chat

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import me.meeshy.feature.chat.R
import me.meeshy.sdk.model.engagement.HeaderFlameCard
import me.meeshy.sdk.model.format.CompactCountFormat
import me.meeshy.ui.format.rememberReaderLocale
import me.meeshy.ui.theme.MeeshyPalette

/**
 * La carte que le toucher sur la Flamme ouvre (#17770, iOS `HeaderFlameCard`) : la série en grand,
 * les points du jour, le total gagné ici, puis « Voir le jeu » (la Progression) et « Masquer la
 * flamme » — le masquage qu'assurait le premier toucher jusqu'ici. Un menu déroulant : un toucher
 * hors de la carte ou le retour système la referment.
 */
@Composable
internal fun HeaderFlameCardMenu(
    card: HeaderFlameCard?,
    expanded: Boolean,
    onClose: () -> Unit,
    onOpenProgression: () -> Unit,
    onHide: () -> Unit,
) {
    DropdownMenu(expanded = expanded && card != null, onDismissRequest = onClose) {
        if (card != null) {
            HeaderFlameCardContent(
                card = card,
                onOpenProgression = {
                    onClose()
                    onOpenProgression()
                },
                onHide = {
                    onClose()
                    onHide()
                },
            )
        }
    }
}

@Composable
private fun HeaderFlameCardContent(card: HeaderFlameCard, onOpenProgression: () -> Unit, onHide: () -> Unit) {
    val locale = rememberReaderLocale()
    Column(
        modifier = Modifier
            .width(260.dp)
            .padding(horizontal = 16.dp, vertical = 8.dp)
            .semantics { testTag = "chat.header.flame.card" },
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(text = "${card.streakDays}", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
            Text(
                text = stringResource(
                    if (card.streakDays == 1) R.string.chat_header_flame_card_streak_one else R.string.chat_header_flame_card_streak_other,
                ),
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.SemiBold,
            )
        }
        CardRow(
            label = stringResource(R.string.chat_header_flame_card_today),
            value = "+" + CompactCountFormat.text(card.todayPoints, locale),
            tint = MeeshyPalette.Warning,
        )
        CardRow(
            label = stringResource(R.string.chat_header_flame_card_total),
            value = CompactCountFormat.text(card.totalPoints, locale),
            tint = null,
        )
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(onClick = onOpenProgression, modifier = Modifier.weight(1f).heightIn(min = 48.dp)) {
                Text(stringResource(R.string.chat_header_flame_card_open))
            }
            OutlinedButton(onClick = onHide, modifier = Modifier.heightIn(min = 48.dp)) {
                Text(stringResource(R.string.chat_header_flame_card_hide))
            }
        }
    }
}

@Composable
private fun CardRow(label: String, value: String, tint: Color?) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(text = label, style = MaterialTheme.typography.bodyMedium)
        Spacer(Modifier.weight(1f))
        Text(
            text = value,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.Bold,
            color = tint ?: Color.Unspecified,
        )
    }
}
