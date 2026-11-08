package me.meeshy.app.notifications

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
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.NotificationFilterCategory
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.hexColor

private val CHIP_MIN_HEIGHT = 44.dp
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
            .defaultMinSize(minHeight = CHIP_MIN_HEIGHT)
            .clickable(role = Role.Button) { onSelect(category) }
            .semantics { this.selected = isSelected }
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
