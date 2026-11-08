package me.meeshy.app.feed

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import me.meeshy.feature.feed.R
import me.meeshy.sdk.model.profile.ProfilePostsCounts
import me.meeshy.sdk.model.profile.ProfilePostsFilter
import me.meeshy.ui.component.chrome.MeeshyGlassSurface
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * La bande de trois tuiles verre en tête de l'onglet Postes (miroir de `ProfilePostsStatsBand` iOS) :
 * Publications et Réels filtrent la liste (re-toucher la tuile active remet tout), Stories ouvre
 * Mes stories pour soi et reste informative pour un tiers ([onStoriesTap] `null`). La tuile active est
 * bordée indigo 500 ; le profil n'étant lié à aucune conversation, l'accent est celui de la marque.
 */
@Composable
internal fun ProfilePostsFilterBand(
    counts: ProfilePostsCounts,
    selected: ProfilePostsFilter,
    onSelect: (ProfilePostsFilter) -> Unit,
    onStoriesTap: (() -> Unit)?,
    modifier: Modifier = Modifier,
) {
    Row(modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
        FilterTile(
            icon = MeeshyIcons.GridViewFilled,
            value = counts.posts,
            approximate = counts.isApproximate,
            label = stringResource(R.string.profile_posts_stat_posts),
            isSelected = selected == ProfilePostsFilter.POSTS,
            onClick = { onSelect(ProfilePostsFilter.POSTS) },
            modifier = Modifier.weight(1f),
        )
        FilterTile(
            icon = MeeshyIcons.Movie,
            value = counts.reels,
            approximate = counts.isApproximate,
            label = stringResource(R.string.profile_posts_stat_reels),
            isSelected = selected == ProfilePostsFilter.REELS,
            onClick = { onSelect(ProfilePostsFilter.REELS) },
            modifier = Modifier.weight(1f),
        )
        FilterTile(
            icon = MeeshyIcons.RadioUnchecked,
            value = counts.stories,
            approximate = counts.isApproximate,
            label = stringResource(R.string.profile_posts_stat_stories),
            isSelected = false,
            onClick = onStoriesTap,
            modifier = Modifier.weight(1f),
        )
    }
}

@Composable
private fun FilterTile(
    icon: ImageVector,
    value: Int,
    approximate: Boolean,
    label: String,
    isSelected: Boolean,
    onClick: (() -> Unit)?,
    modifier: Modifier = Modifier,
) {
    val haptics = rememberMeeshyHaptics()
    val display = ProfilePostsCounts.displayValue(value, approximate)
    val shape = RoundedCornerShape(MeeshyRadius.md)
    val tokens = MeeshyTheme.tokens
    val tap = onClick?.let { action -> { action(); haptics.light() } }
    MeeshyGlassSurface(
        shape = shape,
        modifier = modifier
            .heightIn(min = 48.dp)
            .border(BorderStroke(2.dp, if (isSelected) MeeshyPalette.Indigo500 else androidx.compose.ui.graphics.Color.Transparent), shape)
            .then(if (tap != null) Modifier.clickable(role = Role.Button, onClick = tap) else Modifier)
            .semantics(mergeDescendants = true) {
                contentDescription = "$display $label"
                if (tap != null) {
                    role = Role.Button
                    selected = isSelected
                }
            },
    ) {
        Column(
            Modifier.fillMaxWidth().padding(vertical = MeeshySpacing.md),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        ) {
            Icon(icon, contentDescription = null, tint = MeeshyPalette.Indigo500, modifier = Modifier.size(18.dp))
            Text(
                text = display,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                color = tokens.textPrimary,
                maxLines = 1,
            )
            Text(
                text = label,
                style = MaterialTheme.typography.labelSmall,
                color = tokens.textMuted,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}
