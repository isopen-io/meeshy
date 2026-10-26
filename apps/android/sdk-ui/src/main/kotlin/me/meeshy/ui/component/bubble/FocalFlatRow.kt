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
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
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
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import me.meeshy.sdk.model.reading.focal.FocalMetrics
import me.meeshy.sdk.model.reading.focal.LongMessageExcerpt
import me.meeshy.sdk.theme.DynamicColorGenerator
import me.meeshy.ui.R
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.format.bubbleClockLabel
import me.meeshy.ui.icons.MeeshyIcons
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
            when {
                renderKind.isSystem -> FlatSystemNotice(content)
                content.isDeleted -> FlatMutedLine(stringResource(R.string.bubble_message_deleted), callbacks.onLongPress)
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
    const val TEXT_SIZE_SP = 15f
    val lineHeightSp = (TEXT_SIZE_SP * FocalMetrics.Text.LINE_HEIGHT_RATIO.toFloat())
    const val TIME_SIZE_SP = 10.5f
}

private val FlatTextStyle = TextStyle(
    fontSize = FlatRowMetrics.TEXT_SIZE_SP.sp,
    lineHeight = FlatRowMetrics.lineHeightSp.sp,
)

/** Teinte méta : noir / blanc à 55 % (iOS `FocalMetrics.MetaText`). */
@Composable
private fun flatMetaTint(): Color =
    if (MeeshyTheme.isDark) {
        Color.White.copy(alpha = FocalMetrics.MetaText.DARK_OPACITY.toFloat())
    } else {
        Color.Black.copy(alpha = FocalMetrics.MetaText.LIGHT_OPACITY.toFloat())
    }

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
                if (namedActions.isNotEmpty()) {
                    customActions = namedActions.map { named ->
                        CustomAccessibilityAction(named.label) { named.onAction(); true }
                    }
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
                    FlatIdentityHeader(content = content, onSenderTap = callbacks.onSenderTap)
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
                val spec = content.blurReveal
                if (spec == null) {
                    sections()
                } else {
                    BubbleBlurReveal(
                        messageId = content.messageId,
                        spec = spec,
                        shape = RoundedCornerShape(MeeshyRadius.md),
                    ) { sections() }
                }
            }
            if (content.isOutgoing && content.deliveryStatus == DeliveryStatus.Failed) {
                FlatFailedRetry(onRetry = callbacks.onRetry)
            }
            // En focus, la bande du cadre remplace la ligne basse, qui garde sa place.
            Box(Modifier.graphicsLayer { alpha = if (focused) 0f else 1f }) {
                FlatBottomLine(content, accentColor, callbacks)
            }
        } }
        if (focus == null) {
            Box(Modifier.weight(1f), propagateMinConstraints = true) { column() }
        } else {
            FocalElectedFrame(
                focus = focus,
                lift = lift,
                contentRect = { contentRect },
                card = { ElectedGlassCard() },
                identityChip = {
                    Box(Modifier.offset(x = -ElectedMetrics.chipInset)) {
                        ElectedIdentityChip(content, accentColor, callbacks.onSenderTap)
                    }
                },
                strip = { ElectedStrip(content, focus, accentColor, callbacks) },
                modifier = Modifier.weight(1f),
                column = column,
            )
        }
        // En focus, la chip de date dit la même chose : la colonne s'efface sans céder sa place.
        FlatMetaColumn(content = content, metaAlpha = { if (focused) 0f else metaAlpha() })
    }
}

/** Épinglé, transféré, compte à rebours éphémère — au-dessus de l'identité (propriétés du message). */
@Composable
private fun FlatBadges(content: BubbleContent) {
    val showsPin = content.pinnedAtIso != null
    val showsForward = content.isForwarded
    val showsEphemeral = content.expiresAtIso != null
    if (!showsPin && !showsForward && !showsEphemeral) return
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        modifier = Modifier.padding(start = FlatRowMetrics.indent),
    ) {
        if (showsPin) BubblePinnedIndicator()
        if (showsForward) BubbleForwardedBadge(content.forwardedFromName, MeeshyTheme.tokens.textMuted)
        if (showsEphemeral) EphemeralCountdownBadge(expiresAtIso = content.expiresAtIso)
    }
}

/**
 * L'en-tête d'identité de la tête de groupe (iOS `FocalIdentityHeader`) : pastille 22, nom en
 * sous-titre très gras — « Toi » en indigo pour mes messages. Hauteur minimale 34, celle de la
 * pastille de focus, pour que la rangée ne change jamais de hauteur. Tap → fiche de l'auteur.
 */
@Composable
private fun FlatIdentityHeader(content: BubbleContent, onSenderTap: (() -> Unit)?) {
    val you = stringResource(R.string.focal_row_you)
    val senderName = content.senderName?.takeIf { it.isNotBlank() }
    val displayName = if (content.isOutgoing) you else senderName ?: ""
    val senderColor = remember(content.senderColorHex, senderName) {
        val hex = content.senderColorHex ?: senderName?.let(DynamicColorGenerator::colorForName)
        hex?.let { hexColor(it, MeeshyPalette.Indigo500) } ?: MeeshyPalette.Indigo500
    }
    val nameColor = when {
        content.isOutgoing -> MeeshyPalette.Indigo500
        MeeshyTheme.isDark -> Color.White.copy(alpha = 0.92f)
        else -> Color.Black.copy(alpha = 0.88f)
    }
    val profileLabel = stringResource(R.string.bubble_view_profile)
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xsPlus),
        modifier = Modifier
            .heightIn(min = FocalMetrics.Focus.AVATAR_SIZE.toFloat().dp)
            .let { base ->
                if (onSenderTap == null) base
                else base.clip(RoundedCornerShape(MeeshyRadius.sm)).clickable(onClickLabel = profileLabel, onClick = onSenderTap)
            },
    ) {
        MeeshyAvatar(
            name = senderName ?: you,
            size = FlatRowMetrics.avatar,
            containerColor = senderColor,
            imageUrl = content.senderAvatarUrl,
        )
        Text(
            text = displayName,
            fontSize = 13.sp,
            fontWeight = FontWeight.ExtraBold,
            color = nameColor,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
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
        FlatQuote(content, accentColor, callbacks.onReplyPreviewClick)
        if (content.storyReply != null) {
            StoryReplyPreview(story = content.storyReply, accentColor = accentColor)
        }
        if (content.hasRenderedAttachments) {
            Column(
                modifier = Modifier
                    .widthIn(max = FlatRowMetrics.mediaMaxWidth)
                    .clip(RoundedCornerShape(FlatRowMetrics.mediaRadius)),
            ) {
                BubbleAttachmentSections(content, ink, callbacks, audioPlayback)
            }
        }
        FlatText(content, accentColor, ink, decor)
        if (!content.isEndToEndSealed) bodyAccessory?.invoke(ink)
    }
}

/** La citation plate : un rail de 2,5 à la couleur de l'auteur cité (l'accent si c'est moi). */
@Composable
private fun FlatQuote(content: BubbleContent, accentColor: Color, onClick: (() -> Unit)?) {
    if (content.replyToText == null && !content.replyToDeleted) return
    val mediaLabel = when (content.replyToMediaKind) {
        ReplyMediaKind.Image -> stringResource(R.string.bubble_reply_photo)
        ReplyMediaKind.File -> stringResource(R.string.bubble_reply_attachment)
        ReplyMediaKind.None -> null
    }
    val text = content.replyToText?.takeIf { it.isNotBlank() && !content.replyToDeleted }
        ?: mediaLabel
        ?: stringResource(R.string.bubble_message_deleted)
    val railColor = remember(content.replyToIsMe, content.replyToSenderName, accentColor) {
        if (content.replyToIsMe) {
            accentColor
        } else {
            content.replyToSenderName?.let { hexColor(DynamicColorGenerator.colorForName(it), accentColor) } ?: accentColor
        }
    }
    Row(
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        modifier = Modifier
            .height(IntrinsicSize.Min)
            .let { base ->
                if (onClick == null || content.replyToId == null) base else base.clickable(onClick = onClick)
            },
    ) {
        Box(
            modifier = Modifier
                .width(FlatRowMetrics.quoteRail)
                .fillMaxHeight()
                .clip(RoundedCornerShape(FlatRowMetrics.quoteRail / 2))
                .background(railColor),
        )
        Column(modifier = Modifier.padding(vertical = 1.dp)) {
            content.replyToSenderName?.let { name ->
                Text(
                    text = name,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = railColor,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Text(
                text = text,
                fontSize = 13.sp,
                color = MeeshyTheme.tokens.textSecondary,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
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
        Text(text = content.text.trim(), fontSize = emojiFontSize.sp, lineHeight = (emojiFontSize * 1.15f).sp)
        return
    }
    val excerpt = remember(content.text) { LongMessageExcerpt.of(content.text) }
    var expanded by rememberSaveable(content.messageId) { mutableStateOf(false) }
    RichMessageText(
        text = if (excerpt.truncated && !expanded) excerpt.excerpt + "…" else content.text,
        color = ink,
        style = FlatTextStyle,
        linkColor = accentColor,
        highlightColor = MeeshyPalette.Warning.copy(alpha = 0.45f),
        mentionDisplayNames = decor.mentionDisplayNames,
        highlightTerm = decor.highlightTerm,
        trackedLinks = decor.trackedLinks,
    )
    if (excerpt.truncated) {
        Text(
            text = stringResource(if (expanded) R.string.message_long_collapse else R.string.message_long_read_more),
            fontSize = 13.sp,
            fontWeight = FontWeight.SemiBold,
            color = accentColor,
            modifier = Modifier
                .clip(RoundedCornerShape(MeeshyRadius.sm))
                .clickable { expanded = !expanded }
                .padding(vertical = MeeshySpacing.xxs),
        )
    }
}

/** L'envoi échoué : une bande orange compacte sous le contenu, au retrait de colonne (iOS). */
@Composable
private fun FlatFailedRetry(onRetry: (() -> Unit)?) {
    val label = stringResource(R.string.bubble_failed_retry)
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
        Icon(imageVector = MeeshyIcons.Refresh, contentDescription = null, tint = MeeshyPalette.White, modifier = Modifier.size(16.dp))
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
            )
        }
    }
}

/**
 * La colonne méta (iOS `FocalMetaColumn`) : « modifié » toujours lisible, l'heure et les coches
 * masquées par opacité au repos — leur place reste réservée, rien ne bouge quand elles paraissent.
 */
@Composable
private fun FlatMetaColumn(content: BubbleContent, metaAlpha: () -> Float) {
    val tint = flatMetaTint()
    val readTint = if (MeeshyTheme.isDark) MeeshyPalette.Indigo400 else MeeshyPalette.Indigo600
    val clock = remember(content.createdAtIso) { bubbleClockLabel(content.createdAtIso) }
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp, Alignment.End),
        modifier = Modifier
            .widthIn(min = FlatRowMetrics.metaWidth)
            .padding(bottom = 2.dp),
    ) {
        if (content.isEdited) {
            Icon(
                imageVector = MeeshyIcons.Edit,
                contentDescription = stringResource(R.string.bubble_edited),
                tint = tint,
                modifier = Modifier.size(10.dp),
            )
        }
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp),
            modifier = Modifier.graphicsLayer { alpha = metaAlpha() },
        ) {
            if (clock != null) {
                Text(
                    text = clock,
                    fontSize = FlatRowMetrics.TIME_SIZE_SP.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = tint,
                    maxLines = 1,
                )
            }
            if (content.isOutgoing && content.deliveryStatus != DeliveryStatus.Failed) {
                DeliveryStatusIcon(
                    status = content.deliveryStatus,
                    metaColor = tint,
                    isSlow = content.isSlowSend,
                    readTintOverride = readTint,
                )
            }
        }
    }
}

/** Avis de conversation : l'heure en petit au-dessus, le texte centré, atténué (iOS `FocalSystemNoticeRow`). */
@Composable
private fun FlatSystemNotice(content: BubbleContent) {
    if (content.text.isBlank()) return
    val muted = MeeshyTheme.tokens.textMuted
    val clock = remember(content.createdAtIso) { bubbleClockLabel(content.createdAtIso) }
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xxs),
        modifier = Modifier
            .fillMaxWidth()
            .semantics(mergeDescendants = true) { contentDescription = content.text },
    ) {
        if (clock != null) {
            Text(text = clock, fontSize = 9.5.sp, fontWeight = FontWeight.SemiBold, color = muted.copy(alpha = muted.alpha * 0.7f))
        }
        Text(text = content.text, fontSize = 12.5.sp, fontWeight = FontWeight.Medium, color = muted, textAlign = TextAlign.Center)
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
