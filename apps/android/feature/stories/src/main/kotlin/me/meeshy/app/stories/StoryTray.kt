package me.meeshy.app.stories

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil.compose.AsyncImage
import me.meeshy.feature.stories.R
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.hexColor

private val RING_SIZE = 64.dp
private val AVATAR_SIZE = 56.dp
private val ITEM_WIDTH = 72.dp

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
    viewModel: StoriesViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val tray = state.tray
    if (tray.isEmpty) {
        if (state.showSkeleton) StoryTraySkeleton(modifier)
        return
    }

    LazyRow(
        modifier = modifier,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        contentPadding = PaddingValues(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.sm),
    ) {
        tray.self?.let { self ->
            item(key = "self") {
                StoryRingItem(
                    ring = self,
                    label = stringResource(R.string.stories_my_story),
                    showAddBadge = true,
                    onClick = { onOpenStory(self.userId) },
                )
            }
        }
        if (tray.self == null) {
            item(key = "add") {
                AddStoryItem(onClick = onAddStory)
            }
        }
        items(tray.others, key = { it.userId }) { ring ->
            StoryRingItem(
                ring = ring,
                label = ring.displayName,
                showAddBadge = false,
                onClick = { onOpenStory(ring.userId) },
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
                    .width(ITEM_WIDTH)
                    .size(RING_SIZE)
                    .clip(CircleShape)
                    .background(MeeshyTheme.tokens.backgroundTertiary),
            )
        }
    }
}

private const val SKELETON_PLACEHOLDER_COUNT = 4

@Composable
private fun StoryRingItem(
    ring: StoryRing,
    label: String,
    showAddBadge: Boolean,
    onClick: () -> Unit,
) {
    val openDescription = stringResource(R.string.stories_open, label)
    Column(
        modifier = Modifier
            .width(ITEM_WIDTH)
            .clickable(onClick = onClick)
            .semantics { role = Role.Button; contentDescription = openDescription },
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        StoryRingFrame(accentHex = ring.accentHex, active = ring.hasUnviewed) {
            if (ring.avatarUrl != null) {
                AsyncImage(
                    model = ring.avatarUrl,
                    contentDescription = null,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier
                        .size(AVATAR_SIZE)
                        .clip(CircleShape),
                )
            } else {
                MeeshyAvatar(
                    name = ring.displayName,
                    size = AVATAR_SIZE,
                    containerColor = hexColor(ring.accentHex),
                )
            }
            if (showAddBadge) {
                Box(
                    modifier = Modifier
                        .align(Alignment.BottomEnd)
                        .size(20.dp)
                        .clip(CircleShape)
                        .background(MeeshyPalette.Indigo500),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        Icons.Filled.Add,
                        contentDescription = null,
                        tint = MeeshyPalette.White,
                        modifier = Modifier.size(14.dp),
                    )
                }
            }
        }
        StoryCountDotsRow(
            dots = StoryCountDots.from(ring.storyCount, ring.unviewedCount),
            accentHex = ring.accentHex,
            unviewedCount = ring.unviewedCount,
            storyCount = ring.storyCount,
        )
        StoryLabel(label)
    }
}

@Composable
private fun AddStoryItem(onClick: () -> Unit) {
    val addLabel = stringResource(R.string.stories_my_story)
    Column(
        modifier = Modifier
            .width(ITEM_WIDTH)
            .clickable(onClick = onClick)
            .semantics { role = Role.Button; contentDescription = addLabel },
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(
            modifier = Modifier
                .size(RING_SIZE)
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
        StoryLabel(addLabel)
    }
}

@Composable
private fun StoryRingFrame(
    accentHex: String,
    active: Boolean,
    content: @Composable androidx.compose.foundation.layout.BoxScope.() -> Unit,
) {
    val ringBrush = if (active) {
        Brush.linearGradient(
            listOf(hexColor(accentHex), MeeshyPalette.Indigo500, hexColor(accentHex)),
        )
    } else {
        Brush.linearGradient(
            listOf(MeeshyTheme.tokens.backgroundTertiary, MeeshyTheme.tokens.backgroundTertiary),
        )
    }
    Box(
        modifier = Modifier
            .size(RING_SIZE)
            .clip(CircleShape)
            .border(width = 2.5.dp, brush = ringBrush, shape = CircleShape),
        contentAlignment = Alignment.Center,
        content = content,
    )
}

/**
 * Segmented unviewed-count dots under a story ring. Active (unseen) dots use the
 * ring's accent; seen dots fade to a muted token — a precise "how many new" read
 * that surpasses iOS's group-level all-or-nothing dimming. Single-story rings
 * render an empty slot of the same height so every tray item — and its label —
 * stays vertically aligned (no off-by-a-row jitter across the carousel).
 */
@Composable
private fun StoryCountDotsRow(
    dots: StoryCountDots?,
    accentHex: String,
    unviewedCount: Int,
    storyCount: Int,
) {
    val activeColor = hexColor(accentHex)
    val inactiveColor = MeeshyTheme.tokens.textSecondary.copy(alpha = 0.35f)
    val description = stringResource(R.string.stories_count_dots, unviewedCount, storyCount)
    Row(
        modifier = Modifier
            .padding(top = 3.dp)
            .height(DOT_SIZE)
            .semantics { if (dots != null) contentDescription = description },
        horizontalArrangement = Arrangement.spacedBy(DOT_SPACING),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (dots == null) return@Row
        repeat(dots.dotCount) { index ->
            Box(
                modifier = Modifier
                    .size(DOT_SIZE)
                    .clip(CircleShape)
                    .background(if (dots.isActive(index)) activeColor else inactiveColor),
            )
        }
        if (dots.hasOverflow) {
            Text(
                text = "+",
                style = MaterialTheme.typography.labelSmall,
                color = inactiveColor,
                fontWeight = FontWeight.Bold,
            )
        }
    }
}

private val DOT_SIZE = 4.dp
private val DOT_SPACING = 3.dp

@Composable
private fun StoryLabel(label: String) {
    Text(
        text = label,
        style = MaterialTheme.typography.labelSmall,
        color = MeeshyTheme.tokens.textSecondary,
        fontWeight = FontWeight.Medium,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
        textAlign = TextAlign.Center,
        modifier = Modifier.width(ITEM_WIDTH),
    )
}
