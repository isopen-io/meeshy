package me.meeshy.app.conversations

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.background
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.StartOffset
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.format.RelativeTimeFormat
import me.meeshy.ui.format.rememberRelativeTimeStrings
import me.meeshy.ui.theme.LentilleMetrics
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import java.time.ZoneId
import java.util.Locale

/**
 * La date relative courte de la rangée («5 min», «2 h», «3 j»…): le dernier message, sinon la mise à
 * jour, sinon la création. `null` quand aucun instant ne se lit — la rangée n'affiche alors rien.
 * La lecture des chaînes reste avant le retour anticipé: le graphe d'appels est inconditionnel.
 */
@Composable
internal fun conversationRowRelativeTime(conversation: ApiConversation, nowMillis: Long): String? {
    val strings = rememberRelativeTimeStrings()
    val millis = ConversationRowTime.epochMillis(conversation) ?: return null
    return RelativeTimeFormat.short(
        epochMillis = millis,
        referenceMillis = nowMillis,
        zone = ZoneId.systemDefault(),
        locale = Locale.getDefault(),
        strings = strings,
    )
}

/** La troisième ligne: la date seule, poussée à droite, 12 sp gras, troisième niveau de texte. */
@Composable
internal fun ConversationRowDateLine(timeLabel: String?, modifier: Modifier = Modifier) {
    Row(modifier = modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Spacer(Modifier.weight(1f))
        timeLabel?.let {
            Text(
                text = it,
                fontSize = LentilleMetrics.Time.size,
                fontWeight = FontWeight.Bold,
                color = MeeshyTheme.tokens.textMuted,
                maxLines = 1,
            )
        }
    }
}

/** La ligne 2: frappe (italique accent + trois points), sinon l'aperçu ou le brouillon. */
@Composable
internal fun ConversationRowLine2(
    line2: RowLine2,
    preview: RowPreview,
    accent: Color,
    modifier: Modifier = Modifier,
) {
    if (line2 == RowLine2.TYPING) {
        Row(
            modifier = modifier,
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = preview.text,
                fontSize = LentilleMetrics.Line2.size,
                fontStyle = FontStyle.Italic,
                color = accent,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f, fill = false),
            )
            ConversationTypingDots(color = accent)
        }
    } else {
        ConversationRowPreviewLine(preview = preview, primaryAccent = accent, modifier = modifier)
    }
}

/** Trois points de 5 dp qui pulsent, chacun avec 0,18 s de retard sur le précédent; fixes si « réduire les animations ». */
@Composable
internal fun ConversationTypingDots(color: Color, modifier: Modifier = Modifier) {
    val reduceMotion = LocalReduceMotion.current
    Row(modifier = modifier, horizontalArrangement = Arrangement.spacedBy(3.dp), verticalAlignment = Alignment.CenterVertically) {
        repeat(TYPING_DOT_COUNT) { index ->
            if (reduceMotion) TypingDot(color, alpha = TYPING_STILL_ALPHA) else PulsingTypingDot(color, index)
        }
    }
}

@Composable
private fun PulsingTypingDot(color: Color, index: Int) {
    val transition = rememberInfiniteTransition(label = "typingDot$index")
    val alpha by transition.animateFloat(
        initialValue = TYPING_MIN_ALPHA,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = TYPING_PULSE_MS),
            repeatMode = RepeatMode.Reverse,
            initialStartOffset = StartOffset(index * TYPING_DELAY_MS),
        ),
        label = "typingDotAlpha$index",
    )
    TypingDot(color, alpha)
}

@Composable
private fun TypingDot(color: Color, alpha: Float) {
    Spacer(
        Modifier
            .size(5.dp)
            .alpha(alpha)
            .clip(CircleShape)
            .background(color),
    )
}

private const val TYPING_DOT_COUNT = 3
private const val TYPING_DELAY_MS = 180
private const val TYPING_PULSE_MS = 600
private const val TYPING_MIN_ALPHA = 0.3f
private const val TYPING_STILL_ALPHA = 0.65f
