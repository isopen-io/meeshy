package me.meeshy.ui.component.bubble

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.key
import androidx.compose.runtime.remember
import androidx.compose.ui.graphics.graphicsLayer
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.ReactionAnimationGate
import me.meeshy.sdk.model.ReactionStripLayout
import me.meeshy.ui.R
import me.meeshy.ui.theme.MeeshyFontSize
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/** Nombre de pastilles visibles avant la pastille « +N » (iOS `BubbleReactionsOverlay.maxVisible`). */
internal const val REACTIONS_MAX_VISIBLE: Int = ReactionStripLayout.MAX_VISIBLE

/** Le rebond d'une pastille dont le compte ou la marque du lecteur change (iOS : ressort 0,32 s, amorti 0,55). */
private const val REACTION_PULSE_PEAK: Float = 1.22f
private const val REACTION_PULSE_DAMPING: Float = 0.55f

/** Décalage vertical de la bande sous le bord de la bulle (iOS `restingOffset`). */
internal val ReactionsRestingOffset = ReactionStripLayout.RESTING_OFFSET_DP.dp

/** Ce dont la cible de 40 dp du smiley déborde la bande de 22 dp, de chaque côté. */
internal val AddHitOverflow = ((ReactionStripLayout.HIT_DIAMETER_DP - ReactionStripLayout.STRIP_HEIGHT_DP) / 2).dp

/**
 * La bande de réactions, port d'iOS `BubbleReactionsOverlay` : posée HORS de la bulle, à cheval
 * sur son bord bas (l'hôte l'aligne et la décale). Au plus 4 pastilles de 22 dp, puis « +N », puis
 * — sur le dernier message reçu seulement — le smiley d'ajout. La pastille où le lecteur a réagi
 * est chargée de l'accent (50 % clair / 70 % sombre, trait 2,5 dp, ombre) ; les autres restent
 * discrètes. Tap = bascule, appui long = détail des réactions.
 */
@Composable
internal fun ReactionStrip(
    reactions: List<ReactionEntry>,
    accent: Color,
    showsAddButton: Boolean,
    onReactionClick: ((String) -> Unit)?,
    onReactionLongPress: (() -> Unit)?,
    onAddReaction: (() -> Unit)?,
    modifier: Modifier = Modifier,
    messageId: String = "",
    onOpenReactPicker: (() -> Unit)? = null,
    expandsAddHit: Boolean = false,
    animationGate: ReactionAnimationGate = ReactionAnimationGate.Shared,
) {
    val layout = ReactionStripLayout.of(reactions.size, isOutgoing = false, isLastReceivedMessage = showsAddButton)
    val visible = reactions.take(layout.visibleCount)
    val overflow = layout.overflowCount
    Row(
        modifier = modifier,
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xxs),
    ) {
        visible.forEach { entry ->
            // Une pastille garde son état (le rebond) attaché à SON emoji : sans clé, une réaction
            // qui change de rang ferait rebondir la voisine qui prend sa place.
            key(entry.emoji) {
                ReactionChip(
                    entry = entry,
                    accent = accent,
                    isNew = animationGate.shouldAnimate(messageId, entry.emoji),
                    onClick = onReactionClick?.let { { it(entry.emoji) } },
                    onLongClick = onReactionLongPress,
                )
            }
        }
        if (overflow > 0) OverflowChip(count = overflow, accent = accent, onClick = onReactionLongPress)
        if (showsAddButton && onAddReaction != null) {
            ReactionAddButton(
                accent = accent,
                onQuickReact = onAddReaction,
                onOpenPicker = onOpenReactPicker,
                expandsHit = expandsAddHit,
            )
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun ReactionChip(
    entry: ReactionEntry,
    accent: Color,
    isNew: Boolean,
    onClick: (() -> Unit)?,
    onLongClick: (() -> Unit)?,
) {
    val isDark = MeeshyTheme.isDark
    val shape = RoundedCornerShape(MeeshyRadius.pill)
    val haptics = rememberMeeshyHaptics()
    val chipLabel = stringResource(
        if (entry.includesMe) R.string.bubble_reactions_chip_mine else R.string.bubble_reactions_chip,
        entry.emoji,
        entry.count,
    )
    val toggleHint = stringResource(R.string.bubble_reactions_toggle_hint)
    val pulse = remember { Animatable(1f) }
    val firstFrame = remember { booleanArrayOf(true) }
    LaunchedEffect(entry.count, entry.includesMe) {
        if (firstFrame[0]) {
            firstFrame[0] = false
            return@LaunchedEffect
        }
        pulse.snapTo(REACTION_PULSE_PEAK)
        pulse.animateTo(1f, spring(dampingRatio = REACTION_PULSE_DAMPING, stiffness = Spring.StiffnessMedium))
    }
    val fill = when {
        entry.includesMe -> accent.copy(alpha = if (isDark) 0.70f else 0.50f)
        isDark -> MeeshyPalette.White.copy(alpha = 0.06f)
        else -> Color.Black.copy(alpha = 0.04f)
    }
    val stroke = if (entry.includesMe) {
        accent.copy(alpha = if (isDark) 0.95f else 0.80f)
    } else {
        accent.copy(alpha = if (isDark) 0.15f else 0.10f)
    }
    Row(
        modifier = Modifier
            .reactionComet(isNew)
            .graphicsLayer { scaleX = pulse.value; scaleY = pulse.value }
            .height(22.dp)
            .let { base ->
                if (entry.includesMe) base.shadow(4.dp, shape, ambientColor = accent, spotColor = accent) else base
            }
            .clip(shape)
            .background(fill)
            .border(if (entry.includesMe) 2.5.dp else 0.5.dp, stroke, shape)
            .let { base ->
                if (onClick == null && onLongClick == null) {
                    base
                } else {
                    base.combinedClickable(
                        onClick = {
                            haptics.light()
                            onClick?.invoke()
                        },
                        onLongClick = onLongClick?.let { longClick ->
                            {
                                haptics.medium()
                                longClick()
                            }
                        },
                    ).semantics(mergeDescendants = true) {
                        role = Role.Button
                        contentDescription = chipLabel
                        stateDescription = toggleHint
                    }
                }
            }
            .padding(horizontal = if (entry.count > 1) MeeshySpacing.xsPlus else 5.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xxs),
    ) {
        Text(text = entry.emoji, fontSize = MeeshyFontSize.footnote)
        if (entry.count > 1) {
            Text(
                text = entry.count.toString(),
                fontSize = MeeshyFontSize.footnote,
                fontWeight = FontWeight.Bold,
                color = when {
                    entry.includesMe -> MeeshyPalette.White
                    isDark -> MeeshyPalette.White.copy(alpha = 0.7f)
                    else -> accent
                },
            )
        }
    }
}

@Composable
private fun OverflowChip(count: Int, accent: Color, onClick: (() -> Unit)?) {
    val isDark = MeeshyTheme.isDark
    val shape = RoundedCornerShape(MeeshyRadius.pill)
    val moreLabel = stringResource(R.string.bubble_reactions_more_count, count)
    val viewAll = stringResource(R.string.bubble_reactions_view_all_hint)
    Box(
        contentAlignment = Alignment.Center,
        modifier = Modifier
            .height(22.dp)
            .clip(shape)
            .background(accent.copy(alpha = if (isDark) 0.15f else 0.08f))
            .border(0.5.dp, accent.copy(alpha = if (isDark) 0.25f else 0.15f), shape)
            .let { base ->
                if (onClick == null) base else base.clickable(onClickLabel = viewAll, onClick = onClick)
            }
            .semantics(mergeDescendants = true) {
                contentDescription = moreLabel
                role = Role.Button
            }
            .padding(horizontal = MeeshySpacing.xsPlus),
    ) {
        Text(
            text = "+$count",
            fontSize = MeeshyFontSize.footnote,
            fontWeight = FontWeight.Bold,
            fontFamily = FontFamily.Monospace,
            color = accent,
        )
    }
}
