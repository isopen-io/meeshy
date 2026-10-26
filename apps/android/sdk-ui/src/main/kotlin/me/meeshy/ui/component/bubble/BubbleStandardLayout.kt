package me.meeshy.ui.component.bubble

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import me.meeshy.sdk.model.MessageEffects
import me.meeshy.ui.R
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.layout.LocalMeeshyWindowInfo
import me.meeshy.ui.layout.bubbleWidthCap
import me.meeshy.ui.layout.currentWindowWidthClass
import me.meeshy.ui.theme.MeeshyMediaChromeColors
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.hexColor
import me.meeshy.sdk.theme.DynamicColorGenerator

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
    /** L'accent de la conversation : réactions, liens et citations (pas le fond envoyé). */
    val accentColor: Color = MeeshyPalette.Indigo500,
    val bodyAccessory: (@Composable (onColor: Color) -> Unit)? = null,
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
                // iOS : la cellule a 8 de marge de chaque côté (MessageListView, MeeshySpacing.sm),
                // aucune marge haute, 2 sous une bulle au sein d'une suite et 6 en fin de suite.
                start = MeeshySpacing.sm,
                end = MeeshySpacing.sm,
                top = MeeshySpacing.none,
                // Une bande de réactions déborde de 18 dp sous la bulle : la rangée lui fait place.
                bottom = when {
                    hasReactionsOverlay(content) -> if (content.isLastInGroup) MeeshySpacing.xxxl else 31.dp
                    content.isLastInGroup -> MeeshySpacing.xsPlus
                    else -> MeeshySpacing.xxs
                },
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
        val isDark = MeeshyTheme.isDark
        val receivedTint = remember(content.senderColorHex, isDark) {
            ReceivedBubbleTint.of(content.senderColorHex, isDark)
        }
        val bubbleBackground = when {
            isFreeEmoji -> Color.Transparent
            content.isOutgoing -> outgoingColor
            else -> receivedTint.fill
        }
        val bubbleBorder = if (isFreeEmoji || content.isOutgoing) null else receivedTint.stroke
        Column(horizontalAlignment = if (content.isOutgoing) Alignment.End else Alignment.Start) {
            if (content.pinnedAtIso != null && !content.isDeleted) BubblePinnedIndicator()
            // iOS pose le badge « Transféré » au-dessus de la bulle, hors de son fond.
            if (content.isForwarded && !content.isDeleted) {
                BubbleForwardedBadge(content.forwardedFromName, MeeshyTheme.tokens.textMuted)
            }
            BubbleReactionsAnchor(content = content, accent = options.accentColor, callbacks = callbacks) {
                if (isVisualMediaOnly(content)) {
                    VisualMediaBody(content = content, callbacks = callbacks)
                } else if (isFreeEmoji && content.blurReveal == null) {
                    // La story citée reste au-dessus de l'emoji, hors de tout fond (iOS
                    // `detachedStoryCitation`) ; l'emoji flotte dessous.
                    Column(horizontalAlignment = if (content.isOutgoing) Alignment.End else Alignment.Start) {
                        if (content.storyReply != null) {
                            StoryReplyPreview(
                                story = content.storyReply,
                                accentColor = MeeshyTheme.tokens.textPrimary,
                                modifier = Modifier.padding(bottom = MeeshySpacing.xs),
                            )
                        }
                        FreeEmojiBody(content = content, onLongPress = callbacks.onLongPress)
                    }
                } else {
                    BubbleBlurRevealBoundary(messageId = content.messageId, spec = content.blurReveal) {
                        BubbleBody(
                            content = content,
                            onColor = onColor,
                            bubbleBackground = bubbleBackground,
                            bubbleBorder = bubbleBorder,
                            callbacks = callbacks,
                            audioPlayback = audioPlayback,
                            options = options,
                        )
                    }
                }
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
    bubbleBorder: Color?,
    callbacks: BubbleCallbacks,
    audioPlayback: BubbleAudioPlayback?,
    options: BubbleRenderOptions,
) {
    val bubbleShape = RoundedCornerShape(MeeshyRadius.lgPlus)
    val accessibilityLabel = options.accessibilityLabel
    val onLongPress = callbacks.onLongPress
    val namedActions = callbacks.accessibilityActions
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
                horizontalGutter = MeeshySpacing.sm * 2,
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
                shape = bubbleShape,
                // Seed the one-shot appearance burst on a stable per-message value so a
                // confetti/fireworks message renders the same reproducible burst across
                // recompositions (a scroll off/on never re-rolls it — surpasses iOS).
                appearanceSeed = content.messageId.hashCode().toLong(),
            )
            .clip(bubbleShape)
            .background(bubbleBackground)
            .let { base -> if (bubbleBorder == null) base else base.border(1.dp, bubbleBorder, bubbleShape) }
            .let { base ->
                if (onLongPress == null) base
                else base.combinedClickable(onClick = {}, onLongClick = onLongPress)
            }
            .let { base ->
                if (accessibilityLabel != null || namedActions.isEmpty()) base
                else base.semantics {
                    customActions = namedActions.map { named ->
                        CustomAccessibilityAction(named.label) { named.onAction(); true }
                    }
                }
            },
    ) {
        val isFailed = content.isOutgoing && content.deliveryStatus == DeliveryStatus.Failed
        BubbleFailedRetryEdge(isFailed = isFailed, onRetry = callbacks.onRetry) {
        BubbleBodyFooterLayout(
            body = {
                // iOS : le corps est rembourré 14 × 10 (BubbleStandardLayout+TextBubble).
                Column(
                    modifier = Modifier.padding(horizontal = MeeshySpacing.mdPlus, vertical = MeeshySpacing.smPlus),
                ) {
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
                    if (!content.isDeleted) options.bodyAccessory?.invoke(onColor)
                }
            },
            footer = {
                // iOS `BubbleFooter` : 14 de côté (10 avec l'identité), 0 en haut (8 avec), 8 en bas.
                val hasIdentity = content.showSenderName && !content.isOutgoing && content.senderName != null
                BubbleFooterRow(
                    content = content,
                    onColor = onColor,
                    onFlagTap = callbacks.onFlagTap,
                    onSenderTap = callbacks.onSenderTap,
                    modifier = Modifier.padding(
                        start = if (hasIdentity) MeeshySpacing.smPlus else MeeshySpacing.mdPlus,
                        end = if (hasIdentity) MeeshySpacing.smPlus else MeeshySpacing.mdPlus,
                        top = if (hasIdentity) MeeshySpacing.sm else MeeshySpacing.none,
                        bottom = MeeshySpacing.sm,
                    ),
                )
            },
        )
        }
    }
}

/** Largeur de la bande de renvoi d'un envoi échoué (iOS `retryBandWidth`). */
private val RetryBandWidth = 34.dp

/**
 * Envoi échoué, port d'iOS `BubbleFailedRetryBar` : une bande orange de 34 dp INTÉGRÉE au bord
 * droit de la bulle (rognée par son coin arrondi), le contenu décalé d'autant pour que l'heure
 * reste lisible ; un tap renvoie. Sans échec, le contenu passe tel quel.
 */
@Composable
private fun BubbleFailedRetryEdge(
    isFailed: Boolean,
    onRetry: (() -> Unit)?,
    content: @Composable () -> Unit,
) {
    if (!isFailed) {
        content()
        return
    }
    val label = stringResource(R.string.bubble_failed_retry)
    Box {
        Box(modifier = Modifier.padding(end = RetryBandWidth)) { content() }
        Box(modifier = Modifier.matchParentSize(), contentAlignment = Alignment.CenterEnd) {
        Box(
            contentAlignment = Alignment.Center,
            modifier = Modifier
                .width(RetryBandWidth)
                .fillMaxHeight()
                .background(MeeshyPalette.Warning)
                .let { base -> if (onRetry == null) base else base.clickable(onClickLabel = label, onClick = onRetry) }
                .semantics { contentDescription = label },
        ) {
            Icon(
                imageVector = MeeshyIcons.Refresh,
                contentDescription = null,
                tint = MeeshyPalette.White,
                modifier = Modifier.size(16.dp),
            )
        }
        }
    }
}

/** La bande de réactions est montée : des réactions, ou le smiley d'ajout du dernier message reçu. */
private fun hasReactionsOverlay(content: BubbleContent): Boolean =
    !content.isDeleted && (content.reactions.isNotEmpty() || (!content.isOutgoing && content.isLastReceivedMessage))

/**
 * Pose la bande de réactions HORS de la bulle, à cheval sur son bord bas (iOS
 * `BubbleReactionsOverlay`) : coin bas côté centre — à droite d'une bulle reçue, à gauche d'une
 * bulle envoyée — décalée de 4 dp vers l'extérieur et de 18 dp vers le bas.
 */
@Composable
private fun BubbleReactionsAnchor(
    content: BubbleContent,
    accent: Color,
    callbacks: BubbleCallbacks,
    bubble: @Composable () -> Unit,
) {
    if (!hasReactionsOverlay(content)) {
        bubble()
        return
    }
    Box {
        bubble()
        ReactionStrip(
            reactions = content.reactions,
            accent = accent,
            showsAddButton = !content.isOutgoing && content.isLastReceivedMessage,
            onReactionClick = callbacks.onReactionClick,
            onReactionLongPress = callbacks.onReactionLongPress,
            onAddReaction = callbacks.onAddReaction,
            modifier = Modifier
                .align(if (content.isOutgoing) Alignment.BottomStart else Alignment.BottomEnd)
                .offset(x = if (content.isOutgoing) (-4).dp else 4.dp, y = ReactionsRestingOffset),
        )
    }
}

/**
 * Un message fait seulement d'images (ni texte, ni citation, ni autre pièce) : iOS rend la grille
 * visuelle sans bulle, rayon 16, l'heure dans une capsule sombre posée en bas à droite.
 */
private fun isVisualMediaOnly(content: BubbleContent): Boolean =
    !content.isDeleted && content.images.isNotEmpty() && content.text.isBlank() &&
        content.files.isEmpty() && content.locations.isEmpty() && content.audios.isEmpty() &&
        content.contactCards.isEmpty() && content.replyToText == null && content.replyToId == null &&
        content.storyReply == null && content.blurReveal == null &&
        !(content.showSenderName && !content.isOutgoing && content.senderName != null)

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun VisualMediaBody(content: BubbleContent, callbacks: BubbleCallbacks) {
    val onLongPress = callbacks.onLongPress
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(MeeshyRadius.lg))
            .let { base ->
                if (onLongPress == null) base else base.combinedClickable(onClick = {}, onLongClick = onLongPress)
            },
    ) {
        BubbleImageGrid(images = content.images, onImageClick = callbacks.onImageClick)
        BubbleMetaTrailing(
            content = content,
            metaColor = MeeshyMediaChromeColors.OnMedia,
            readTint = MeeshyPalette.Indigo400,
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .padding(MeeshySpacing.sm)
                .clip(RoundedCornerShape(MeeshyRadius.pill))
                .background(MeeshyMediaChromeColors.Scrim)
                .padding(horizontal = MeeshySpacing.sm, vertical = MeeshySpacing.xxs),
        )
    }
}

/**
 * Emoji seul, sans fond ni bulle (iOS `emojiOnlyContent`) : l'emoji agrandi et un pied compact —
 * heure 12 sp + coche — posés sur la même ligne de base, en un bloc collé au bord de l'auteur.
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun FreeEmojiBody(content: BubbleContent, onLongPress: (() -> Unit)?) {
    val fontSize = EmojiDetector.fontSizeSp(content.emojiOnlyCount) ?: return
    Row(
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xsPlus),
        modifier = if (onLongPress == null) Modifier
        else Modifier.combinedClickable(onClick = {}, onLongClick = onLongPress),
    ) {
        Text(
            text = content.text.trim(),
            fontSize = fontSize.sp,
            lineHeight = (fontSize * 1.15f).sp,
            modifier = Modifier.alignByBaseline(),
        )
        BubbleMetaTrailing(
            content = content,
            metaColor = MeeshyTheme.tokens.textMuted,
            modifier = Modifier.alignByBaseline(),
        )
    }
}

/**
 * Corps et pied empilés à 4 dp, port d'iOS `BubbleBodyFooterLayout` : la bulle épouse son contenu
 * (jamais étirée à sa largeur maximale) et le pied prend exactement la largeur retenue — celle du
 * corps, ou la sienne propre si elle est plus large — si bien que l'heure tombe au bord droit.
 */
@Composable
private fun BubbleBodyFooterLayout(
    body: @Composable () -> Unit,
    footer: @Composable () -> Unit,
) {
    Layout(
        content = {
            Box { body() }
            Box { footer() }
        },
    ) { measurables, constraints ->
        val gap = MeeshySpacing.xs.roundToPx()
        val loose = constraints.copy(minWidth = 0, minHeight = 0)
        val bodyPlaceable = measurables[0].measure(loose)
        val footerNatural = measurables[1].maxIntrinsicWidth(Constraints.Infinity)
        val width = maxOf(bodyPlaceable.width, footerNatural, constraints.minWidth)
            .coerceAtMost(constraints.maxWidth)
        val footerPlaceable = measurables[1].measure(
            Constraints(minWidth = width, maxWidth = width, minHeight = 0, maxHeight = constraints.maxHeight),
        )
        val bodyGap = if (bodyPlaceable.height > 0) gap else 0
        val height = bodyPlaceable.height + bodyGap + footerPlaceable.height
        layout(width, height) {
            bodyPlaceable.place(0, 0)
            footerPlaceable.place(0, bodyPlaceable.height + bodyGap)
        }
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
            shape = RoundedCornerShape(MeeshyRadius.lgPlus),
        ) { content() }
    }
}

/**
 * Teinte d'une bulle REÇUE, port d'iOS `BubbleBackground` : la couleur de l'auteur fondue à 30 %
 * dans l'indigo de marque (`otherBubbleColor`), posée OPAQUE sur la surface à 16 % (clair) / 28 %
 * (sombre), et cernée d'un trait de 1 dp de cette même couleur à 26 % / 34 %.
 */
internal class ReceivedBubbleTint(val fill: Color, val stroke: Color) {
    companion object {
        private const val BRAND_INDIGO = "6366F1"
        private const val LIGHT_SURFACE = "FFFFFF"
        private const val DARK_SURFACE = "09090B"

        fun of(senderColorHex: String?, isDark: Boolean): ReceivedBubbleTint {
            val other = DynamicColorGenerator.blendTwo(senderColorHex ?: BRAND_INDIGO, 0.30, BRAND_INDIGO, 0.70)
            val weight = if (isDark) 0.28 else 0.16
            val fill = DynamicColorGenerator.blendTwo(
                other, weight, if (isDark) DARK_SURFACE else LIGHT_SURFACE, 1.0 - weight,
            )
            return ReceivedBubbleTint(
                fill = hexColor(fill, MeeshyPalette.Indigo50),
                stroke = hexColor(other, MeeshyPalette.Indigo500).copy(alpha = if (isDark) 0.34f else 0.26f),
            )
        }
    }
}
