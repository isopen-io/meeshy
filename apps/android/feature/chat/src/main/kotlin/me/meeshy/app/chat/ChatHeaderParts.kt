package me.meeshy.app.chat

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import me.meeshy.sdk.model.ConversationEngagementSnapshot
import me.meeshy.sdk.model.ConversationPointsForm
import me.meeshy.sdk.model.format.CompactCountFormat
import me.meeshy.ui.format.rememberReaderLocale
import me.meeshy.ui.theme.MeeshyTheme

/**
 * La pastille d'engagement de l'en-tête déplié (iOS `ConversationEngagementPill`) : « 🔥 4 · 1,2 k »
 * tant qu'une série court ; le cumul SEUL, sans flamme et à l'encre tertiaire, sans série ; rien si
 * le cumul est nul. [snapshot] est déjà relu au jour du lecteur.
 */
@Composable
internal fun ChatHeaderEngagementPill(snapshot: ConversationEngagementSnapshot?, modifier: Modifier = Modifier) {
    val form = ConversationPointsForm.of(snapshot) ?: return
    val locale = rememberReaderLocale()
    val totalText = remember(form.totalPoints, locale) { CompactCountFormat.text(form.totalPoints, locale) }
    val description = flameDescription(snapshot!!)
    Row(
        modifier = modifier.clearAndSetSemantics { contentDescription = description },
        horizontalArrangement = Arrangement.spacedBy(2.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (form.streakDays > 0) {
            FlameGlyph(phase = { 1f }, animates = false)
            FlameCount(text = "${form.streakDays} · $totalText")
        } else {
            Text(
                text = totalText,
                style = TextStyle(
                    fontSize = 10.sp,
                    fontWeight = FontWeight.SemiBold,
                    fontFamily = FontFamily.Default,
                    fontFeatureSettings = "tnum",
                    color = MeeshyTheme.tokens.textMuted,
                ),
                maxLines = 1,
                overflow = TextOverflow.Clip,
            )
        }
    }
}
