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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.EmojiEmotions
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import me.meeshy.ui.R
import me.meeshy.ui.theme.MeeshyFontSize
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/** Nombre de pastilles visibles avant la pastille « +N » (iOS `BubbleReactionsOverlay.maxVisible`). */
internal const val REACTIONS_MAX_VISIBLE: Int = 4

/** Décalage vertical de la bande sous le bord de la bulle (iOS `restingOffset`). */
internal val ReactionsRestingOffset = 18.dp

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
) {
    val visible = reactions.take(REACTIONS_MAX_VISIBLE)
    val overflow = reactions.size - visible.size
    Row(
        modifier = modifier,
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xxs),
    ) {
        visible.forEach { entry ->
            ReactionChip(
                entry = entry,
                accent = accent,
                onClick = onReactionClick?.let { { it(entry.emoji) } },
                onLongClick = onReactionLongPress,
            )
        }
        if (overflow > 0) OverflowChip(count = overflow, accent = accent, onClick = onReactionLongPress)
        if (showsAddButton && onAddReaction != null) AddReactionChip(accent = accent, onClick = onAddReaction)
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun ReactionChip(
    entry: ReactionEntry,
    accent: Color,
    onClick: (() -> Unit)?,
    onLongClick: (() -> Unit)?,
) {
    val isDark = MeeshyTheme.isDark
    val shape = RoundedCornerShape(MeeshyRadius.pill)
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
                        onClick = onClick ?: {},
                        onLongClick = onLongClick,
                    ).semantics { role = Role.Button }
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
    Box(
        contentAlignment = Alignment.Center,
        modifier = Modifier
            .height(22.dp)
            .clip(shape)
            .background(accent.copy(alpha = if (isDark) 0.15f else 0.08f))
            .border(0.5.dp, accent.copy(alpha = if (isDark) 0.25f else 0.15f), shape)
            .let { base -> if (onClick == null) base else base.clickable(onClick = onClick) }
            .padding(horizontal = MeeshySpacing.xsPlus),
    ) {
        Text(text = "+$count", fontSize = MeeshyFontSize.footnote, fontWeight = FontWeight.Bold, color = accent)
    }
}

@Composable
private fun AddReactionChip(accent: Color, onClick: () -> Unit) {
    val isDark = MeeshyTheme.isDark
    val label = stringResource(R.string.bubble_add_reaction)
    Box(
        contentAlignment = Alignment.Center,
        modifier = Modifier
            .size(24.dp)
            .clip(CircleShape)
            .background(accent.copy(alpha = if (isDark) 0.18f else 0.14f))
            .border(0.5.dp, accent.copy(alpha = if (isDark) 0.4f else 0.28f), CircleShape)
            .clickable(onClickLabel = label, onClick = onClick)
            .semantics { contentDescription = label },
    ) {
        Icon(
            imageVector = Icons.Outlined.EmojiEmotions,
            contentDescription = null,
            tint = accent.copy(alpha = if (isDark) 0.9f else 0.8f),
            modifier = Modifier.size(14.dp),
        )
    }
}
