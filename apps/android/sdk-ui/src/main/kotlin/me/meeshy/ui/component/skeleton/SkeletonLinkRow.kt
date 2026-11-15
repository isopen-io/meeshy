package me.meeshy.ui.component.skeleton

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
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
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing

/** Miroir de `SkeletonLinkRow` (iOS) : pastille 40, titre et sous-titre a largeurs alternees, glyphe de fin. */
@Composable
public fun SkeletonLinkRow(modifier: Modifier = Modifier, index: Int = 0) {
    val g = SkeletonGeometry.LinkRow
    val label = stringResource(R.string.skeleton_link_row_loading)
    val shape = RoundedCornerShape(MeeshyRadius.md)
    Row(
        modifier = modifier
            .fillMaxWidth()
            .background(skeletonCardBackground(), shape)
            .border(BorderStroke(1.dp, skeletonCardBackground()), shape)
            .padding(MeeshySpacing.mdPlus)
            .semantics(mergeDescendants = true) { contentDescription = label },
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        SkeletonBlock(width = g.avatar, height = g.avatar, shape = CircleShape, color = skeletonPlaceholderColor())
        Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xsPlus)) {
            SkeletonShape(width = g.titleWidth(index), height = g.titleHeight, cornerRadius = MeeshyRadius.xxs)
            SkeletonShape(width = g.subtitleWidth(index), height = g.subtitleHeight, cornerRadius = MeeshyRadius.xxs)
        }
        Spacer(Modifier.weight(1f))
        SkeletonShape(width = g.trailing, height = g.trailing, cornerRadius = 6.dp)
    }
}

/** Pile de [count] rangees-squelettes (froid des listes de liens). */
@Composable
public fun SkeletonLinkList(modifier: Modifier = Modifier, count: Int = SkeletonGeometry.LinkRow.listCount) {
    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
        repeat(count) { SkeletonLinkRow(index = it) }
    }
}
