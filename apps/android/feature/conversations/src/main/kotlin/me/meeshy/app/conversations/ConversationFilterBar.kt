package me.meeshy.app.conversations

import androidx.annotation.StringRes
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import me.meeshy.feature.conversations.R
import me.meeshy.sdk.model.ConversationFilter
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.hexColor

/**
 * Horizontally scrollable filter tabs mirroring the iOS conversation filter bar.
 * Each chip carries its iOS accent colour ([ConversationFilter.colorHex]) so the
 * selected state stays visually coherent across platforms.
 */
@Composable
fun ConversationFilterBar(
    selected: ConversationFilter,
    onSelect: (ConversationFilter) -> Unit,
    modifier: Modifier = Modifier,
) {
    LazyRow(
        modifier = modifier,
        contentPadding = PaddingValues(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.xs),
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        items(ConversationFilter.entries, key = { it.name }) { filter ->
            val accent: Color = hexColor(filter.colorHex)
            FilterChip(
                selected = filter == selected,
                onClick = { onSelect(filter) },
                label = { Text(stringResource(filter.labelRes())) },
                colors = FilterChipDefaults.filterChipColors(
                    selectedContainerColor = accent.copy(alpha = 0.18f),
                    selectedLabelColor = accent,
                ),
                border = FilterChipDefaults.filterChipBorder(
                    enabled = true,
                    selected = filter == selected,
                    selectedBorderColor = accent,
                ),
            )
        }
    }
}

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
