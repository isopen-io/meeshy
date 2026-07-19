package me.meeshy.app.feed

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Repeat
import androidx.compose.material.icons.filled.WarningAmber
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Popup
import androidx.compose.ui.window.PopupProperties
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.feed.R
import me.meeshy.sdk.model.EmojiCatalog
import me.meeshy.sdk.model.MoodStatusExpiry
import me.meeshy.sdk.model.StatusEntry
import me.meeshy.ui.component.chrome.MeeshyGlassSurface
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.hexColor

/**
 * The mood-statuses bar — a horizontal rail of emoji pills at the top of the feed,
 * the Android port of iOS `StatusBarView`. All layout decisions come from the pure
 * [buildStatusBarCells]; this Composable is glue: it renders each [StatusBarCell],
 * fires [StatusesViewModel.loadMoreIfNeeded] as pills scroll into view, and shows a
 * tap-to-view popover ([statusPopoverModel]) over a selected status. Tapping the
 * leading add cell opens the [StatusComposerSheet], which publishes through
 * [StatusesViewModel.setStatus] (all composer rules live in [StatusComposerDraft]).
 */
@Composable
fun StatusBarView(
    modifier: Modifier = Modifier,
    viewModel: StatusesViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val cells = remember(state) { buildStatusBarCells(state) }
    var selected by remember { mutableStateOf<StatusEntry?>(null) }
    var composerSeed by remember { mutableStateOf<StatusComposerDraft?>(null) }

    LazyRow(
        modifier = modifier.height(STATUS_BAR_HEIGHT),
        contentPadding = PaddingValues(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.xs),
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        items(cells, key = ::cellKey) { cell ->
            when (cell) {
                is StatusBarCell.MyStatus -> StatusPill(
                    emoji = cell.entry.moodEmoji,
                    label = stringResource(R.string.status_bar_me),
                    accentHex = cell.entry.avatarColor,
                    labelColor = MeeshyTheme.tokens.textPrimary,
                    contentDescription = stringResource(
                        R.string.status_bar_my_status_label,
                        cell.entry.moodEmoji,
                    ),
                    onClick = { selected = cell.entry },
                )

                StatusBarCell.AddStatus -> AddStatusPill(onClick = { composerSeed = StatusComposerDraft() })

                StatusBarCell.ErrorRetry -> ErrorRetryPill(onClick = viewModel::refresh)

                is StatusBarCell.Pill -> {
                    LaunchedEffect(cell.entry.id) { viewModel.loadMoreIfNeeded(cell.entry.id) }
                    StatusPill(
                        emoji = cell.entry.moodEmoji,
                        label = cell.entry.username,
                        accentHex = null,
                        labelColor = MeeshyTheme.tokens.textSecondary,
                        contentDescription = stringResource(
                            R.string.status_bar_status_label,
                            cell.entry.moodEmoji,
                            cell.entry.username,
                        ),
                        onClick = { selected = cell.entry },
                    )
                }

                StatusBarCell.LoadingMore -> CircularProgressIndicator(
                    strokeWidth = 2.dp,
                    color = MeeshyPalette.Indigo300,
                    modifier = Modifier.size(20.dp),
                )
            }
        }
    }

    selected?.let { entry ->
        val isOwn = entry.id == state.myStatus?.id
        StatusPopover(
            entry = entry,
            isOwn = isOwn,
            onRepublish = {
                selected = null
                composerSeed = StatusComposerDraft.republish(entry)
            },
            onReact = { emoji ->
                viewModel.react(entry.id, emoji)
                selected = null
            },
            onDismiss = { selected = null },
        )
    }

    composerSeed?.let { seed ->
        StatusComposerSheet(
            initialDraft = seed,
            onPublish = { request ->
                viewModel.setStatus(
                    emoji = request.emoji,
                    content = request.content,
                    visibility = request.visibility,
                    audioUrl = request.audioUrl,
                    repostOfId = request.repostOfId,
                    viaUsername = request.viaUsername,
                )
                composerSeed = null
            },
            onDismiss = { composerSeed = null },
        )
    }
}

// MARK: - Pills

@Composable
private fun StatusPill(
    emoji: String,
    label: String,
    accentHex: String?,
    labelColor: Color,
    contentDescription: String,
    onClick: () -> Unit,
) {
    val accent = accentHex?.let(::hexColor)?.takeIf { it != Color.Unspecified }
    MeeshyGlassSurface(
        shape = RoundedCornerShape(MeeshyRadius.pill),
        modifier = Modifier
            .clickable(onClick = onClick)
            .semantics { this.contentDescription = contentDescription },
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
            modifier = Modifier.padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.sm),
        ) {
            Text(text = emoji, style = MaterialTheme.typography.titleMedium)
            Text(
                text = label,
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.SemiBold,
                color = accent ?: labelColor,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.widthIn(max = 96.dp),
            )
        }
    }
}

@Composable
private fun AddStatusPill(onClick: () -> Unit) {
    val label = stringResource(R.string.status_bar_add)
    MeeshyGlassSurface(
        shape = RoundedCornerShape(MeeshyRadius.pill),
        modifier = Modifier
            .clickable(onClick = onClick)
            .semantics { contentDescription = label },
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
            modifier = Modifier.padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.sm),
        ) {
            Icon(
                imageVector = Icons.Filled.Add,
                contentDescription = null,
                tint = MeeshyPalette.Indigo500,
                modifier = Modifier.size(16.dp),
            )
            Text(
                text = label,
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.SemiBold,
                color = MeeshyTheme.tokens.textSecondary,
            )
        }
    }
}

@Composable
private fun ErrorRetryPill(onClick: () -> Unit) {
    val retry = stringResource(R.string.status_bar_retry)
    MeeshyGlassSurface(
        shape = RoundedCornerShape(MeeshyRadius.pill),
        modifier = Modifier
            .clickable(onClick = onClick)
            .semantics { contentDescription = retry },
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
            modifier = Modifier.padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.sm),
        ) {
            Icon(
                imageVector = Icons.Filled.WarningAmber,
                contentDescription = null,
                tint = MeeshyPalette.Warning,
                modifier = Modifier.size(14.dp),
            )
            Text(
                text = stringResource(R.string.status_bar_load_error),
                style = MaterialTheme.typography.labelSmall,
                fontWeight = FontWeight.Medium,
                color = MeeshyTheme.tokens.textSecondary,
            )
        }
    }
}

// MARK: - Popover

@Composable
private fun StatusPopover(
    entry: StatusEntry,
    isOwn: Boolean,
    onRepublish: () -> Unit,
    onReact: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    val now = remember(entry.id) { System.currentTimeMillis() }
    val model = remember(entry, now, isOwn) { statusPopoverModel(entry, now, isOwn) }
    Popup(
        alignment = Alignment.TopCenter,
        onDismissRequest = onDismiss,
        properties = PopupProperties(focusable = true),
    ) {
        MeeshyGlassSurface(
            shape = RoundedCornerShape(MeeshyRadius.lg),
            modifier = Modifier
                .padding(top = STATUS_BAR_HEIGHT)
                .widthIn(min = 160.dp, max = 260.dp),
        ) {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
                modifier = Modifier.padding(MeeshySpacing.lg),
            ) {
                Text(
                    text = model.moodEmoji,
                    style = MaterialTheme.typography.headlineMedium,
                    modifier = Modifier.clickable(onClick = onDismiss),
                )
                Text(
                    text = model.username,
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                    color = MeeshyTheme.tokens.textPrimary,
                )
                model.content?.takeIf { it.isNotBlank() }?.let { content ->
                    Text(
                        text = content,
                        style = MaterialTheme.typography.bodySmall,
                        color = MeeshyTheme.tokens.textSecondary,
                    )
                }
                model.viaUsername?.let { via ->
                    Text(
                        text = stringResource(R.string.status_bar_via, via),
                        style = MaterialTheme.typography.labelSmall,
                        color = MeeshyTheme.tokens.textSecondary,
                    )
                }
                Text(
                    text = model.remaining.timeLabel(),
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.Medium,
                    color = MeeshyTheme.tokens.textSecondary,
                )
                if (model.reactions.isNotEmpty()) {
                    ReactionSummaryRow(reactions = model.reactions)
                }
                if (model.canReact) {
                    ReactionPickerRow(onReact = onReact)
                }
                if (model.canRepublish) {
                    RepublishAction(onClick = onRepublish)
                }
            }
        }
    }
}

@Composable
private fun ReactionSummaryRow(reactions: List<StatusReactionChip>) {
    Row(
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier.padding(top = MeeshySpacing.xs),
    ) {
        reactions.forEach { chip ->
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(2.dp),
                modifier = Modifier
                    .background(
                        color = MeeshyPalette.Indigo500.copy(alpha = 0.10f),
                        shape = RoundedCornerShape(MeeshyRadius.pill),
                    )
                    .padding(horizontal = MeeshySpacing.sm, vertical = 2.dp),
            ) {
                Text(text = chip.emoji, style = MaterialTheme.typography.labelMedium)
                Text(
                    text = chip.count.toString(),
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.SemiBold,
                    color = MeeshyTheme.tokens.textSecondary,
                )
            }
        }
    }
}

@Composable
private fun ReactionPickerRow(onReact: (String) -> Unit) {
    Row(
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .padding(top = MeeshySpacing.xs)
            .background(
                color = MeeshyTheme.tokens.textSecondary.copy(alpha = 0.06f),
                shape = RoundedCornerShape(MeeshyRadius.pill),
            )
            .padding(horizontal = MeeshySpacing.sm, vertical = MeeshySpacing.xs),
    ) {
        EmojiCatalog.defaultQuickReactions.forEach { emoji ->
            val label = stringResource(R.string.status_bar_react, emoji)
            Text(
                text = emoji,
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier
                    .clickable { onReact(emoji) }
                    .semantics { contentDescription = label },
            )
        }
    }
}

@Composable
private fun RepublishAction(onClick: () -> Unit) {
    val label = stringResource(R.string.status_bar_republish)
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        modifier = Modifier
            .padding(top = MeeshySpacing.xs)
            .clickable(onClick = onClick)
            .semantics { contentDescription = label },
    ) {
        Icon(
            imageVector = Icons.Filled.Repeat,
            contentDescription = null,
            tint = MeeshyPalette.Indigo400,
            modifier = Modifier.size(14.dp),
        )
        Text(
            text = label,
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.Medium,
            color = MeeshyPalette.Indigo400,
        )
    }
}

@Composable
private fun MoodStatusExpiry.Remaining?.timeLabel(): String =
    this?.label ?: stringResource(R.string.status_bar_expired)

private val STATUS_BAR_HEIGHT = 52.dp

private fun cellKey(cell: StatusBarCell): Any = when (cell) {
    is StatusBarCell.MyStatus -> "me:${cell.entry.id}"
    StatusBarCell.AddStatus -> "add"
    StatusBarCell.ErrorRetry -> "error"
    is StatusBarCell.Pill -> "pill:${cell.entry.id}"
    StatusBarCell.LoadingMore -> "loading-more"
}
