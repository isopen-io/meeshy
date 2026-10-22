package me.meeshy.app.conversations

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Archive
import androidx.compose.material.icons.filled.PushPin
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.SwipeToDismissBoxValue
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import me.meeshy.feature.conversations.R
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun SwipeActionBackground(
    direction: SwipeToDismissBoxValue,
    isPinned: Boolean,
    isArchived: Boolean,
) {
    val (alignment, icon, description, background) = when (direction) {
        SwipeToDismissBoxValue.StartToEnd -> SwipeActionVisual(
            alignment = Alignment.CenterStart,
            icon = Icons.Filled.PushPin,
            description = stringResource(
                if (isPinned) R.string.conversations_action_unpin
                else R.string.conversations_action_pin,
            ),
            background = MeeshyPalette.Warning.copy(alpha = 0.20f),
        )
        SwipeToDismissBoxValue.EndToStart -> SwipeActionVisual(
            alignment = Alignment.CenterEnd,
            icon = Icons.Filled.Archive,
            description = stringResource(
                if (isArchived) R.string.conversations_action_unarchive
                else R.string.conversations_action_archive,
            ),
            background = MeeshyTheme.tokens.backgroundTertiary,
        )
        SwipeToDismissBoxValue.Settled -> SwipeActionVisual(
            alignment = Alignment.CenterStart,
            icon = Icons.Filled.PushPin,
            description = "",
            background = Color.Transparent,
        )
    }
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(background)
            .padding(horizontal = MeeshySpacing.xl),
        contentAlignment = alignment,
    ) {
        if (direction != SwipeToDismissBoxValue.Settled) {
            Icon(
                imageVector = icon,
                contentDescription = description,
                tint = MeeshyTheme.tokens.textSecondary,
            )
        }
    }
}

private data class SwipeActionVisual(
    val alignment: Alignment,
    val icon: androidx.compose.ui.graphics.vector.ImageVector,
    val description: String,
    val background: Color,
)
