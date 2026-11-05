package me.meeshy.ui.component.bubble

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.sp
import me.meeshy.sdk.model.ArrivalGreeting
import me.meeshy.ui.format.bubbleClockLabel
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * La ligne d'un avis système : centrée, petite, secondaire, SANS bulle (iOS `BubbleSystemNoticeView`
 * et `BubbleJoinNoticeView`). L'heure du fil se grave en petit au-dessus ; le texte est celui que
 * [BubbleContentBuilder] a composé chez le lecteur (capture, arrivées) ou le repli du `content`.
 *
 * - un avis d'arrivée ([BubbleContent.joinNotice]) se rend par [JoinNoticeCard] (BubbleJoinNotice.kt) ;
 * - la ligne d'arrivées groupées ([BubbleContent.isArrivalsNotice]) porte son invite « dis-leur salut » EN GRAS ;
 *   elle est touchable quand l'hôte pose [BubbleCallbacks.onSayHi], qui écrit les `@mentions` des arrivants (#16338).
 */
@Composable
internal fun SystemNoticeLine(content: BubbleContent, callbacks: BubbleCallbacks, modifier: Modifier = Modifier) {
    val join = content.joinNotice
    if (join != null && join.primaryName.isNotEmpty()) {
        JoinNoticeCard(
            join = join,
            createdAtIso = content.createdAtIso,
            onOpenProfile = callbacks.onOpenJoinProfile,
            modifier = modifier,
            onSayHi = callbacks.onSayHi,
        )
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
        Text(
            text = if (content.isArrivalsNotice) arrivalsLine(content.text) else AnnotatedString(content.text),
            fontSize = 12.5.sp,
            fontWeight = FontWeight.Medium,
            color = muted,
            textAlign = TextAlign.Center,
        )
    }
}

/** La phrase d'arrivées, son invite finale « dis-leur salut » en GRAS (#16338). */
internal fun arrivalsLine(text: String): AnnotatedString {
    val split = ArrivalGreeting.splitInvite(text)
    val invite = split.invite ?: return AnnotatedString(text)
    return buildAnnotatedString {
        append(split.lead)
        withStyle(SpanStyle(fontWeight = FontWeight.Bold)) { append(invite) }
    }
}
