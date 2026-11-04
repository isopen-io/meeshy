package me.meeshy.ui.component.packs

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import me.meeshy.sdk.model.pack.PackShopPage
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/** Un onglet de la barre : sa page et son titre localisé. */
@Immutable
public data class PackShopTabEntry(val page: PackShopPage, val title: String)

/**
 * **La barre d'onglets d'une Boutique** (miroir de `PackShopTabBar`, iOS) : des capsules qui défilent, la Boutique
 * d'abord puis un onglet par pack installé. L'onglet choisi est plein, les autres discrets ; un tap pose un haptique
 * léger. L'état « sélectionné » est aussi porté par la sémantique, jamais par la seule couleur.
 */
@Composable
public fun PackShopTabBar(
    entries: List<PackShopTabEntry>,
    selection: PackShopPage,
    onSelect: (PackShopPage) -> Unit,
    modifier: Modifier = Modifier,
) {
    val haptics = rememberMeeshyHaptics()
    Row(
        modifier = modifier.horizontalScroll(rememberScrollState()).padding(horizontal = MeeshySpacing.lg),
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        entries.forEach { entry ->
            val selected = entry.page == selection
            PackShopTab(entry, selected) {
                if (!selected) haptics.light()
                onSelect(entry.page)
            }
        }
    }
}

@Composable
private fun PackShopTab(entry: PackShopTabEntry, selected: Boolean, onClick: () -> Unit) {
    val ink = if (selected) Color.White else MeeshyTheme.tokens.textPrimary
    val fill = if (selected) MeeshyPalette.Indigo500 else MeeshyTheme.tokens.surfaceFill
    Row(
        modifier = Modifier
            .defaultMinSize(minHeight = 48.dp)
            .clip(RoundedCornerShape(MeeshyRadius.pill))
            .background(fill)
            .clickable(onClick = onClick)
            .semantics(mergeDescendants = true) {
                role = Role.Tab
                this.selected = selected
                contentDescription = entry.title
            }
            .padding(horizontal = 14.dp),
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xsPlus),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (entry.page == PackShopPage.Shop) {
            Icon(MeeshyIcons.ShoppingFilled, contentDescription = null, tint = ink, modifier = Modifier.size(14.dp))
        }
        Text(
            text = entry.title,
            color = ink,
            fontSize = 13.sp,
            fontWeight = FontWeight.SemiBold,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}
