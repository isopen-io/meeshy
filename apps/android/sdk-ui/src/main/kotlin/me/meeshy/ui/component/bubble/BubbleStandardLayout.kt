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
import androidx.compose.foundation.layout.wrapContentSize
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
import me.meeshy.sdk.model.BubbleSecondaryPanel
import me.meeshy.sdk.model.RetryBarState
import me.meeshy.sdk.model.BubbleSkinLaw
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
        val skin = LocalBubbleSkin.current
        val isFreeEmoji =
            content.emojiOnlyCount > 0 && content.replyToText == null && !content.isDeleted
        val onColor = when {
            isFreeEmoji -> MeeshyTheme.tokens.textPrimary
            content.isOutgoing -> skin.ink
            else -> MeeshyTheme.tokens.textPrimary
        }
        val isDark = MeeshyTheme.isDark
        val receivedTint = remember(content.senderColorHex, isDark) {
            ReceivedBubbleTint.of(content.senderColorHex, isDark)
        }
        val bubbleBackground = when {
            isFreeEmoji -> Color.Transparent
            content.isOutgoing -> if (skin == BubbleSkin.Brand) outgoingColor else skin.sentFill
            else -> receivedTint.fill
        }
        val bubbleBorder = if (isFreeEmoji || content.isOutgoing) null else receivedTint.stroke
        Column(horizontalAlignment = if (content.isOutgoing) Alignment.End else Alignment.Start) {
            // iOS pose « épinglé » et « Transféré » au-dessus de la bulle, hors de son fond.
            BubbleTopChrome(content)
            // iOS `detachedStoryCitation` : la story répondue est CITÉE au-dessus de la bulle, hors de
            // son fond — jamais aplatie sur une ligne (une humeur garde sa ligne, dans la bulle).
            content.storyReply?.takeUnless { it.isMood }?.let { story ->
                StoryCitationCard(
                    story = story,
                    accentColor = options.accentColor,
                    onOpen = callbacks.onStoryCitationClick,
                    modifier = Modifier.padding(bottom = MeeshySpacing.xs),
                )
            }
            BubbleReactionsAnchor(content = content, accent = options.accentColor, callbacks = callbacks) {
                val sticker = content.drawnSticker
                if (sticker != null) {
                    BubbleBlurRevealBoundary(messageId = content.messageId, spec = content.blurReveal) {
                        BubbleStickerBody(content = content, sticker = sticker, onLongPress = callbacks.onLongPress)
                    }
                } else if (isVisualMediaOnly(content)) {
                    VisualMediaBody(content = content, callbacks = callbacks)
                } else if (isFreeEmoji && content.blurReveal == null) {
                    // La story citée reste au-dessus de l'emoji, hors de tout fond (iOS
                    // `detachedStoryCitation`) ; l'emoji flotte dessous.
                    Column(horizontalAlignment = if (content.isOutgoing) Alignment.End else Alignment.Start) {
                        FreeEmojiBody(content = content, callbacks = callbacks)
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
    val bubbleShape = RoundedCornerShape(BubbleSkinLaw.CORNER_RADIUS_DP.dp)
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
        BubbleFailedRetryEdge(isFailed = isFailed, failure = BubbleFailure.of(content), onColor = onColor, onRetry = callbacks.onRetry) {
        BubbleBodyFooterLayout(
            body = {
                // iOS : le corps est rembourré 14 × 10 (BubbleStandardLayout+TextBubble).
                Column(
                    modifier = Modifier.padding(horizontal = MeeshySpacing.mdPlus, vertical = MeeshySpacing.smPlus),
                ) {
                    BubbleReplySection(content, onColor, callbacks.onReplyPreviewClick, callbacks.onQuotedAudioClick)
                    if (content.storyReply?.isMood == true) {
                        StoryReplyPreview(
                            story = content.storyReply,
                            accentColor = onColor,
                            modifier = Modifier.padding(bottom = MeeshySpacing.xs),
                        )
                    }
                    BubbleAttachmentSections(content, onColor, callbacks, audioPlayback, accent = options.accentColor)
                    BubbleTextBody(content, onColor, options.decor)
                    if (!content.isDeleted) {
                        BubbleSecondaryContent(
                            panel = remember(content.openSecondaryCode, content.secondaryTexts, content.languageStrip) {
                                BubbleSecondaryPanel.of(
                                    content.openSecondaryCode,
                                    content.languageStrip.firstOrNull { it.isActive }?.code,
                                    content.secondaryTexts,
                                )
                            },
                            onColor = onColor,
                            tint = options.accentColor,
                            decor = options.decor,
                            linksActive = content.senderHasAccount,
                        )
                    }
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
                    onTranslate = callbacks.onTranslate,
                    onSenderTap = callbacks.onSenderTap,
                    onShowReadStatus = callbacks.onShowReadStatus,
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
private val RetryBandWidth = RetryBarState.BAND_WIDTH_DP.dp

/**
 * Envoi échoué, port d'iOS `BubbleFailedRetryBar` : une bande orange de 32 dp INTÉGRÉE au bord
 * droit de la bulle (rognée par son coin arrondi), le contenu décalé d'autant pour que l'heure
 * reste lisible ; un tap renvoie. Refusé pour le lieu d'un fichier (#13550) ou média perdu (#13554), la bulle le dit et le tap la retire.
 * Sans échec, le contenu passe tel quel.
 */
@Composable
private fun BubbleFailedRetryEdge(
    isFailed: Boolean,
    failure: BubbleFailure,
    onColor: Color,
    onRetry: (() -> Unit)?,
    content: @Composable () -> Unit,
) {
    if (!isFailed) {
        content()
        return
    }
    Box {
        Column(modifier = Modifier.padding(end = RetryBandWidth)) {
            content()
            if (failure.explains) {
                BubbleFailureCaption(
                    failure = failure,
                    color = onColor,
                    modifier = Modifier.padding(start = MeeshySpacing.mdPlus, end = MeeshySpacing.mdPlus, bottom = MeeshySpacing.sm),
                )
            }
        }
        BubbleFailedRetryBar(
            failure = failure,
            onRetry = onRetry,
            modifier = Modifier.matchParentSize().wrapContentSize(Alignment.CenterEnd),
        )
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
    val showsAdd = !content.isOutgoing && content.isLastReceivedMessage
    Box {
        bubble()
        ReactionStrip(
            reactions = content.reactions,
            accent = accent,
            showsAddButton = showsAdd,
            onReactionClick = callbacks.onReactionClick,
            onReactionLongPress = callbacks.onReactionLongPress,
            onAddReaction = callbacks.onAddReaction,
            messageId = content.messageId,
            onOpenReactPicker = callbacks.onOpenReactPicker,
            expandsAddHit = showsAdd,
            modifier = Modifier
                .align(if (content.isOutgoing) Alignment.BottomStart else Alignment.BottomEnd)
                .offset(
                    x = if (content.isOutgoing) (-4).dp else 4.dp,
                    y = if (showsAdd) ReactionsRestingOffset - AddHitOverflow else ReactionsRestingOffset,
                ),
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
            onShowReadStatus = callbacks.onShowReadStatus,
            onRetry = callbacks.onRetry,
            retryBandShown = false,
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
private fun FreeEmojiBody(content: BubbleContent, callbacks: BubbleCallbacks) {
    val onLongPress = callbacks.onLongPress
    val fontSize = EmojiDetector.fontSizeSp(content.emojiOnlyCount) ?: return
    Row(
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xsPlus),
        modifier = if (onLongPress == null) Modifier
        else Modifier.combinedClickable(onClick = {}, onLongClick = onLongPress),
    ) {
        Text(
            text = content.text.trim(),
            // Le cadre loge toute l'encre du glyphe, sans la réserve de police d'Android (#14534).
            style = largeEmojiTextStyle(fontSize.sp),
            modifier = Modifier.alignByBaseline(),
        )
        BubbleMetaTrailing(
            content = content,
            metaColor = MeeshyTheme.tokens.textMuted,
            onShowReadStatus = callbacks.onShowReadStatus,
            onRetry = callbacks.onRetry,
            retryBandShown = false,
            modifier = Modifier.alignByBaseline(),
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
            shape = RoundedCornerShape(BubbleSkinLaw.CORNER_RADIUS_DP.dp),
        ) { content() }
    }
}
