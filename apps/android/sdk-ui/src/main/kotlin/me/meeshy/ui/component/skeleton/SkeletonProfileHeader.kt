package me.meeshy.ui.component.skeleton

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import me.meeshy.ui.R
import me.meeshy.ui.theme.MeeshyOpacity
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing

/**
 * Miroir de `SkeletonProfileHeader` (iOS) : banniere 120, avatar 90 qui la chevauche de moitie, identite, bio, 3 stats.
 * Meme geometrie que l'en-tete reel : le passage au contenu ne saute pas.
 */
@Composable
public fun SkeletonProfileHeader(modifier: Modifier = Modifier) {
    val g = SkeletonGeometry.ProfileHeader
    val label = stringResource(R.string.skeleton_profile_loading)
    val placeholder = skeletonPlaceholderColor()
    Column(
        modifier = modifier
            .fillMaxWidth()
            .semantics(mergeDescendants = true) { contentDescription = label },
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xxl),
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            SkeletonShape(modifier = Modifier.fillMaxWidth(), height = g.banner, cornerRadius = g.bannerRadius)
            Box(Modifier.offset(y = -g.avatar / 2)) {
                SkeletonBlock(
                    modifier = Modifier.border(g.avatarRing, skeletonRingColor(), CircleShape),
                    width = g.avatar,
                    height = g.avatar,
                    shape = CircleShape,
                    color = placeholder,
                )
            }
        }
        Column(
            modifier = Modifier.offset(y = -g.avatar / 2).padding(top = MeeshySpacing.sm),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
        ) {
            SkeletonShape(width = g.nameWidth, height = g.nameHeight, cornerRadius = 6.dp)
            SkeletonShape(width = g.handleWidth, height = g.handleHeight, cornerRadius = MeeshyRadius.xxs)
        }
        Column(
            modifier = Modifier.fillMaxWidth().offset(y = -g.avatar / 2),
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
        ) {
            repeat(g.bioLineCount) { index ->
                val last = index == g.bioLineCount - 1
                SkeletonShape(
                    modifier = Modifier.fillMaxWidth().let { if (last) it.widthIn(max = g.bioLastLineMaxWidth) else it },
                    height = 12.dp,
                    cornerRadius = MeeshyRadius.xxs,
                )
            }
        }
        Row(
            modifier = Modifier.fillMaxWidth().offset(y = -g.avatar / 2),
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
        ) {
            repeat(g.statCount) {
                Column(
                    modifier = Modifier
                        .weight(1f)
                        .background(placeholder.copy(alpha = MeeshyOpacity.strong), RoundedCornerShape(MeeshyRadius.md))
                        .padding(vertical = MeeshySpacing.mdPlus),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xsPlus),
                ) {
                    SkeletonShape(width = g.statValueWidth, height = g.statValueHeight, cornerRadius = 6.dp)
                    SkeletonShape(width = g.statLabelWidth, height = g.statLabelHeight, cornerRadius = MeeshyRadius.xxs)
                }
            }
        }
    }
}
