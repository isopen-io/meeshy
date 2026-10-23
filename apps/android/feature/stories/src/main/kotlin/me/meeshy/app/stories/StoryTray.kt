package me.meeshy.app.stories

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.stories.R
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme


/**
 * Horizontal story-ring carousel rendered atop the conversation list — the
 * Android port of `StoryTrayView`. Hidden entirely when there is nothing to
 * show (no blocking skeleton; cache-first behaviour stays instant).
 */
@Composable
fun StoryTray(
    onOpenStory: (String) -> Unit,
    modifier: Modifier = Modifier,
    onAddStory: () -> Unit = {},
    onShowProfile: ((String) -> Unit)? = null,
    moodEmojiOf: (String) -> String? = { null },
    viewModel: StoriesViewModel = hiltViewModel(),
    impressions: StoryTrayImpressionsViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val tray = state.tray
    val failures = state.failedPublishes
    if (tray.isEmpty && failures.isEmpty()) {
        if (state.showSkeleton) StoryTraySkeleton(modifier)
        return
    }

    Column(modifier = modifier) {
        if (failures.isNotEmpty()) {
            StoryFailedStrip(
                failures = failures,
                onRetry = viewModel::retryPublish,
                onDiscard = viewModel::discardPublish,
            )
        }
        if (!tray.isEmpty) {
            LazyRow(
                modifier = Modifier.heightIn(min = StoryEntryMetrics.height),
                horizontalArrangement = Arrangement.spacedBy(StoryEntryMetrics.itemSpacing),
                contentPadding = PaddingValues(
                    horizontal = StoryEntryMetrics.paddingHorizontal,
                    vertical = StoryEntryMetrics.paddingVertical,
                ),
            ) {
                val selfRing = tray.self
                if (selfRing != null) {
                    item(key = "self", contentType = RING_CONTENT_TYPE) {
                        StoryRingCell(
                            ring = selfRing,
                            label = stringResource(R.string.stories_my_story),
                            cascadeIndex = 0,
                            moodEmoji = moodEmojiOf(selfRing.userId),
                            showAddBadge = true,
                            onOpen = { onOpenStory(selfRing.userId) },
                            onShowProfile = onShowProfile?.let { open -> { open(selfRing.userId) } },
                            onAdd = onAddStory,
                            onAppeared = impressions::onRingAppeared,
                        )
                    }
                } else {
                    item(key = "add", contentType = ADD_CONTENT_TYPE) {
                        AddStoryItem(onClick = onAddStory)
                    }
                }
                itemsIndexed(tray.others, key = { _, ring -> ring.userId }, contentType = { _, _ -> RING_CONTENT_TYPE }) { index, ring ->
                    StoryRingCell(
                        ring = ring,
                        label = ring.displayName,
                        cascadeIndex = index + 1,
                        moodEmoji = moodEmojiOf(ring.userId),
                        showAddBadge = false,
                        onOpen = { onOpenStory(ring.userId) },
                        onShowProfile = onShowProfile?.let { open -> { open(ring.userId) } },
                        onAppeared = impressions::onRingAppeared,
                    )
                }
            }
        }
    }
}

private const val RING_CONTENT_TYPE = "ring"
private const val ADD_CONTENT_TYPE = "add"

/**
 * The "failed to post" strip shown above the tray when one or more story
 * publishes have exhausted their durable-outbox retries. Each row shows the
 * story preview with an explicit **Retry** and **Discard** — no dead end, no
 * silent loss (surpasses iOS, whose optimistic story just evaporates). Survives
 * process death because it is derived from the durable outbox.
 */
@Composable
private fun StoryFailedStrip(
    failures: List<StoryPublishFailures.Item>,
    onRetry: (String) -> Unit,
    onDiscard: (String) -> Unit,
) {
    Column(
        modifier = Modifier.padding(
            horizontal = MeeshySpacing.md,
            vertical = MeeshySpacing.xs,
        ),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        failures.forEach { failure ->
            StoryFailedRow(
                failure = failure,
                onRetry = { onRetry(failure.cmid) },
                onDiscard = { onDiscard(failure.cmid) },
            )
        }
    }
}

@Composable
private fun StoryFailedRow(
    failure: StoryPublishFailures.Item,
    onRetry: () -> Unit,
    onDiscard: () -> Unit,
) {
    val errorColor = MeeshyTheme.tokens.error
    Row(
        modifier = Modifier
            .clip(MaterialTheme.shapes.medium)
            .background(errorColor.copy(alpha = 0.10f))
            .padding(horizontal = MeeshySpacing.sm, vertical = MeeshySpacing.xs),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        Icon(
            Icons.Filled.ErrorOutline,
            contentDescription = null,
            tint = errorColor,
            modifier = Modifier.size(18.dp),
        )
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = stringResource(R.string.stories_publish_failed_title),
                style = MaterialTheme.typography.labelMedium,
                color = errorColor,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            val secondary = failure.preview.ifBlank {
                pluralStringResource(
                    R.plurals.stories_publish_media_summary,
                    failure.mediaCount,
                    failure.mediaCount,
                )
            }
            Text(
                text = secondary,
                style = MaterialTheme.typography.bodySmall,
                color = MeeshyTheme.tokens.textSecondary,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        TextButton(onClick = onRetry) {
            Text(stringResource(R.string.stories_publish_retry))
        }
        val discardLabel = stringResource(R.string.stories_publish_discard)
        IconButton(
            onClick = onDiscard,
            modifier = Modifier.semantics { contentDescription = discardLabel },
        ) {
            Icon(
                Icons.Filled.Close,
                contentDescription = null,
                tint = MeeshyTheme.tokens.textSecondary,
                modifier = Modifier.size(18.dp),
            )
        }
    }
}

/**
 * Cold-start placeholder shown only when the cache is genuinely empty (no rows
 * yet). A warm start paints the real tray straight from Room, so this never
 * flashes over cached data (Instant-App principles).
 */
@Composable
private fun StoryTraySkeleton(modifier: Modifier = Modifier) {
    LazyRow(
        modifier = modifier.semantics { contentDescription = "" },
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        contentPadding = PaddingValues(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.sm),
        userScrollEnabled = false,
    ) {
        items(SKELETON_PLACEHOLDER_COUNT) {
            Box(
                modifier = Modifier
                    .width(StoryEntryMetrics.labelWidth)
                    .size(StoryEntryMetrics.ring)
                    .clip(CircleShape)
                    .background(MeeshyTheme.tokens.backgroundTertiary),
            )
        }
    }
}

private const val SKELETON_PLACEHOLDER_COUNT = 4

@Composable
private fun AddStoryItem(onClick: () -> Unit) {
    val addLabel = stringResource(R.string.stories_my_story)
    Column(
        modifier = Modifier
            .width(StoryEntryMetrics.labelWidth)
            .clickable(onClick = onClick)
            .semantics { role = Role.Button; contentDescription = addLabel },
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(
            modifier = Modifier
                .size(StoryEntryMetrics.ring)
                .clip(CircleShape)
                .background(MeeshyTheme.tokens.backgroundTertiary),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                Icons.Filled.Add,
                contentDescription = null,
                tint = MeeshyPalette.Indigo500,
                modifier = Modifier.size(26.dp),
            )
        }
        StoryLabel(addLabel, unread = false)
    }
}
