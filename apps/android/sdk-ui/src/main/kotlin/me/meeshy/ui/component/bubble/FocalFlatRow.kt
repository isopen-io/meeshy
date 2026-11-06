package me.meeshy.ui.component.bubble

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.LinearOutSlowInEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.onPlaced
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import me.meeshy.sdk.model.reading.focal.FocalMetrics
import me.meeshy.ui.component.focal.ElectedMetrics
import me.meeshy.ui.component.focal.FocalElectedFrame
import me.meeshy.ui.component.focal.FocalGlassBlock
import me.meeshy.ui.component.focal.FocalIdentityChip
import me.meeshy.sdk.model.reading.focal.LongMessageExcerpt
import me.meeshy.sdk.theme.DynamicColorGenerator
import me.meeshy.ui.R
import me.meeshy.ui.component.focal.FocalAttachmentBlock
import me.meeshy.ui.component.focal.FocalIdentityHeader
import me.meeshy.ui.component.focal.FocalLongMessage
import me.meeshy.ui.component.focal.FocalProtectedContent
import me.meeshy.ui.component.focal.FocalSpecialRowView
import me.meeshy.ui.component.focal.focalSpecialRow
import me.meeshy.sdk.model.reading.focal.FocalSpecialRow
import me.meeshy.ui.component.focal.LocalFlatRowExpansion
import me.meeshy.ui.component.focal.FocalMetaColumn
import me.meeshy.ui.component.focal.FocalQuotedReply
import me.meeshy.ui.component.focal.FocalQuotedReplyView
import me.meeshy.ui.component.focal.FocalRowInput
import me.meeshy.ui.component.focal.FocalStoryCitationQuote
import me.meeshy.ui.sticker.MessageStickerArtwork
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.hexColor

/**
 * La rangée PLATE du fil — port d'iOS `FocalRow`, rendu des modes Script (et Focal au repos).
 * Aucune bulle : en tête de groupe, l'identité (pastille 22 + nom), puis le contenu au retrait
 * de la colonne du nom (29), texte 15 à interligne 1,42, citations à rail de 2,5 ; à droite une
 * colonne méta de 62 au moins, alignée sur la DERNIÈRE ligne, dont l'heure et les coches ne se
 * lisent que pendant le défilement ([metaAlpha], lu au dessin : aucun relayout, aucune
 * recomposition des rangées quand il change). Une rangée = un nœud d'accessibilité.
 */
@Composable
public fun FocalFlatRow(
    content: BubbleContent,
    accentColor: Color,
    modifier: Modifier = Modifier,
    callbacks: BubbleCallbacks = BubbleCallbacks.None,
    audioPlayback: BubbleAudioPlayback? = null,
    mentionDisplayNames: Map<String, String>? = null,
    highlightTerm: String? = null,
    /** Opacité de l'heure et des coches (0 au repos, 1 pendant le défilement et 900 ms après). */
    metaAlpha: () -> Float = { 0f },
    /** L'aperçu de lien du premier lien, sous le texte (même carte que la bulle). */
    bodyAccessory: (@Composable (onColor: Color) -> Unit)? = null,
    /** Focal : la rangée est l'ÉLUE de la scène (cadre, loupe, chips) ; null = rangée Script. */
    focus: FlatRowFocus? = null,
) {
    val renderKind = rememberBubbleRenderKind(
        isDeleted = content.isDeleted,
        expiresAtIso = content.expiresAtIso,
        isViewOnce = content.isViewOnce,
        isViewOnceOpenedByMe = content.isViewOnceOpenedByMe,
        isSystem = content.isSystem,
    )
    AnimatedVisibility(
        visible = !renderKind.isEphemeralExpired,
        modifier = modifier,
        enter = EnterTransition.None,
        exit = fadeOut() + shrinkVertically(),
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = if (content.isFirstInGroup && !renderKind.isSystem) FlatRowMetrics.groupTop else 0.dp)
                .padding(vertical = FlatRowMetrics.paddingVertical, horizontal = FlatRowMetrics.paddingHorizontal)
                // Envoi optimiste : 0,7 tant que le gateway n'a pas accusé (iOS `isOptimistic`).
                .alpha(if (content.isPending) 0.7f else 1f),
        ) {
            val special = remember(content.isDeleted, content.isSystem, content.callSummary, content.joinNotice, content.text) { content.focalSpecialRow() }
            when {
                special != FocalSpecialRow.None -> FocalSpecialRowView(special, content, accentColor, callbacks)
                renderKind.isBurned -> FlatMutedLine(stringResource(R.string.bubble_burned), callbacks.onLongPress)
                else -> FlatStandardBody(
                    content = content,
                    accentColor = accentColor,
                    callbacks = callbacks,
                    audioPlayback = audioPlayback,
                    decor = BubbleTextDecor(mentionDisplayNames, highlightTerm, trackedLinks = null),
                    metaAlpha = metaAlpha,
                    bodyAccessory = bodyAccessory,
                    focus = focus,
                )
            }
        }
    }
}

/** Les cotes de la rangée plate (iOS `FocalMetrics.Row` / `Text` / `MetaColumn`), en dp. */
internal object FlatRowMetrics {
    val paddingVertical = FocalMetrics.Row.PADDING_VERTICAL.toFloat().dp
    val paddingHorizontal = FocalMetrics.Row.PADDING_HORIZONTAL.toFloat().dp
    val groupTop = FocalMetrics.Row.GROUP_TOP_PADDING.toFloat().dp
    val indent = FocalMetrics.Row.CONTENT_INDENT.toFloat().dp
    val avatar = FocalMetrics.Avatar.SIZE.toFloat().dp
    val metaWidth = FocalMetrics.MetaColumn.RESERVED_WIDTH.toFloat().dp
    val metaSpacing = FocalMetrics.MetaColumn.SPACING.toFloat().dp
    val quoteRail = FocalMetrics.Quote.RAIL_WIDTH.toFloat().dp
    val mediaRadius = FocalMetrics.Media.RADIUS.toFloat().dp
    val mediaMaxWidth = 300.dp
    val stickerSide = FocalMetrics.Sticker.SIDE.toFloat().dp
    const val TEXT_SIZE_SP = 15f
    val lineHeightSp = (TEXT_SIZE_SP * FocalMetrics.Text.LINE_HEIGHT_RATIO.toFloat())
    const val TIME_SIZE_SP = 10.5f
}

private val FlatTextStyle = TextStyle(
    fontSize = FlatRowMetrics.TEXT_SIZE_SP.sp,
    lineHeight = FlatRowMetrics.lineHeightSp.sp,
)

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun FlatStandardBody(
    content: BubbleContent,
    accentColor: Color,
    callbacks: BubbleCallbacks,
    audioPlayback: BubbleAudioPlayback?,
    decor: BubbleTextDecor,
    metaAlpha: () -> Float,
    bodyAccessory: (@Composable (onColor: Color) -> Unit)?,
    focus: FlatRowFocus?,
) {
    val onLongPress = callbacks.onLongPress
    val focused = focus != null
    // L'élue : seul son CONTENU grossit, depuis son bord haut d'attaque, en rendu seul (iOS
    // `FocalElectedLoupe`, 250 ms ease-out) ; la hauteur de rangée ne change jamais.
    val loupe by animateFloatAsState(
        targetValue = focus?.contentScale ?: 1f,
        animationSpec = tween(FocalMetrics.Scene.ENTER_DURATION_MS.toInt(), easing = LinearOutSlowInEasing),
        label = "focal-loupe",
    )
    var contentRect by remember { mutableStateOf<Rect?>(null) }
    val lift = if (focused) ElectedMetrics.lift(content.isFirstInGroup) else 0.dp
    val isRtl = LocalLayoutDirection.current == LayoutDirection.Rtl
    val namedActions = callbacks.accessibilityActions
    val ink = MeeshyTheme.tokens.textPrimary
    val rowInput = remember(content) { FocalRowInput.of(content) }
    val expansion = LocalFlatRowExpansion.current
    val isLong = remember(content.text, content.isEndToEndSealed) {
        !content.isEndToEndSealed && LongMessageExcerpt.isLong(content.text)
    }
    val expansionLabel = expansion?.takeIf { isLong }?.let {
        stringResource(if (it.isExpanded) R.string.focal_long_message_expanded else R.string.focal_long_message_collapsed)
    }
    val expansionAction = expansion?.takeIf { isLong && !it.isExpanded }?.let {
        CustomAccessibilityAction(stringResource(R.string.message_long_read_more)) { it.onToggle(); true }
    }
    Row(
        verticalAlignment = Alignment.Bottom,
        horizontalArrangement = Arrangement.spacedBy(FlatRowMetrics.metaSpacing),
        modifier = Modifier
            .fillMaxWidth()
            // Une SUITE élue descend sous sa chip d'identité, en rendu seul (iOS `focusLift`).
            .offset(y = lift)
            .let { base ->
                if (onLongPress == null) base
                else base.combinedClickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                    onClick = {},
                    onLongClick = onLongPress,
                )
            }
            .semantics(mergeDescendants = true) {
                if (expansionLabel != null) stateDescription = expansionLabel
                if (namedActions.isNotEmpty() || expansionAction != null) {
                    customActions = namedActions.map { named ->
                        CustomAccessibilityAction(named.label) { named.onAction(); true }
                    } + listOfNotNull(expansionAction)
                }
            },
    ) {
        val column: @Composable () -> Unit = { Column(
            verticalArrangement = Arrangement.spacedBy(FlatRowMetrics.paddingVertical),
        ) {
            FlatBadges(content)
            if (content.isFirstInGroup) {
                // En focus l'identité passe sur la chip du cadre : l'en-tête garde sa place, s'efface.
                Box(Modifier.graphicsLayer { alpha = if (focused) 0f else 1f }) {
                    FocalIdentityHeader(input = rowInput, onSenderTap = callbacks.onSenderTap)
                }
            }
            Box(
                modifier = Modifier
                    .padding(start = FlatRowMetrics.indent)
                    .onPlaced { coords ->
                        if (focused) {
                            contentRect = coords.parentLayoutCoordinates?.localBoundingBoxOf(coords, clipBounds = false)
                        }
                    }
                    .graphicsLayer {
                        scaleX = loupe
                        scaleY = loupe
                        transformOrigin = TransformOrigin(if (isRtl) 1f else 0f, 0f)
                    },
            ) {
                val sections: @Composable () -> Unit = {
                    FlatContentSections(content, accentColor, ink, callbacks, audioPlayback, decor, bodyAccessory)
                }
                FocalProtectedContent(
                    messageId = content.messageId,
                    spec = content.blurReveal,
                    shape = RoundedCornerShape(MeeshyRadius.md),
                ) { sections() }
            }
            if (content.isOutgoing && content.deliveryStatus == DeliveryStatus.Failed) {
                FlatFailedRetry(failure = BubbleFailure.of(content), onRetry = callbacks.onRetry)
            }
            // En focus, la bande du cadre remplace la ligne basse, qui garde sa place.
            Box(Modifier.graphicsLayer { alpha = if (focused) 0f else 1f }) {
                FlatBottomLine(content, accentColor, callbacks)
            }
        } }
        if (focus == null) {
            Box(Modifier.weight(1f)) { column() }
        } else {
            FocalElectedFrame(
                contentScale = focus.contentScale,
                lift = lift,
                contentRect = { contentRect },
                card = { FocalGlassBlock() },
                identityChip = {
                    Box(Modifier.offset(x = -ElectedMetrics.chipInset)) {
                        FocalIdentityChip(content, accentColor, callbacks.onSenderTap)
                    }
                },
                strip = { ElectedStrip(content, focus, accentColor, callbacks) },
                modifier = Modifier.weight(1f),
                column = column,
            )
        }
        // En focus, la chip de date dit la même chose : la colonne s'efface sans céder sa place.
        FocalMetaColumn(
            input = rowInput,
            metaAlpha = { if (focused) 0f else metaAlpha() },
            onShowReadStatus = callbacks.onShowReadStatus,
        )
    }
}

/** Épinglé, transféré, compte à rebours éphémère — au-dessus de l'identité (propriétés du message). */
@Composable
private fun FlatBadges(content: BubbleContent) {
    val showsPin = content.pinnedAtIso != null
    val showsForward = content.isForwarded
    val showsEphemeral = content.expiresAtIso != null && !content.isAfterRead
    if (!showsPin && !showsForward && !showsEphemeral) return
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        modifier = Modifier.padding(start = FlatRowMetrics.indent),
    ) {
        if (showsPin) BubblePinBadge()
        if (showsForward) BubbleForwardBadge(content.forwardAttribution)
        if (showsEphemeral) EphemeralCountdownBadge(expiresAtIso = content.expiresAtIso)
    }
}

/** Citation, story, médias, fichiers, audio, texte (ou emoji seul), aperçu de lien. */
@Composable
private fun FlatContentSections(
    content: BubbleContent,
    accentColor: Color,
    ink: Color,
    callbacks: BubbleCallbacks,
    audioPlayback: BubbleAudioPlayback?,
    decor: BubbleTextDecor,
    bodyAccessory: (@Composable (onColor: Color) -> Unit)?,
) {
    Column(
        verticalArrangement = Arrangement.spacedBy(FlatRowMetrics.paddingVertical),
        modifier = Modifier.messageEffects(
            effects = content.effects,
            shape = RoundedCornerShape(MeeshyRadius.md),
            appearanceSeed = content.messageId.hashCode().toLong(),
        ),
    ) {
        FlatQuote(content, accentColor, callbacks, decor.mentionDisplayNames)
        content.storyReply?.let { story ->
            if (story.isMood) {
                StoryReplyPreview(story = story, accentColor = accentColor)
            } else {
                FocalStoryCitationQuote(
                    story = story,
                    railColor = accentColor,
                    accentColor = accentColor,
                    onOpen = callbacks.onStoryCitationClick,
                )
            }
        }
        val sticker = content.drawnSticker
        if (sticker != null) {
            // iOS `FocalRow.stickerBlock` : le sticker se dessine, sans carte ni fond, au côté de la rangée.
            MessageStickerArtwork(sticker, side = FlatRowMetrics.stickerSide)
            return@Column
        }
        if (content.hasRenderedAttachments) FocalAttachmentBlock(content, ink, callbacks, audioPlayback, accentColor)
        FlatText(content, accentColor, ink, decor)
        if (!content.isEndToEndSealed) bodyAccessory?.invoke(ink)
    }
}

/** La citation plate : le filet, le nom, le texte cité sur deux lignes, la miniature (iOS `FocalQuotedReplyView`). */
@Composable
private fun FlatQuote(content: BubbleContent, accentColor: Color, callbacks: BubbleCallbacks, mentionDisplayNames: Map<String, String>?) {
    if (content.replyToText == null && !content.replyToDeleted) return
    val mediaLabel = when (content.replyToMediaKind) {
        ReplyMediaKind.Image -> stringResource(R.string.bubble_reply_photo)
        ReplyMediaKind.File -> stringResource(R.string.bubble_reply_attachment)
        ReplyMediaKind.None -> null
    }
    val deletedLabel = stringResource(R.string.bubble_message_deleted)
    val reply = remember(content.replyToText, content.replyToDeleted, content.replyToSenderName, content.replyToIsMe, content.replyToThumbnailUrl, mediaLabel, deletedLabel) {
        FocalQuotedReply(
            authorName = content.replyToSenderName,
            isMe = content.replyToIsMe,
            isMood = false,
            previewText = content.replyToText?.takeIf { it.isNotBlank() && !content.replyToDeleted }
                ?: if (content.replyToDeleted) deletedLabel else "",
            mediaLabel = mediaLabel,
            thumbnailUrl = content.replyToThumbnailUrl.takeUnless { content.replyToDeleted },
        )
    }
    val jump = callbacks.onReplyPreviewClick.takeIf { content.replyToId != null }
    FocalQuotedReplyView(
        reply = reply,
        accentColor = accentColor,
        mentionDisplayNames = mentionDisplayNames,
        onJump = jump,
        onAuthorTap = callbacks.onQuotedAuthorTap.takeIf { content.replyToAuthor != null },
        onMediaTap = callbacks.onQuotedMediaTap ?: jump,
    )
}

/** Texte 15 / 1,42, emoji seul agrandi, ou mention de chiffrement ; un message long s'ouvre sur un extrait. */
@Composable
private fun FlatText(content: BubbleContent, accentColor: Color, ink: Color, decor: BubbleTextDecor) {
    if (content.isEndToEndSealed) {
        Text(
            text = stringResource(R.string.bubble_message_end_to_end),
            style = FlatTextStyle,
            fontStyle = FontStyle.Italic,
            color = MeeshyTheme.tokens.textMuted,
        )
        return
    }
    if (content.text.isBlank()) return
    val emojiFontSize = if (content.replyToText == null) EmojiDetector.fontSizeSp(content.emojiOnlyCount) else null
    if (emojiFontSize != null) {
        Text(text = content.text.trim(), style = largeEmojiTextStyle(emojiFontSize.sp))
        return
    }
    FocalLongMessage(messageId = content.messageId, text = content.text, accentColor = accentColor, inkColor = ink) { shown ->
        RichMessageText(
            text = shown,
            color = ink,
            style = FlatTextStyle,
            linkColor = accentColor,
            highlightColor = MeeshyPalette.Warning.copy(alpha = 0.45f),
            mentionDisplayNames = decor.mentionDisplayNames,
            highlightTerm = decor.highlightTerm,
            trackedLinks = decor.trackedLinks,
        )
    }
}

/** L'envoi échoué : une bande orange compacte sous le contenu, au retrait de colonne (iOS). */
@Composable
private fun FlatFailedRetry(failure: BubbleFailure, onRetry: (() -> Unit)?) {
    val label = BubbleFailedTap.label(failure)
    if (failure.removes) {
        BubbleFailureCaption(failure = failure, color = MeeshyTheme.tokens.textSecondary, modifier = Modifier.padding(start = FlatRowMetrics.indent))
    }
    Box(
        contentAlignment = Alignment.Center,
        modifier = Modifier
            .padding(start = FlatRowMetrics.indent)
            .size(width = 72.dp, height = 28.dp)
            .clip(RoundedCornerShape(MeeshyRadius.xs))
            .background(MeeshyPalette.Warning)
            .let { base -> if (onRetry == null) base else base.clickable(onClickLabel = label, onClick = onRetry) }
            .semantics { contentDescription = label },
    ) {
        Icon(imageVector = BubbleFailedTap.icon(failure), contentDescription = null, tint = MeeshyPalette.White, modifier = Modifier.size(16.dp))
    }
}

/**
 * La ligne basse, montée seulement si elle porte quelque chose (iOS `mountsBottomLine`) : les
 * drapeaux (trois au plus, sur le DERNIER message du groupe, jamais sur un message voilé) puis
 * les réactions et le (+) du dernier message reçu.
 */
@Composable
private fun FlatBottomLine(content: BubbleContent, accentColor: Color, callbacks: BubbleCallbacks) {
    val flags = if (content.isLastInGroup && content.blurReveal == null && content.languageStrip.size > 1) {
        content.languageStrip.take(FocalMetrics.FocusStrip.FLAG_LIMIT_PLAIN)
    } else {
        emptyList()
    }
    val showsAdd = !content.isOutgoing && content.isLastReceivedMessage
    val mountsReactions = content.reactions.isNotEmpty() || showsAdd
    if (flags.isEmpty() && !mountsReactions) return
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xsPlus),
        modifier = Modifier.padding(start = FlatRowMetrics.indent),
    ) {
        flags.forEach { chip -> CompactFlagChip(chip, MeeshyTheme.tokens.textPrimary, callbacks.onFlagTap) }
        if (mountsReactions) {
            ReactionStrip(
                reactions = content.reactions,
                accent = accentColor,
                showsAddButton = showsAdd,
                onReactionClick = callbacks.onReactionClick,
                onReactionLongPress = callbacks.onReactionLongPress,
                onAddReaction = callbacks.onAddReaction,
                messageId = content.messageId,
                onOpenReactPicker = callbacks.onOpenReactPicker,
            )
        }
    }
}

/** Message supprimé / vue unique consommée : une ligne italique atténuée au retrait (iOS `FocalDeletedRow`). */
@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun FlatMutedLine(text: String, onLongPress: (() -> Unit)?) {
    Text(
        text = text,
        style = FlatTextStyle,
        fontStyle = FontStyle.Italic,
        color = MeeshyTheme.tokens.textMuted,
        modifier = Modifier
            .padding(start = FlatRowMetrics.indent)
            .let { base ->
                if (onLongPress == null) base
                else base.combinedClickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                    onClick = {},
                    onLongClick = onLongPress,
                )
            },
    )
}
