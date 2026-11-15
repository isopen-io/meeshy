package me.meeshy.app.chat

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import me.meeshy.feature.chat.R
import me.meeshy.sdk.model.ConversationEngagementSnapshot
import me.meeshy.sdk.model.ConversationPointsForm
import me.meeshy.sdk.model.engagement.EngagementPillTap
import me.meeshy.sdk.model.engagement.HeaderFlameLaw
import me.meeshy.sdk.model.format.CompactCountFormat
import me.meeshy.ui.format.rememberReaderLocale
import me.meeshy.ui.theme.MeeshyTheme

/**
 * La pastille d'engagement de l'en-tête déplié (iOS `ConversationEngagementPill`) : « 🔥 4 · 1,2 k »
 * tant qu'une série court ; le cumul SEUL, sans flamme et à l'encre tertiaire, sans série ; rien si
 * le cumul est nul. [snapshot] est déjà relu au jour du lecteur.
 *
 * Le toucher fait ce que fait la flamme repliée (#17987, [HeaderFlameLaw.pillTap], iOS
 * `ConversationEngagementBadge`) : la série ouvre la MÊME carte ([HeaderFlameCardMenu]), le cumul
 * seul mène à « Ma Légende ».
 */
@Composable
internal fun ChatHeaderEngagementPill(
    snapshot: ConversationEngagementSnapshot?,
    modifier: Modifier = Modifier,
    onOpenProgression: () -> Unit = {},
    onHideFlame: () -> Unit = {},
) {
    val form = ConversationPointsForm.of(snapshot) ?: return
    val tap = HeaderFlameLaw.pillTap(snapshot) ?: return
    val locale = rememberReaderLocale()
    val totalText = remember(form.totalPoints, locale) { CompactCountFormat.text(form.totalPoints, locale) }
    val description = flameDescription(snapshot!!)
    val hint = stringResource(
        if (tap is EngagementPillTap.FlameCard) R.string.chat_header_flame_card_hint else R.string.chat_header_flame_card_open,
    )
    var cardOpen by remember { mutableStateOf(false) }
    Box(modifier = modifier) {
        PillBody(
            form = form,
            totalText = totalText,
            modifier = Modifier
                .testTag("chat.header.engagement")
                .clickable(onClickLabel = hint) {
                    when (tap) {
                        is EngagementPillTap.FlameCard -> cardOpen = !cardOpen
                        EngagementPillTap.Legend -> onOpenProgression()
                    }
                }
                .clearAndSetSemantics { contentDescription = description },
        )
        HeaderFlameCardMenu(
            card = (tap as? EngagementPillTap.FlameCard)?.card,
            expanded = cardOpen,
            onClose = { cardOpen = false },
            onOpenProgression = onOpenProgression,
            onHide = onHideFlame,
        )
    }
}

@Composable
private fun PillBody(form: ConversationPointsForm, totalText: String, modifier: Modifier) {
    Row(
        modifier = modifier,
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
