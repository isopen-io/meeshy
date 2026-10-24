package me.meeshy.ui.component.bubble

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.MessageEffects
import me.meeshy.ui.R
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.layout.LocalMeeshyWindowInfo
import me.meeshy.ui.layout.bubbleWidthCap
import me.meeshy.ui.layout.currentWindowWidthClass
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Rendering options of a standard bubble that are not callbacks: the visual-effect override and
 * its played flag, the pre-composed accessibility label of a non-interactive render site, and the
 * host-resolved text decorations.
 */
internal class BubbleRenderOptions(
    val effects: MessageEffects?,
    val hasPlayedAppearance: Boolean,
    val accessibilityLabel: String?,
    val decor: BubbleTextDecor,
)

/**
 * The signed chat bubble (a turn at talk, not a tombstone nor a notice). Aligns the bubble to the
 * sender's side with the run-aware vertical gaps, resolves its colours (a free emoji message has
 * no fill), then stacks top to bottom: pin indicator above the shape, then inside the shape —
 * behind the blur/view-once protection when present — forwarded badge, sender name, quoted reply,
 * story card, attachments, text body, Prisme flags, reactions and footer.
 */
@Composable
internal fun BubbleStandardLayout(
    content: BubbleContent,
    outgoingColor: Color,
    callbacks: BubbleCallbacks,
    audioPlayback: BubbleAudioPlayback?,
    options: BubbleRenderOptions,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(
                start = MeeshySpacing.lg,
                end = MeeshySpacing.lg,
                // Consecutive-sender runs stack tightly: only the first message of a
                // run gets a top gap and only the last a bottom gap, so a run reads
                // as one visual block while distinct messages keep their 4dp breathing
                // room (isFirst && isLast).
                top = if (content.isFirstInGroup) MeeshySpacing.xs else MeeshySpacing.none,
                bottom = if (content.isLastInGroup) MeeshySpacing.xs else MeeshySpacing.none,
            ),
        horizontalArrangement = if (content.isOutgoing) Arrangement.End else Arrangement.Start,
    ) {
        val isFreeEmoji =
            content.emojiOnlyCount > 0 && content.replyToText == null && !content.isDeleted
        val onColor = when {
            isFreeEmoji -> MeeshyTheme.tokens.textPrimary
            content.isOutgoing -> MeeshyPalette.White
            else -> MeeshyTheme.tokens.textPrimary
        }
        val bubbleBackground = when {
            isFreeEmoji -> Color.Transparent
            content.isOutgoing -> outgoingColor
            else -> MeeshyTheme.tokens.backgroundTertiary
        }
        Column(horizontalAlignment = if (content.isOutgoing) Alignment.End else Alignment.Start) {
            if (content.pinnedAtIso != null && !content.isDeleted) BubblePinnedIndicator()
            BubbleBlurRevealBoundary(messageId = content.messageId, spec = content.blurReveal) {
                BubbleBody(
                    content = content,
                    onColor = onColor,
                    bubbleBackground = bubbleBackground,
                    callbacks = callbacks,
                    audioPlayback = audioPlayback,
                    options = options,
                )
            }
        }
    }
}

/** The rounded bubble shape and its vertical sections. */
@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun BubbleBody(
    content: BubbleContent,
    onColor: Color,
    bubbleBackground: Color,
    callbacks: BubbleCallbacks,
    audioPlayback: BubbleAudioPlayback?,
    options: BubbleRenderOptions,
) {
    val accessibilityLabel = options.accessibilityLabel
    val onLongPress = callbacks.onLongPress
    val widthClass = currentWindowWidthClass()
    val windowWidthDp = LocalMeeshyWindowInfo.current?.widthDp
        ?: LocalConfiguration.current.screenWidthDp.toFloat()
    Column(
        modifier = Modifier
            // 70 % de la rangee (62 % plafonnes a 560 dp en fenetre large) : la gouttiere opposee
            // distingue envoye et recu, sur telephone comme en split-screen (DeviceLayout.bubbleMaxWidth).
            .bubbleWidthCap(
                widthClass = widthClass,
                windowWidthDp = windowWidthDp,
                horizontalGutter = MeeshySpacing.lg * 2,
            )
            .let { base ->
                if (accessibilityLabel == null) base
                else base.clearAndSetSemantics { contentDescription = accessibilityLabel }
            }
            .messageEffects(
                // Drive the visual-treatment modifier from the resolved bubble
                // content by default (so received messages actually glow / pulse);
                // the `effects` param stays an optional override for previews/tests.
                effects = options.effects ?: content.effects,
                hasPlayedAppearance = options.hasPlayedAppearance,
                shape = RoundedCornerShape(MeeshyRadius.xl),
                // Seed the one-shot appearance burst on a stable per-message value so a
                // confetti/fireworks message renders the same reproducible burst across
                // recompositions (a scroll off/on never re-rolls it — surpasses iOS).
                appearanceSeed = content.messageId.hashCode().toLong(),
            )
            .clip(RoundedCornerShape(MeeshyRadius.xl))
            .background(bubbleBackground)
            .let { base ->
                if (onLongPress == null) base
                else base.combinedClickable(onClick = {}, onLongClick = onLongPress)
            }
            .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.sm),
    ) {
        if (content.isForwarded) BubbleForwardedBadge(content.forwardedFromName, onColor)
        if (content.showSenderName && content.senderName != null) {
            Text(
                text = content.senderName,
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.SemiBold,
                color = onColor,
            )
        }
        BubbleReplySection(content, onColor, callbacks.onReplyPreviewClick)
        if (content.storyReply != null) {
            StoryReplyPreview(
                story = content.storyReply,
                accentColor = onColor,
                modifier = Modifier.padding(bottom = MeeshySpacing.xs),
            )
        }
        BubbleAttachmentSections(content, onColor, callbacks, audioPlayback)
        BubbleTextBody(content, onColor, options.decor)
        if (!content.isDeleted && content.languageStrip.isNotEmpty()) {
            LanguageStrip(
                chips = content.languageStrip,
                onColor = onColor,
                onFlagTap = callbacks.onFlagTap,
                modifier = Modifier.padding(top = MeeshySpacing.xs),
            )
        }
        if (content.reactions.isNotEmpty()) {
            ReactionStrip(
                reactions = content.reactions,
                onReactionClick = callbacks.onReactionClick,
                onReactionLongPress = callbacks.onReactionLongPress,
                modifier = Modifier.padding(top = MeeshySpacing.xs),
            )
        }
        BubbleFooterRow(content = content, onColor = onColor)
    }
}

/** "Forwarded" / "Forwarded from <conversation>" italic badge at the top of the bubble. */
@Composable
private fun BubbleForwardedBadge(forwardedFromName: String?, onColor: Color) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier.padding(bottom = MeeshySpacing.xs),
    ) {
        Icon(
            imageVector = MeeshyIcons.Send,
            contentDescription = null,
            tint = onColor.copy(alpha = 0.6f),
            modifier = Modifier.size(13.dp),
        )
        Text(
            text = forwardedFromName
                ?.let { stringResource(R.string.bubble_forwarded_from, it) }
                ?: stringResource(R.string.bubble_forwarded),
            style = MaterialTheme.typography.labelSmall,
            fontStyle = FontStyle.Italic,
            color = onColor.copy(alpha = 0.6f),
            modifier = Modifier.padding(start = 3.dp),
        )
    }
}

/**
 * Conceals its [content] behind the "tap to reveal" fog + blur when [spec] is non-null;
 * otherwise renders the bubble body unchanged (zero cost for a normal message). The
 * boundary clips the conceal to the bubble's rounded shape so the fog never bleeds past
 * the corners.
 */
@Composable
private fun BubbleBlurRevealBoundary(
    messageId: String,
    spec: BubbleBlurRevealSpec?,
    content: @Composable () -> Unit,
) {
    if (spec == null) {
        content()
    } else {
        BubbleBlurReveal(
            messageId = messageId,
            spec = spec,
            shape = RoundedCornerShape(MeeshyRadius.xl),
        ) { content() }
    }
}
