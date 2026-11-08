package me.meeshy.app.feed

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.runtime.Composable
import me.meeshy.ui.component.skeleton.SkeletonFeedPost
import me.meeshy.ui.component.skeleton.SkeletonGeometry
import me.meeshy.ui.theme.MeeshySpacing

/** Le froid du fil : des publications-squelettes aux dimensions exactes d'iOS (`SkeletonFeedList`). */
@Composable
internal fun FeedSkeleton() {
    LazyColumn(
        contentPadding = PaddingValues(vertical = MeeshySpacing.lg),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.lg),
        userScrollEnabled = false,
    ) {
        items(List(SkeletonGeometry.FeedPost.listCount) { it }) { SkeletonFeedPost() }
    }
}
