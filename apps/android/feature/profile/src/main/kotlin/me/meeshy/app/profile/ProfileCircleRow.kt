package me.meeshy.app.profile

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.relation.CircleProgressSummary
import me.meeshy.sdk.model.relation.ProfileCircle
import me.meeshy.ui.component.circles.CircleRaiseTrailing
import me.meeshy.ui.component.circles.levelIcon
import me.meeshy.ui.component.circles.levelTitle
import me.meeshy.ui.component.circles.summaryText
import me.meeshy.ui.component.circles.tint
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * La ligne du cercle sur le profil d'un Ami ou d'un Proche (#13940) — iso `ProfileCircleSection.swift`, posée là où la fiche
 * disait « Connectés » : le niveau commun, ce qui manque pour monter, et « Demander X » quand c'est possible. La table
 * servie des libellés n'est pas relue ici (comme iOS) : le catalogue local nomme le niveau.
 */
@Composable
internal fun ProfileCircleRow(circle: ProfileCircle, displayName: String, onRaise: () -> Unit) {
    val level = circle.level
    val title = levelTitle(level, null)
    val summary = summaryText(CircleProgressSummary.of(circle.link), null)
    val description = listOfNotNull(title, summary).joinToString(", ")
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(level.tint().copy(alpha = 0.12f))
            .padding(MeeshySpacing.md),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(
            modifier = Modifier
                .weight(1f)
                .semantics(mergeDescendants = true) { contentDescription = description },
            verticalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(text = levelIcon(level, null), modifier = Modifier.clearAndSetSemantics {})
                Text(
                    text = title,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Bold,
                    color = level.tint(),
                )
            }
            summary?.let {
                Text(text = it, style = MaterialTheme.typography.bodySmall, color = MeeshyTheme.tokens.textSecondary)
            }
        }
        Spacer(Modifier.width(MeeshySpacing.sm))
        CircleRaiseTrailing(
            link = circle.link,
            name = displayName,
            pending = circle.pending,
            config = null,
            onRaise = onRaise,
        )
    }
}
