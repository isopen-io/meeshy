package me.meeshy.ui.component.bubble

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.sp
import me.meeshy.sdk.model.JoinNoticePresentation
import me.meeshy.ui.R
import me.meeshy.ui.format.bubbleClockLabel
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * La ligne d'un avis système : centrée, petite, secondaire, SANS bulle (iOS `BubbleSystemNoticeView`
 * et `BubbleJoinNoticeView`). L'heure du fil se grave en petit au-dessus ; le texte est celui que
 * [BubbleContentBuilder] a composé chez le lecteur (capture, arrivées) ou le repli du `content`.
 *
 * - un avis d'arrivée ([BubbleContent.joinNotice]) porte le badge « sans compte » d'un visiteur de
 *   lien public, son @handle d'inscrit et les droits du lien ;
 * - la ligne d'arrivées groupées ([BubbleContent.isArrivalsNotice]) est touchable quand l'hôte pose
 *   [BubbleCallbacks.onSayHi] : « dis-leur salut » ouvre la réponse rapide.
 */
@Composable
internal fun SystemNoticeLine(content: BubbleContent, callbacks: BubbleCallbacks, modifier: Modifier = Modifier) {
    val join = content.joinNotice
    if (join != null && join.primaryName.isNotEmpty()) {
        JoinNoticeCard(join = join, content = content, modifier = modifier)
        return
    }
    if (content.text.isBlank()) return
    val muted = MeeshyTheme.tokens.textMuted
    val clock = remember(content.createdAtIso) { bubbleClockLabel(content.createdAtIso) }
    val sayHi = callbacks.onSayHi?.takeIf { content.isArrivalsNotice }
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xxs),
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.xs)
            .let { base ->
                if (sayHi == null) base else base.clickable(role = Role.Button, onClick = sayHi)
            }
            .semantics(mergeDescendants = true) { contentDescription = content.text },
    ) {
        if (clock != null) {
            Text(text = clock, fontSize = 9.5.sp, fontWeight = FontWeight.SemiBold, color = muted.copy(alpha = muted.alpha * 0.7f))
        }
        Text(text = content.text, fontSize = 12.5.sp, fontWeight = FontWeight.Medium, color = muted, textAlign = TextAlign.Center)
    }
}

@Composable
private fun JoinNoticeCard(join: JoinNoticePresentation, content: BubbleContent, modifier: Modifier) {
    val muted = MeeshyTheme.tokens.textMuted
    val label = stringResource(R.string.bubble_joinNotice_joined, join.primaryName)
    val noAccount = stringResource(R.string.bubble_joinNotice_noAccount)
    val clock = remember(content.createdAtIso) { bubbleClockLabel(content.createdAtIso) }
    val spoken = if (join.showsNoAccountBadge) "$label, $noAccount" else label
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xxs),
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.xs)
            .semantics(mergeDescendants = true) { contentDescription = spoken },
    ) {
        if (clock != null) {
            Text(text = clock, fontSize = 9.5.sp, fontWeight = FontWeight.SemiBold, color = muted.copy(alpha = muted.alpha * 0.7f))
        }
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
        ) {
            Text(
                text = label,
                style = MaterialTheme.typography.bodySmall,
                fontWeight = FontWeight.Medium,
                color = muted,
                textAlign = TextAlign.Center,
                modifier = Modifier.weight(1f, fill = false),
            )
            if (join.showsNoAccountBadge) {
                Text(
                    text = noAccount,
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.SemiBold,
                    color = MeeshyPalette.Purple700,
                    modifier = Modifier
                        .clip(RoundedCornerShape(MeeshyRadius.pill))
                        .background(MeeshyPalette.Purple700.copy(alpha = 0.12f))
                        .padding(horizontal = MeeshySpacing.sm, vertical = MeeshySpacing.xxs),
                )
            }
        }
        join.handle?.let { handle ->
            Text(text = handle, style = MaterialTheme.typography.labelSmall, color = muted)
        }
        join.rules?.let { rules ->
            val parts = listOf(
                stringResource(if (rules.canSendMessages) R.string.bubble_joinNotice_rule_messages_allowed else R.string.bubble_joinNotice_rule_messages_denied),
                stringResource(if (rules.canSendFiles) R.string.bubble_joinNotice_rule_files_allowed else R.string.bubble_joinNotice_rule_files_denied),
                stringResource(if (rules.canSendImages) R.string.bubble_joinNotice_rule_images_allowed else R.string.bubble_joinNotice_rule_images_denied),
            )
            Text(text = parts.joinToString(" · "), style = MaterialTheme.typography.labelSmall, color = muted, textAlign = TextAlign.Center)
        }
    }
}
