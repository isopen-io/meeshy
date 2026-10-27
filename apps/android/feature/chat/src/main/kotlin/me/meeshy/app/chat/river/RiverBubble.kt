package me.meeshy.app.chat.river

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import me.meeshy.feature.chat.R
import me.meeshy.sdk.model.profile.ProfileSheetUser
import me.meeshy.sdk.model.reading.focal.FocalMetrics
import me.meeshy.sdk.model.reading.focal.LongMessageExcerpt
import me.meeshy.sdk.model.reading.river.RiverMetrics
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.component.bubble.BubbleBlurReveal
import me.meeshy.ui.component.bubble.RichMessageText
import me.meeshy.ui.component.rememberPresence
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.R as UiR

/**
 * Tout ce qu'une bulle de la Rivière peut déclencher, DIT par l'écran. Un seul objet stable sert
 * toutes les bulles : aucune fermeture par rangée, donc une bulle dont le contenu n'a pas changé
 * saute sa recomposition.
 */
@Immutable
internal class RiverBubbleActions(
    /** Un tap sur la bulle : le curseur s'y pose. */
    val onTap: (messageId: String) -> Unit = {},
    val onLongPress: (messageId: String) -> Unit = {},
    /** La citation mène à sa cible. */
    val onOpenReply: (targetMessageId: String) -> Unit = {},
    val onOpenProfile: (ProfileSheetUser) -> Unit = {},
    val onOpenInThread: (messageId: String) -> Unit = {},
)

private val BubbleTextStyle = TextStyle(fontSize = 15.sp, lineHeight = (15f * FocalMetrics.Text.LINE_HEIGHT_RATIO.toFloat()).sp)

/**
 * Une bulle de la Rivière. [contentWidth] est la largeur utile du couloir (ou celle de TOUTES les
 * colonnes, pour un avis système pleine largeur). Le contour coloré reprend la ligne de la branche,
 * joint en pointillé à ses voisines d'un même groupe.
 */
@Composable
internal fun RiverBubble(
    content: RiverBubbleContent,
    contentWidth: Dp,
    actions: RiverBubbleActions,
    modifier: Modifier = Modifier,
) {
    Column(modifier.width(contentWidth)) {
        if (!content.groupPosition.joinsAbove) Spacer(Modifier.height(RiverMetrics.Row.GAP.dp))
        if (content.bubble.isSystem) {
            SystemNotice(content)
        } else {
            SpeechRow(content, contentWidth, actions)
        }
    }
}

@Composable
private fun SystemNotice(content: RiverBubbleContent) {
    val muted = MeeshyTheme.tokens.textMuted
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xxs),
        modifier = Modifier
            .fillMaxWidth()
            .semantics(mergeDescendants = true) { contentDescription = content.text },
    ) {
        if (content.timeString.isNotEmpty()) {
            Text(content.timeString, fontSize = 9.5.sp, fontWeight = FontWeight.SemiBold, color = muted.copy(alpha = muted.alpha * 0.7f))
        }
        Text(content.text, fontSize = 12.5.sp, fontWeight = FontWeight.Medium, color = muted, textAlign = TextAlign.Center)
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun SpeechRow(content: RiverBubbleContent, contentWidth: Dp, actions: RiverBubbleActions) {
    val laneColor = remember(content.colorSeed) { riverLaneColor(content.colorSeed) }
    val messageId = content.bubble.messageId
    val openInThread = stringResource(R.string.riviere_bubble_open_in_thread)
    val moreActions = stringResource(R.string.riviere_bubble_actions)
    val spoken = spokenLabel(content)
    Column(
        verticalArrangement = Arrangement.spacedBy(RiverMetrics.Bubble.BASE_GAP.dp),
        modifier = Modifier
            .alpha(if (content.isPending) 0.7f else 1f)
            .semantics(mergeDescendants = true) {
                contentDescription = spoken
                customActions = listOf(
                    CustomAccessibilityAction(openInThread) { actions.onOpenInThread(messageId); true },
                    CustomAccessibilityAction(moreActions) { actions.onLongPress(messageId); true },
                )
            }
            .combinedClickable(onClick = { actions.onTap(messageId) }, onLongClick = { actions.onLongPress(messageId) }),
    ) {
        if (content.bubble.isFirstInGroup) IdentityHeader(content, laneColor, contentWidth, actions)
        MessageBox(content, contentWidth, laneColor, actions)
    }
}

@Composable
private fun spokenLabel(content: RiverBubbleContent): String {
    val body = when {
        content.protection == RiverProtection.END_TO_END_SEALED -> stringResource(UiR.string.bubble_message_end_to_end)
        content.protection == RiverProtection.BURNED -> stringResource(UiR.string.bubble_burned_a11y)
        content.blurReveal != null -> ""
        else -> content.text
    }
    val reply = content.replyPreview?.let { stringResource(R.string.riviere_bubble_reply_to, it.authorDisplayName) }
    return listOfNotNull(content.senderDisplayName, body.ifBlank { null }, content.timeString.ifBlank { null }, reply)
        .joinToString(", ")
}

@Composable
private fun MessageBox(content: RiverBubbleContent, contentWidth: Dp, laneColor: Color, actions: RiverBubbleActions) {
    val tokens = MeeshyTheme.tokens
    val shape = remember(content.groupPosition) { riverBubbleShape(content.groupPosition) }
    val pad = RiverMetrics.Bubble.CONTENT_PADDING.dp
    Column(
        verticalArrangement = Arrangement.spacedBy(RiverMetrics.Bubble.BASE_GAP.dp),
        modifier = Modifier
            .width(contentWidth)
            .clip(shape)
            .background(tokens.backgroundSecondary, shape)
            .riverBubbleOutline(content.groupPosition, content.layout, laneColor, tokens.hairline)
            .padding(pad),
    ) {
        if (content.isForwarded) ForwardedLine(content.forwardedFromName)
        content.replyPreview?.let { QuotedReply(it, content.bubble.replyToMessageId, laneColor, actions) }
        BubbleBody(content, laneColor)
        if (content.timeString.isNotEmpty()) {
            Text(
                text = content.timeString,
                color = metaTint(),
                fontSize = FocalMetrics.Time.SIZE.toFloat().sp,
                textAlign = TextAlign.End,
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

@Composable
private fun metaTint(): Color =
    if (MeeshyTheme.isDark) {
        Color.White.copy(alpha = FocalMetrics.MetaText.DARK_OPACITY.toFloat())
    } else {
        Color.Black.copy(alpha = FocalMetrics.MetaText.LIGHT_OPACITY.toFloat())
    }

@Composable
private fun ForwardedLine(from: String?) {
    Text(
        text = from?.let { stringResource(UiR.string.bubble_forwarded_from, it) } ?: stringResource(UiR.string.bubble_forwarded),
        color = metaTint(),
        fontSize = 12.sp,
        fontStyle = FontStyle.Italic,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
    )
}

/** La citation tient sur UNE ligne, sous un rail à la couleur de la voix ; elle mène à sa cible. */
@Composable
private fun QuotedReply(reply: RiverReplyPreview, targetId: String?, laneColor: Color, actions: RiverBubbleActions) {
    val hint = stringResource(R.string.riviere_bubble_reply_hint)
    Row(
        Modifier
            .height(IntrinsicSize.Min)
            .let { base ->
                if (targetId == null) base
                else base.clickable(onClickLabel = hint) { actions.onOpenReply(targetId) }
            },
    ) {
        Box(
            Modifier
                .width(FocalMetrics.Quote.RAIL_WIDTH.toFloat().dp)
                .fillMaxHeight()
                .background(laneColor.copy(alpha = 0.6f)),
        )
        Text(
            text = "${reply.authorDisplayName} · ${reply.text}",
            color = metaTint(),
            fontSize = (BubbleTextStyle.fontSize.value - 2f).sp,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(start = MeeshySpacing.sm),
        )
    }
}

@Composable
private fun BubbleBody(content: RiverBubbleContent, laneColor: Color) {
    when (content.protection) {
        RiverProtection.END_TO_END_SEALED -> MutedLine(stringResource(UiR.string.bubble_message_end_to_end))
        RiverProtection.BURNED -> MutedLine(stringResource(UiR.string.bubble_burned))
        RiverProtection.NONE -> {
            if (content.text.isBlank()) return
            val spec = content.blurReveal
            if (spec == null) {
                RiverText(content, laneColor)
            } else {
                BubbleBlurReveal(content.bubble.messageId, spec, shape = RoundedCornerShape(MeeshyRadius.md)) {
                    RiverText(content, laneColor)
                }
            }
        }
    }
}

@Composable
private fun MutedLine(text: String) {
    Text(text, style = BubbleTextStyle, fontStyle = FontStyle.Italic, color = MeeshyTheme.tokens.textMuted)
}

/** Le texte PRISME servi par le fil ; un message très long se replie sur son extrait. */
@Composable
private fun RiverText(content: RiverBubbleContent, laneColor: Color) {
    val excerpt = remember(content.text) { LongMessageExcerpt.of(content.text) }
    var expanded by rememberSaveable(content.bubble.messageId) { mutableStateOf(false) }
    RichMessageText(
        text = if (excerpt.truncated && !expanded) excerpt.excerpt + "…" else content.text,
        color = MeeshyTheme.tokens.textPrimary,
        style = BubbleTextStyle,
        linkColor = laneColor,
    )
    if (excerpt.truncated) {
        Text(
            text = stringResource(if (expanded) UiR.string.message_long_collapse else UiR.string.message_long_read_more),
            fontSize = 13.sp,
            fontWeight = FontWeight.SemiBold,
            color = laneColor,
            modifier = Modifier
                .clip(RoundedCornerShape(MeeshyRadius.sm))
                .clickable { expanded = !expanded }
                .padding(vertical = MeeshySpacing.xxs),
        )
    }
}

/** L'en-tête d'identité de la tête de groupe : pastille 22, nom à la couleur de la voix, fiche au toucher. */
@Composable
private fun IdentityHeader(content: RiverBubbleContent, laneColor: Color, contentWidth: Dp, actions: RiverBubbleActions) {
    val identity = content.identity
    val profile = identity?.profile
    val viewProfile = stringResource(UiR.string.bubble_view_profile)
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xsPlus),
        modifier = Modifier
            .width(contentWidth)
            .let { base ->
                if (profile == null) base
                else base.clip(RoundedCornerShape(MeeshyRadius.sm)).clickable(onClickLabel = viewProfile) { actions.onOpenProfile(profile) }
            },
    ) {
        MeeshyAvatar(
            name = content.senderDisplayName,
            size = FocalMetrics.Avatar.SIZE.toFloat().dp,
            containerColor = laneColor,
            storyRing = identity?.storyRing ?: me.meeshy.ui.component.StoryRingState.None,
            presence = rememberPresence(identity?.userId),
            imageUrl = identity?.avatarUrl,
        )
        Text(
            text = content.senderDisplayName,
            color = laneColor,
            fontSize = 13.sp,
            fontWeight = FontWeight.ExtraBold,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.widthIn(max = contentWidth * RiverMetrics.Bubble.IDENTITY_NAME_MAX_WIDTH.toFloat()),
        )
    }
}
