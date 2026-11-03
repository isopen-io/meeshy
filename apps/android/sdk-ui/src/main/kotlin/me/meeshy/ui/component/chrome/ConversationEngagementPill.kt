package me.meeshy.ui.component.chrome

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.util.Locale
import me.meeshy.sdk.model.ConversationEngagementSnapshot
import me.meeshy.sdk.model.ConversationPointsForm
import me.meeshy.sdk.model.format.CompactCountFormat
import me.meeshy.ui.R
import me.meeshy.ui.format.rememberReaderLocale
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyTheme

/**
 * La pastille « série · total » de la conversation (iOS `ConversationEngagementPill`) en TROIS formes
 * ([ConversationPointsForm]) : une série court ⇒ flamme, « 4 · 1,2 k » en rouge ; aucune série ⇒ le cumul
 * SEUL, sans flamme, à l'encre tertiaire (le rouge reste la couleur de la série) ; cumul nul ou aucun
 * instantané ⇒ rien. [snapshot] est déjà relu au jour du lecteur (`forDay`). Feuille pure : une seule
 * phrase TalkBack, « 3 jours · Étincelles : 120 · Aujourd'hui : 10 ».
 */
@Composable
public fun ConversationEngagementPill(snapshot: ConversationEngagementSnapshot?, modifier: Modifier = Modifier) {
    val form = ConversationPointsForm.of(snapshot) ?: return
    val locale = rememberReaderLocale()
    val totalText = remember(form.totalPoints, locale) { CompactCountFormat.text(form.totalPoints, locale) }
    val description = conversationEngagementDescription(snapshot!!, locale)
    Row(
        modifier = modifier.clearAndSetSemantics { contentDescription = description },
        horizontalArrangement = Arrangement.spacedBy(2.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (form.streakDays > 0) {
            Icon(MeeshyIcons.FlameFilled, contentDescription = null, tint = MeeshyPalette.Error, modifier = Modifier.size(14.dp))
            Text(text = "${form.streakDays} · $totalText", style = engagementTextStyle(MeeshyPalette.Error), maxLines = 1)
        } else {
            Text(text = totalText, style = engagementTextStyle(MeeshyTheme.tokens.textMuted), maxLines = 1, overflow = TextOverflow.Clip)
        }
    }
}

/**
 * La marque de la rangée de liste, à côté de l'heure (iOS `ConversationStreakMark`) : « 🔥4 · 120 » en
 * rouge tant qu'une série court, « 120 » à l'encre de l'heure sans série, rien à cumul nul.
 */
@Composable
public fun ConversationStreakMark(snapshot: ConversationEngagementSnapshot?, modifier: Modifier = Modifier) {
    val form = ConversationPointsForm.of(snapshot) ?: return
    val locale = rememberReaderLocale()
    val totalText = remember(form.totalPoints, locale) { CompactCountFormat.text(form.totalPoints, locale) }
    val description = conversationEngagementDescription(snapshot!!, locale)
    val running = form.streakDays > 0
    val ink = if (running) MeeshyPalette.Error else MeeshyTheme.tokens.textMuted
    Row(
        modifier = modifier.clearAndSetSemantics { contentDescription = description },
        horizontalArrangement = Arrangement.spacedBy(2.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (running) Icon(MeeshyIcons.FlameFilled, contentDescription = null, tint = ink, modifier = Modifier.size(12.dp))
        Text(text = if (running) "${form.streakDays} · $totalText" else totalText, style = engagementTextStyle(ink), maxLines = 1)
    }
}

private fun engagementTextStyle(color: androidx.compose.ui.graphics.Color) = TextStyle(
    fontSize = 11.sp,
    fontWeight = FontWeight.SemiBold,
    fontFamily = FontFamily.Default,
    fontFeatureSettings = "tnum",
    color = color,
)

/**
 * La phrase TalkBack (iOS `ConversationEngagementPill.accessibilityText`) : « 3 jours · Étincelles : 120 ·
 * Aujourd'hui : 10 » tant qu'une série court (singulier « 1 jour »), sinon le cumul seul
 * (« 120 points gagnés dans cette conversation »).
 */
@Composable
public fun conversationEngagementDescription(
    snapshot: ConversationEngagementSnapshot,
    locale: Locale = rememberReaderLocale(),
): String {
    val total = snapshot.totalPoints
    if (snapshot.streakDays <= 0) {
        val totalText = remember(total, locale) { java.text.NumberFormat.getIntegerInstance(locale).format(total) }
        return if (total == 1) {
            stringResource(R.string.engagement_pill_a11y_total_one, totalText)
        } else {
            stringResource(R.string.engagement_pill_a11y_total_other, totalText)
        }
    }
    val days = if (snapshot.streakDays == 1) {
        stringResource(R.string.engagement_pill_a11y_streak_days_one, snapshot.streakDays)
    } else {
        stringResource(R.string.engagement_pill_a11y_streak_days_other, snapshot.streakDays)
    }
    return stringResource(R.string.engagement_pill_a11y_streak, days, total, snapshot.todayPoints)
}
