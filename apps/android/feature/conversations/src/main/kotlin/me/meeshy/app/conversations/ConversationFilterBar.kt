package me.meeshy.app.conversations

import androidx.annotation.StringRes
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.spring
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import me.meeshy.feature.conversations.R
import me.meeshy.sdk.model.ConversationFilter
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.hexColor

/**
 * Rangée COMPACTE de filtres composés sous le rail de stories (iOS `ConversationListFilterChipRow`).
 * Un appui pose le filtre, un second le retire. Chaque puce porte la couleur iOS de son filtre
 * ([ConversationFilter.colorHex]) ; l'état « sélectionné » se lit par l'aplat plein, le texte blanc et le
 * trait épais, et se DIT en plus (sémantique), jamais par la seule couleur.
 */
@Composable
fun ConversationFilterBar(
    selected: Set<ConversationFilter>,
    onToggle: (ConversationFilter) -> Unit,
    modifier: Modifier = Modifier,
) {
    val rowLabel = stringResource(R.string.conversations_filter_row)
    LazyRow(
        modifier = modifier.semantics { contentDescription = rowLabel },
        contentPadding = PaddingValues(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.xs),
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        items(ConversationFilter.entries, key = { it.name }) { filter ->
            ConversationFilterChip(
                title = stringResource(filter.labelRes()),
                colorHex = filter.colorHex,
                isSelected = filter in selected,
                onToggle = { onToggle(filter) },
            )
        }
    }
}

/** Style d'une puce : même rendu que `ThemedFilterChip(isCompact: true)` d'iOS. */
internal data class FilterChipStyle(
    val fill: Color,
    val label: Color,
    val border: Color,
    val borderWidth: Dp,
)

internal fun filterChipStyle(accent: Color, isSelected: Boolean, isDark: Boolean): FilterChipStyle =
    if (isSelected) {
        FilterChipStyle(fill = accent, label = Color.White, border = accent, borderWidth = SELECTED_BORDER)
    } else {
        FilterChipStyle(
            fill = accent.copy(alpha = if (isDark) 0.4f else 0.3f),
            label = accent,
            border = accent.copy(alpha = 0.7f),
            borderWidth = RESTING_BORDER,
        )
    }

internal val SELECTED_BORDER: Dp = 2.5.dp
internal val RESTING_BORDER: Dp = 1.dp

@Composable
private fun ConversationFilterChip(
    title: String,
    colorHex: String,
    isSelected: Boolean,
    onToggle: () -> Unit,
) {
    val style = filterChipStyle(hexColor(colorHex), isSelected, isSystemInDarkTheme())
    val haptics = rememberMeeshyHaptics()
    val reduceMotion = LocalReduceMotion.current
    val borderWidth by animateDpAsState(
        targetValue = style.borderWidth,
        animationSpec = if (reduceMotion) snap() else spring(dampingRatio = 0.8f, stiffness = SPRING_STIFFNESS),
        label = "filterChipBorder",
    )
    val hint = stringResource(R.string.conversations_filter_hint)
    val state = stringResource(
        if (isSelected) R.string.conversations_filter_state_selected else R.string.conversations_filter_state_unselected,
    )
    val shape = CircleShape
    Box(
        modifier = Modifier
            .heightIn(min = 48.dp)
            .clip(shape)
            .clickable(onClickLabel = hint, role = Role.Checkbox) {
                haptics.light()
                onToggle()
            }
            .semantics(mergeDescendants = true) {
                selected = isSelected
                stateDescription = state
                contentDescription = title
            },
        contentAlignment = Alignment.Center,
    ) {
        Box(
            modifier = Modifier
                .clip(shape)
                .background(style.fill, shape)
                .border(BorderStroke(borderWidth, style.border), shape)
                .padding(horizontal = 11.dp, vertical = 5.dp),
        ) {
            Text(
                text = title,
                color = style.label,
                fontSize = 11.sp,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.clearAndSetSemantics { },
            )
        }
    }
}

private const val SPRING_STIFFNESS = 438.6f

@StringRes
private fun ConversationFilter.labelRes(): Int = when (this) {
    ConversationFilter.ALL -> R.string.conversations_filter_all
    ConversationFilter.UNREAD -> R.string.conversations_filter_unread
    ConversationFilter.PERSONAL -> R.string.conversations_filter_personal
    ConversationFilter.PRIVATE -> R.string.conversations_filter_private
    ConversationFilter.OPEN -> R.string.conversations_filter_open
    ConversationFilter.GLOBAL -> R.string.conversations_filter_global
    ConversationFilter.CHANNELS -> R.string.conversations_filter_channels
    ConversationFilter.FAVORITES -> R.string.conversations_filter_favorites
    ConversationFilter.ARCHIVED -> R.string.conversations_filter_archived
}
