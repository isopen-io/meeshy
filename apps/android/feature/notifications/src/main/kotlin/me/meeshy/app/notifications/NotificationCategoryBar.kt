package me.meeshy.app.notifications

import androidx.annotation.StringRes
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AlternateEmail
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.ChatBubble
import androidx.compose.material.icons.filled.Circle
import androidx.compose.material.icons.filled.EmojiEvents
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.ThumbUp
import androidx.compose.material.icons.filled.Translate
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import me.meeshy.feature.notifications.R
import me.meeshy.sdk.model.NotificationFilterCategory
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.hexColor

private val CHIP_ANIMATION = tween<Color>(durationMillis = 200)

/**
 * La barre de catégories de la cloche — miroir du `filterBar` d'iOS : les douze puces, toujours
 * visibles (même une liste vide a ses filtres), la puce choisie pleine à la couleur de sa
 * catégorie, les autres teintées. La couleur glisse d'une puce à l'autre (`animateColorAsState`),
 * et chaque puce est une feuille isolée : choisir l'une ne recompose que l'ancienne et la nouvelle.
 */
@Composable
internal fun NotificationCategoryBar(
    selected: NotificationFilterCategory,
    onSelect: (NotificationFilterCategory) -> Unit,
    modifier: Modifier = Modifier,
) {
    LazyRow(
        modifier = modifier,
        contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.sm),
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        items(NotificationFilterCategory.entries, key = { it.name }) { category ->
            NotificationCategoryChip(category = category, isSelected = category == selected, onSelect = onSelect)
        }
    }
}

@Composable
private fun NotificationCategoryChip(
    category: NotificationFilterCategory,
    isSelected: Boolean,
    onSelect: (NotificationFilterCategory) -> Unit,
) {
    val tint = remember(category) { hexColor(category.accentHex) }
    val container by animateColorAsState(if (isSelected) tint else tint.copy(alpha = 0.12f), CHIP_ANIMATION, label = "chip-container")
    val content by animateColorAsState(if (isSelected) Color.White else tint, CHIP_ANIMATION, label = "chip-content")
    Row(
        modifier = Modifier
            .clip(CircleShape)
            .background(container)
            .clickable(role = Role.Tab) { onSelect(category) }
            .semantics { this.selected = isSelected; role = Role.Tab }
            .defaultMinSize(minHeight = 36.dp)
            .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.xs),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        Icon(category.icon(), contentDescription = null, tint = content, modifier = Modifier.size(12.dp))
        Text(
            text = stringResource(category.labelRes()),
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.SemiBold,
            color = content,
        )
    }
}

internal fun NotificationFilterCategory.icon(): ImageVector = when (this) {
    NotificationFilterCategory.ALL -> Icons.Filled.Notifications
    NotificationFilterCategory.UNREAD -> Icons.Filled.Circle
    NotificationFilterCategory.MESSAGES -> Icons.Filled.ChatBubble
    NotificationFilterCategory.REACTIONS -> Icons.Filled.Favorite
    NotificationFilterCategory.MENTIONS -> Icons.Filled.AlternateEmail
    NotificationFilterCategory.SOCIAL -> Icons.Filled.ThumbUp
    NotificationFilterCategory.ENGAGEMENT -> Icons.Filled.EmojiEvents
    NotificationFilterCategory.CONTACTS -> Icons.Filled.PersonAdd
    NotificationFilterCategory.GROUPS -> Icons.Filled.Groups
    NotificationFilterCategory.CALLS -> Icons.Filled.Call
    NotificationFilterCategory.TRANSLATIONS -> Icons.Filled.Translate
    NotificationFilterCategory.SYSTEM -> Icons.Filled.Settings
}

@StringRes
internal fun NotificationFilterCategory.labelRes(): Int = when (this) {
    NotificationFilterCategory.ALL -> R.string.notifications_category_all
    NotificationFilterCategory.UNREAD -> R.string.notifications_category_unread
    NotificationFilterCategory.MESSAGES -> R.string.notifications_category_messages
    NotificationFilterCategory.REACTIONS -> R.string.notifications_category_reactions
    NotificationFilterCategory.MENTIONS -> R.string.notifications_category_mentions
    NotificationFilterCategory.SOCIAL -> R.string.notifications_category_social
    NotificationFilterCategory.ENGAGEMENT -> R.string.notifications_category_engagement
    NotificationFilterCategory.CONTACTS -> R.string.notifications_category_contacts
    NotificationFilterCategory.GROUPS -> R.string.notifications_category_groups
    NotificationFilterCategory.CALLS -> R.string.notifications_category_calls
    NotificationFilterCategory.TRANSLATIONS -> R.string.notifications_category_translations
    NotificationFilterCategory.SYSTEM -> R.string.notifications_category_system
}

@StringRes
internal fun NotificationFilterCategory.emptyRes(): Int = when (this) {
    NotificationFilterCategory.ALL -> R.string.notifications_empty
    NotificationFilterCategory.UNREAD -> R.string.notifications_empty_unread
    NotificationFilterCategory.MESSAGES -> R.string.notifications_empty_messages
    NotificationFilterCategory.REACTIONS -> R.string.notifications_empty_reactions
    NotificationFilterCategory.MENTIONS -> R.string.notifications_empty_mentions
    NotificationFilterCategory.SOCIAL -> R.string.notifications_empty_social
    NotificationFilterCategory.ENGAGEMENT -> R.string.notifications_empty_engagement
    NotificationFilterCategory.CONTACTS -> R.string.notifications_empty_contacts
    NotificationFilterCategory.GROUPS -> R.string.notifications_empty_groups
    NotificationFilterCategory.CALLS -> R.string.notifications_empty_calls
    NotificationFilterCategory.TRANSLATIONS -> R.string.notifications_empty_translations
    NotificationFilterCategory.SYSTEM -> R.string.notifications_empty_system
}
