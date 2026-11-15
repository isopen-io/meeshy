package me.meeshy.ui.component.skeleton

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.border
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
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
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing

/** Miroir de `SkeletonFeedPost` (iOS) : entete 40, 3 lignes dont la derniere a 220, media 200, 4 actions. */
@Composable
public fun SkeletonFeedPost(modifier: Modifier = Modifier) {
    val g = SkeletonGeometry.FeedPost
    val placeholder = skeletonPlaceholderColor()
    val label = stringResource(R.string.skeleton_feed_post_loading)
    val shape = RoundedCornerShape(MeeshyRadius.lgPlus)
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = MeeshySpacing.lg)
            .background(skeletonCardBackground(), shape)
            .border(BorderStroke(1.dp, skeletonCardBackground()), shape)
            .padding(MeeshySpacing.lg)
            .semantics(mergeDescendants = true) { contentDescription = label },
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md), verticalAlignment = Alignment.CenterVertically) {
            SkeletonBlock(width = g.avatar, height = g.avatar, shape = CircleShape, color = placeholder)
            Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xsPlus)) {
                SkeletonShape(width = g.nameWidth, height = g.nameHeight, cornerRadius = MeeshyRadius.xxs)
                SkeletonShape(width = g.metaWidth, height = g.metaHeight, cornerRadius = MeeshyRadius.xxs)
            }
            Spacer(Modifier.weight(1f))
            SkeletonShape(width = g.trailingWidth, height = g.metaHeight, cornerRadius = MeeshyRadius.xxs)
        }
        Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
            repeat(g.bodyLineCount) { index ->
                val last = index == g.bodyLineCount - 1
                SkeletonShape(
                    modifier = Modifier.fillMaxWidth().let { if (last) it.widthIn(max = g.lastLineMaxWidth) else it },
                    height = g.bodyLineHeight,
                    cornerRadius = MeeshyRadius.xxs,
                )
            }
        }
        SkeletonShape(modifier = Modifier.fillMaxWidth(), height = g.mediaHeight, cornerRadius = g.mediaRadius)
        Row(
            modifier = Modifier.padding(top = MeeshySpacing.xs),
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.lg),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            repeat(g.actionCount) {
                Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xsPlus), verticalAlignment = Alignment.CenterVertically) {
                    SkeletonBlock(width = g.actionGlyph, height = g.actionGlyph, shape = CircleShape, color = placeholder)
                    SkeletonShape(width = g.actionLabelWidth, height = g.actionLabelHeight, cornerRadius = MeeshyRadius.xxs)
                }
            }
        }
    }
}

/** Pile de [count] publications-squelettes (froid du fil). */
@Composable
public fun SkeletonFeedList(modifier: Modifier = Modifier, count: Int = SkeletonGeometry.FeedPost.listCount) {
    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(MeeshySpacing.lg)) {
        repeat(count) { SkeletonFeedPost() }
    }
}
