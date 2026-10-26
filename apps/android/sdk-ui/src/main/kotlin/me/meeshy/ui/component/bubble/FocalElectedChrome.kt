package me.meeshy.ui.component.bubble

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlin.math.max
import kotlin.math.roundToInt
import me.meeshy.sdk.model.reading.focal.FocalMetrics
import me.meeshy.sdk.model.reading.focal.FocalScrollPerspective
import me.meeshy.sdk.theme.DynamicColorGenerator
import me.meeshy.ui.R
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyGradients
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.hexColor

/**
 * Ce que l'hôte dit à la rangée plate quand ELLE est l'élue de la scène Focal (iOS
 * `FocalRowInput.isFocused` + `focusTimestamp`) : la loupe de son contenu, sa date complète,
 * et les deux portes que la bande n'ouvre pas par les rappels de la bulle.
 */
@Immutable
public data class FlatRowFocus(
    /** Échelle du seul CONTENU (`FocalScrollPerspective.electedScale`) ; 1 en réduction de mouvement. */
    val contentScale: Float,
    /** « Aujourd'hui 12:30 », « Hier 18:30 », « Sam. 3 oct. 2025 · 14:41 » (`FocalFocusTimestamp`). */
    val timestampLabel: String,
    /** Chip de date : les détails du message. */
    val onShowMessageInfo: (() -> Unit)? = null,
    /** Icône de traduction : le détail des langues du message. */
    val onShowTranslationDetail: (() -> Unit)? = null,
)

/** Les cotes de l'élu (iOS `FocalMetrics.FocusStrip`, `FocalScrollPerspective`), en dp. */
internal object ElectedMetrics {
    val cardMargin = FocalScrollPerspective.ELECTED_CARD_MARGIN.toFloat().dp
    val cardRadius = FocalScrollPerspective.FOCUS_CARD_CORNER_RADIUS.toFloat().dp
    val chipHeight = FocalMetrics.FocusStrip.CHIP_HEIGHT.toFloat().dp
    val chipMinWidth = FocalMetrics.FocusStrip.CHIP_MIN_WIDTH.toFloat().dp
    val chipInset = FocalMetrics.FocusStrip.CHIP_INSET.toFloat().dp
    val identityHeight = FocalMetrics.FocusStrip.IDENTITY_CHIP_HEIGHT.toFloat().dp
    val identityAvatar = FocalMetrics.FocusStrip.IDENTITY_AVATAR_SIZE.toFloat().dp
    val identityNameSp = FocalMetrics.FocusStrip.IDENTITY_NAME_SIZE.toFloat().sp
    val stripGap = (FocalMetrics.FocusStrip.STRIP_GAP + FocalScrollPerspective.ELECTED_CONTENT_BREATHING).toFloat().dp

    /** Ce dont la rangée élue descend en rendu (`electedContentLift`). */
    fun lift(isFirstInGroup: Boolean): Dp = FocalScrollPerspective.electedContentLift(isFirstInGroup).toFloat().dp
}

/**
 * Le cadre de l'élu autour de la colonne du message (iOS `electedCardBackground`,
 * `focusIdentityChip`, `electedStrip`) : la colonne garde sa taille — aucun relayout à l'élection —,
 * le cadre de verre, la chip d'identité et la bande basse se posent AUTOUR d'elle, hors de ses
 * bornes, sur la mesure réelle du contenu grossi ([contentRect], repère de la colonne, avant loupe).
 */
@Composable
internal fun FocalElectedFrame(
    focus: FlatRowFocus,
    lift: Dp,
    contentRect: () -> Rect?,
    card: @Composable () -> Unit,
    identityChip: @Composable () -> Unit,
    strip: @Composable () -> Unit,
    modifier: Modifier = Modifier,
    column: @Composable () -> Unit,
) {
    Layout(contents = listOf(column, card, identityChip, strip), modifier = modifier) { measurables, constraints ->
        val (columnM, cardM, identityM, stripM) = measurables
        val columnP = columnM.first().measure(constraints)
        val width = columnP.width
        val height = columnP.height
        val rect = contentRect() ?: Rect(0f, 0f, width.toFloat(), height.toFloat())
        val scale = focus.contentScale
        val extra = max(0f, scale * rect.width - width)
        val stripTop = max(height.toFloat(), rect.top + scale * rect.height) + ElectedMetrics.stripGap.toPx()
        val margin = ElectedMetrics.cardMargin.toPx()
        val liftPx = lift.toPx()
        val chip = ElectedMetrics.chipHeight.toPx()
        val cardTop = -(liftPx + margin)
        val cardBottom = stripTop + chip + margin
        val cardP = cardM.firstOrNull()?.measure(
            Constraints.fixed((width + 2 * margin + extra).roundToInt(), (cardBottom - cardTop).roundToInt()),
        )
        val identityP = identityM.firstOrNull()?.measure(Constraints(maxWidth = width))
        val stripP = stripM.firstOrNull()?.measure(Constraints.fixed((width + extra).roundToInt(), chip.roundToInt()))
        layout(width, height) {
            cardP?.place(-margin.roundToInt(), cardTop.roundToInt())
            columnP.place(0, 0)
            identityP?.place(0, -liftPx.roundToInt())
            stripP?.place(0, stripTop.roundToInt())
        }
    }
}

/** Le bloc de verre de l'élu (iOS `FocalGlassBlock`) : sans teinte, liseré liquide, ombre douce. */
@Composable
internal fun ElectedGlassCard() {
    val dark = MeeshyTheme.isDark
    val shape = RoundedCornerShape(ElectedMetrics.cardRadius)
    val fill = MeeshyTheme.tokens.backgroundSecondary.copy(alpha = if (dark) 0.78f else 0.86f)
    Box(
        Modifier
            .shadow(elevation = 6.dp, shape = shape, clip = false, ambientColor = Color.Black.copy(alpha = 0.2f), spotColor = Color.Black.copy(alpha = 0.2f))
            .clip(shape)
            .background(fill, shape)
            .border(1.dp, MeeshyGradients.liquidGlassRim(dark, false), shape),
    )
}

/** Teinte de fond d'une chip posée sur le cadre (iOS `focusChipFillOpacity`). */
private fun chipFillOpacity(isDark: Boolean, isActive: Boolean): Float = when {
    isDark && !isActive -> 0.18f
    !isDark && !isActive -> 0.14f
    isDark -> 0.42f
    else -> 0.34f
}

/** LA chip du focus : capsule opaque, lavis d'accent ; pleine d'accent pour « j'ai réagi ». */
@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun FocusChip(
    accent: Color,
    modifier: Modifier = Modifier,
    isActive: Boolean = false,
    filled: Boolean = false,
    height: Dp = ElectedMetrics.chipHeight,
    onClick: (() -> Unit)? = null,
    onLongClick: (() -> Unit)? = null,
    content: @Composable () -> Unit,
) {
    val dark = MeeshyTheme.isDark
    Box(
        contentAlignment = Alignment.Center,
        modifier = modifier
            .height(height)
            .widthIn(min = ElectedMetrics.chipMinWidth)
            .clip(CircleShape)
            .background(if (filled) accent else MeeshyTheme.tokens.backgroundSecondary)
            .background(if (filled) Color.Transparent else accent.copy(alpha = chipFillOpacity(dark, isActive)))
            .let { base ->
                if (onClick == null && onLongClick == null) base
                else base.combinedClickable(onClick = { onClick?.invoke() }, onLongClick = onLongClick)
            }
            .padding(horizontal = MeeshySpacing.xsPlus),
    ) { content() }
}

/** HAUT-GAUCHE : l'auteur à un gabarit plus grand (avatar 26, nom 13,5) — « Toi » pour moi. */
@Composable
internal fun ElectedIdentityChip(content: BubbleContent, accent: Color, onSenderTap: (() -> Unit)?) {
    val you = stringResource(R.string.focal_row_you)
    val senderName = content.senderName?.takeIf { it.isNotBlank() }
    val senderColor = remember(content.senderColorHex, senderName) {
        val hex = content.senderColorHex ?: senderName?.let(DynamicColorGenerator::colorForName)
        hex?.let { hexColor(it, MeeshyPalette.Indigo500) } ?: MeeshyPalette.Indigo500
    }
    val nameColor = when {
        content.isOutgoing -> MeeshyPalette.Indigo500
        MeeshyTheme.isDark -> Color.White.copy(alpha = 0.92f)
        else -> Color.Black.copy(alpha = 0.88f)
    }
    FocusChip(accent = accent, height = ElectedMetrics.identityHeight, onClick = onSenderTap) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xsPlus)) {
            MeeshyAvatar(
                name = senderName ?: you,
                size = ElectedMetrics.identityAvatar,
                containerColor = senderColor,
                imageUrl = content.senderAvatarUrl,
            )
            Text(
                text = if (content.isOutgoing) you else senderName ?: "",
                fontSize = ElectedMetrics.identityNameSp,
                fontWeight = FontWeight.ExtraBold,
                color = nameColor,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

/**
 * La bande basse de l'élu, dans CET ordre (directive iOS 2026-08-22) : traduction, drapeaux (cinq
 * au plus, la langue affichée plus dense), (+) réaction, réactions (pleines si j'ai réagi) ; à
 * droite la date complète et la coche, qui ouvrent les détails du message.
 */
@Composable
internal fun ElectedStrip(
    content: BubbleContent,
    focus: FlatRowFocus,
    accent: Color,
    callbacks: BubbleCallbacks,
) {
    val dark = MeeshyTheme.isDark
    val metaTint = if (dark) Color.White.copy(alpha = 0.55f) else Color.Black.copy(alpha = 0.55f)
    val readTint = if (dark) MeeshyPalette.Indigo400 else MeeshyPalette.Indigo600
    val translatable = content.languageStrip.size > 1 && content.blurReveal == null
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp),
            modifier = Modifier.padding(start = ElectedMetrics.chipInset),
        ) {
            if (translatable) {
                val label = stringResource(R.string.focal_focus_translation_detail)
                FocusChip(accent = accent, onClick = focus.onShowTranslationDetail, modifier = Modifier.semantics { contentDescription = label }) {
                    Icon(MeeshyIcons.TranslateBubble, contentDescription = null, tint = accent, modifier = Modifier.size(13.dp))
                }
                content.languageStrip.take(FocalMetrics.FocusStrip.FLAG_LIMIT_MAGNIFIED).forEach { chip ->
                    val label = chip.info?.name ?: chip.code
                    FocusChip(
                        accent = accent,
                        isActive = chip.isActive,
                        onClick = callbacks.onFlagTap?.let { tap -> { tap(chip.code) } },
                        modifier = Modifier.semantics { contentDescription = label },
                    ) {
                        Text(text = chip.info?.flag ?: chip.code.uppercase(), fontSize = 12.sp)
                    }
                }
            }
            val addLabel = stringResource(R.string.focal_focus_add_reaction)
            FocusChip(accent = accent, onClick = callbacks.onAddReaction, modifier = Modifier.semantics { contentDescription = addLabel }) {
                Icon(MeeshyIcons.Emoji, contentDescription = null, tint = accent, modifier = Modifier.size(13.dp))
            }
            content.reactions.forEach { reaction ->
                FocusChip(
                    accent = accent,
                    filled = reaction.includesMe,
                    onClick = callbacks.onReactionClick?.let { tap -> { tap(reaction.emoji) } },
                    onLongClick = callbacks.onReactionLongPress,
                    modifier = Modifier.semantics { contentDescription = "${reaction.emoji} ${reaction.count}" },
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xxs)) {
                        Text(reaction.emoji, fontSize = 11.sp)
                        if (reaction.count > 1) {
                            Text(
                                "${reaction.count}",
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold,
                                color = if (reaction.includesMe) Color.White else accent,
                            )
                        }
                    }
                }
            }
        }
        Spacer(Modifier.weight(1f))
        FocusChip(
            accent = accent,
            onClick = focus.onShowMessageInfo,
            modifier = Modifier.semantics { contentDescription = focus.timestampLabel },
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(
                    text = focus.timestampLabel,
                    fontSize = FlatRowMetrics.TIME_SIZE_SP.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = metaTint,
                    maxLines = 1,
                )
                if (content.isOutgoing && content.deliveryStatus != DeliveryStatus.Failed) {
                    DeliveryStatusIcon(
                        status = content.deliveryStatus,
                        metaColor = metaTint,
                        isSlow = content.isSlowSend,
                        readTintOverride = readTint,
                    )
                }
            }
        }
    }
}
