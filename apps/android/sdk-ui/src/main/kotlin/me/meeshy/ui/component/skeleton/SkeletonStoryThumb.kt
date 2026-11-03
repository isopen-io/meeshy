package me.meeshy.ui.component.skeleton

import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import me.meeshy.ui.R
import me.meeshy.ui.theme.MeeshyBorder
import me.meeshy.ui.theme.MeeshySpacing

/** Miroir de `SkeletonStoryThumb` (iOS) : anneau 96 / disque 88 + etiquette 72 x 7. Masque a TalkBack. */
@Composable
public fun SkeletonStoryThumb(modifier: Modifier = Modifier) {
    val g = SkeletonGeometry.StoryThumb
    Column(
        modifier = modifier.clearAndSetSemantics {},
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        Box(contentAlignment = Alignment.Center, modifier = Modifier.size(g.ring).border(MeeshyBorder.strong, skeletonRingColor(), CircleShape)) {
            SkeletonBlock(width = g.avatar, height = g.avatar, shape = CircleShape, color = skeletonPlaceholderColor())
        }
        SkeletonBlock(width = g.labelWidth, height = g.labelHeight, shape = RoundedCornerShape(3.dp), color = skeletonPlaceholderColor())
    }
}

/** Rangee de [count] vignettes-squelettes ; une seule annonce TalkBack pour tout le plateau. */
@Composable
public fun SkeletonStoryTrayRow(modifier: Modifier = Modifier, count: Int = SkeletonGeometry.StoryThumb.trayCount) {
    val label = stringResource(R.string.skeleton_stories_loading)
    Row(
        modifier = modifier
            .horizontalScroll(rememberScrollState(), enabled = false)
            .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.sm)
            .semantics(mergeDescendants = true) { contentDescription = label },
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        repeat(count) { SkeletonStoryThumb() }
    }
}
