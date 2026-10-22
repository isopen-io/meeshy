package me.meeshy.app.conversations

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.testTag
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import me.meeshy.ui.component.MeeshySkeletonBox
import me.meeshy.ui.theme.MeeshyMotion
import me.meeshy.ui.theme.MeeshySpacing

/**
 * Geometry and rhythm of the cold-start skeleton (iOS `LentilleSkeletonRow` +
 * `ConversationListEmptyState.skeleton`): six rows, each as tall as a real row so the
 * list does not jump when the placeholders are replaced, entering 0.04 s apart.
 */
internal object ConversationSkeletonMetrics {
    const val ROW_COUNT: Int = 6
    val rowHeight: Dp = 84.dp
    val avatarSize: Dp = 44.dp
    val nameBarWidth: Dp = 150.dp
    val previewBarWidth: Dp = 220.dp
    val dateBarWidth: Dp = 36.dp
    val barHeight: Dp = 12.dp
    const val FADE_IN_MILLIS: Int = 220
    const val TEST_TAG: String = "conversation-skeleton-row"

    /** Delay before the row at [index] appears — iOS `staggeredAppear(baseDelay: 0.04)`. */
    fun appearDelayMillis(index: Int): Int = MeeshyMotion.staggerDelayMillis(index)
}

/**
 * One skeleton row: avatar disc + three bars (name, preview, date on the trailing edge).
 * Hidden from TalkBack — a placeholder announces nothing.
 */
@Composable
internal fun ConversationSkeletonRow(index: Int, modifier: Modifier = Modifier) {
    val alpha = remember { Animatable(0f) }
    LaunchedEffect(index) {
        delay(ConversationSkeletonMetrics.appearDelayMillis(index).toLong())
        alpha.animateTo(1f, tween(ConversationSkeletonMetrics.FADE_IN_MILLIS))
    }
    Row(
        modifier = modifier
            .fillMaxWidth()
            .height(ConversationSkeletonMetrics.rowHeight)
            .graphicsLayer { this.alpha = alpha.value }
            .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.smPlus)
            .clearAndSetSemantics { testTag = ConversationSkeletonMetrics.TEST_TAG },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        MeeshySkeletonBox(
            modifier = Modifier.size(ConversationSkeletonMetrics.avatarSize),
            shape = CircleShape,
        )
        Column(
            modifier = Modifier.padding(start = MeeshySpacing.md).weight(1f),
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xsPlus),
        ) {
            MeeshySkeletonBox(
                Modifier.size(ConversationSkeletonMetrics.nameBarWidth, ConversationSkeletonMetrics.barHeight),
            )
            MeeshySkeletonBox(
                Modifier.size(ConversationSkeletonMetrics.previewBarWidth, ConversationSkeletonMetrics.barHeight),
            )
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                MeeshySkeletonBox(
                    Modifier.size(ConversationSkeletonMetrics.dateBarWidth, ConversationSkeletonMetrics.barHeight),
                )
            }
        }
    }
}
