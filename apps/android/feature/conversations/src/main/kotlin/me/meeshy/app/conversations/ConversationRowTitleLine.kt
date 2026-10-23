package me.meeshy.app.conversations

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.sp
import me.meeshy.sdk.theme.DynamicColorGenerator
import me.meeshy.ui.component.MeeshyUnreadBadge
import me.meeshy.ui.theme.LentilleMetrics
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.hexColor
import androidx.compose.foundation.layout.fillMaxWidth

private const val PIN_GLYPH = "📌"
private const val MUTED_GLYPH = "🔕"
private const val LOCK_GLYPH = "🔒"

/**
 * Première ligne: 📌 avant le nom, le nom, puis 🔕, 🔒, l'émoji favori et les points d'étiquettes (6 dp,
 * trois au plus), et à droite la pastille de non-lus (« 99+ » au-delà de 99) — ou, quand un appel est en
 * cours, le bouton « Rejoindre » qui remplace toute autre info à droite (parité iOS
 * `joinLiveCallButton`, contrat §3.3). Les glyphes sont décoratifs: le libellé unique du conteneur les annonce.
 */
@Composable
internal fun ConversationRowTitleLine(
    title: String,
    isPinned: Boolean,
    isMuted: Boolean,
    isLocked: Boolean,
    reaction: String?,
    tags: List<String>,
    unreadCount: Int,
    accent: Color,
    onJoinCall: (() -> Unit)?,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (isPinned) Glyph(PIN_GLYPH)
        Text(
            text = title,
            fontSize = LentilleMetrics.Name.size,
            fontWeight = FontWeight.ExtraBold,
            color = MeeshyTheme.tokens.textPrimary,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f, fill = false),
        )
        if (isMuted) Glyph(MUTED_GLYPH)
        if (isLocked) Glyph(LOCK_GLYPH)
        reaction?.let { Glyph(it) }
        ConversationRowTagDots(tags)
        Spacer(Modifier.weight(1f))
        if (onJoinCall != null) {
            ConversationRowJoinButton(accent = accent, onClick = onJoinCall)
        } else {
            MeeshyUnreadBadge(count = unreadCount, isDark = MeeshyTheme.isDark)
        }
    }
}

@Composable
private fun Glyph(glyph: String) {
    Text(text = glyph, fontSize = LentilleMetrics.Tags.emojiSize.value.sp, maxLines = 1)
}

/** Les étiquettes en points colorés de 6 dp, après le nom — jamais des capsules sur le rang plat. */
@Composable
private fun ConversationRowTagDots(tags: List<String>) {
    val dots = ConversationRowAppearance.tagDots(tags)
    if (dots.isEmpty()) return
    Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xxs)) {
        dots.forEach { tag ->
            Box(
                Modifier
                    .size(LentilleMetrics.Tags.size)
                    .clip(CircleShape)
                    .background(hexColor(DynamicColorGenerator.colorForName(tag))),
            )
        }
    }
}
