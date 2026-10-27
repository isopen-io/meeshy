package me.meeshy.app.stories

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil.compose.AsyncImage
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.MyStoriesTab
import me.meeshy.sdk.model.MyStoryCardModel
import me.meeshy.sdk.model.MyStoryCardRules
import me.meeshy.sdk.model.MyStoryDateLabel
import me.meeshy.sdk.model.MyStoryDeleteConfirmation
import me.meeshy.sdk.model.MyStoryGlyph
import me.meeshy.sdk.model.MyStorySelectionIndicator
import me.meeshy.sdk.model.MyStoryThumbnailSource
import me.meeshy.sdk.model.fromStory
import me.meeshy.ui.component.chrome.MeeshyBackground
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.hexColor
import me.meeshy.ui.component.chrome.leadingNavigationIcon
import me.meeshy.ui.component.chrome.leadingNavigationLabel

/**
 * « Mes stories » (iOS `MyStoriesView`) : la grille de ses stories actives, l'archive des
 * expirées (republiable), la sélection multiple avec suppression groupée confirmée, et les
 * spectateurs de chaque story. Cache-first (l'archive en cache peint tout de suite), squelette
 * seulement à froid, suppression optimiste avec retour arrière.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MyStoriesScreen(
    onBack: () -> Unit,
    onCreateStory: () -> Unit,
    onOpenStory: (String) -> Unit,
    viewModel: MyStoriesViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    val haptics = rememberMeeshyHaptics()
    var viewersStoryId by remember { mutableStateOf<String?>(null) }
    val messages = EffectMessages(
        deleted = stringResource(R.string.my_stories_delete_success),
        deleteFailed = stringResource(R.string.my_stories_delete_error),
        bulkDeleted = stringResource(R.string.my_stories_delete_selected_success),
        republished = stringResource(R.string.my_stories_repost_success),
        republishFailed = stringResource(R.string.my_stories_repost_error),
    )
    val bulkFailedFormat = stringResource(R.string.my_stories_delete_selected_error, 0)

    LaunchedEffect(viewModel) {
        viewModel.effects.collect { effect ->
            val message = when (effect) {
                MyStoriesUiEffect.StoryDeleted -> messages.deleted.also { haptics.success() }
                MyStoriesUiEffect.DeleteFailed -> messages.deleteFailed.also { haptics.error() }
                MyStoriesUiEffect.BulkDeleted -> messages.bulkDeleted.also { haptics.success() }
                is MyStoriesUiEffect.BulkDeleteFailed ->
                    bulkFailedFormat.replaceFirst("0", effect.failures.toString()).also { haptics.error() }
                MyStoriesUiEffect.Republished -> messages.republished.also { haptics.success() }
                MyStoriesUiEffect.RepublishFailed -> messages.republishFailed.also { haptics.error() }
            }
            snackbar.showSnackbar(message)
        }
    }

    MeeshyBackground {
        Scaffold(
            topBar = {
                TopAppBar(
                    colors = TopAppBarDefaults.topAppBarColors(
                        containerColor = Color.Transparent,
                        scrolledContainerColor = Color.Transparent,
                        titleContentColor = MeeshyTheme.tokens.textPrimary,
                    ),
                    title = { Text(stringResource(R.string.my_stories_title), fontWeight = FontWeight.Bold) },
                    navigationIcon = {
                        IconButton(onClick = onBack) {
                            Icon(leadingNavigationIcon(), leadingNavigationLabel(stringResource(R.string.my_stories_back)), tint = MeeshyTheme.tokens.textPrimary)
                        }
                    },
                    actions = {
                        if (state.active.isNotEmpty() || state.archived.isNotEmpty()) {
                            TextButton(onClick = { haptics.selection(); viewModel.onEvent(MyStoriesUiEvent.ToggleSelecting) }) {
                                Text(
                                    stringResource(
                                        if (state.isSelecting) R.string.my_stories_cancel else R.string.my_stories_select,
                                    ),
                                )
                            }
                        }
                        IconButton(onClick = onCreateStory) {
                            Icon(MeeshyIcons.Add, stringResource(R.string.my_stories_create), tint = MeeshyTheme.tokens.textPrimary)
                        }
                    },
                )
            },
            snackbarHost = { SnackbarHost(snackbar) },
            bottomBar = {
                AnimatedVisibility(visible = state.isSelecting && state.selectedIds.isNotEmpty()) {
                    Button(
                        onClick = { haptics.medium(); viewModel.onEvent(MyStoriesUiEvent.RequestBulkDelete) },
                        modifier = Modifier.fillMaxWidth().padding(MeeshySpacing.lg),
                    ) {
                        Text(stringResource(R.string.my_stories_delete_selected, state.selectedIds.size))
                    }
                }
            },
            containerColor = Color.Transparent,
        ) { padding ->
            Column(Modifier.fillMaxSize().padding(padding)) {
                val tabs = remember(state.visibleTabs) {
                    state.visibleTabs.filter { it == MyStoriesTab.PUBLISHED || it == MyStoriesTab.ARCHIVE }
                }
                val tab = state.tab.takeIf { it in tabs } ?: MyStoriesTab.PUBLISHED
                if (tabs.size > 1) {
                    TabRow(selectedTabIndex = tabs.indexOf(tab).coerceAtLeast(0), containerColor = Color.Transparent) {
                        tabs.forEach { candidate ->
                            Tab(
                                selected = candidate == tab,
                                onClick = { haptics.selection(); viewModel.onEvent(MyStoriesUiEvent.SelectTab(candidate)) },
                                text = { Text(stringResource(candidate.titleRes())) },
                            )
                        }
                    }
                }
                val entries = if (tab == MyStoriesTab.ARCHIVE) state.archived else state.active
                when {
                    state.showSkeleton -> MyStoriesSkeleton()
                    entries.isEmpty() -> MyStoriesEmpty(archive = tab == MyStoriesTab.ARCHIVE)
                    else -> MyStoriesGrid(
                        entries = entries,
                        state = state,
                        onOpen = { entry ->
                            if (state.isSelecting) viewModel.onEvent(MyStoriesUiEvent.ToggleSelected(entry.id))
                            else if (tab == MyStoriesTab.PUBLISHED) state.ownUserId?.let(onOpenStory)
                        },
                        onToggle = { entry ->
                            haptics.light()
                            viewModel.onEvent(MyStoriesUiEvent.ToggleSelected(entry.id))
                        },
                        onViewers = { viewersStoryId = it.id },
                        onDelete = { viewModel.onEvent(MyStoriesUiEvent.RequestDelete(it.id)) },
                        onRepublish = { viewModel.onEvent(MyStoriesUiEvent.Republish(it.id)) },
                        onSelectStart = {
                            if (!state.isSelecting) viewModel.onEvent(MyStoriesUiEvent.ToggleSelecting)
                            viewModel.onEvent(MyStoriesUiEvent.ToggleSelected(it.id))
                            haptics.medium()
                        },
                    )
                }
            }
        }
    }

    state.pendingDelete?.let { pending ->
        val bulk = pending.target == MyStoryDeleteConfirmation.Target.BULK_SELECTION
        AlertDialog(
            onDismissRequest = { viewModel.onEvent(MyStoriesUiEvent.DismissDelete) },
            title = { Text(stringResource(if (bulk) R.string.my_stories_delete_selected_title else R.string.my_stories_delete_title)) },
            text = { Text(stringResource(if (bulk) R.string.my_stories_delete_selected_message else R.string.my_stories_delete_message)) },
            confirmButton = {
                TextButton(onClick = { viewModel.onEvent(MyStoriesUiEvent.ConfirmDelete) }) {
                    Text(stringResource(R.string.my_stories_delete), color = MaterialTheme.colorScheme.error)
                }
            },
            dismissButton = {
                TextButton(onClick = { viewModel.onEvent(MyStoriesUiEvent.DismissDelete) }) {
                    Text(stringResource(R.string.my_stories_cancel))
                }
            },
        )
    }

    viewersStoryId?.let { id ->
        StoryViewersSheet(storyId = id, accentHex = "6366F1", onDismiss = { viewersStoryId = null })
    }
}

private class EffectMessages(
    val deleted: String,
    val deleteFailed: String,
    val bulkDeleted: String,
    val republished: String,
    val republishFailed: String,
)

private fun MyStoriesTab.titleRes(): Int = when (this) {
    MyStoriesTab.ARCHIVE -> R.string.my_stories_tab_archive
    else -> R.string.my_stories_tab_published
}

@Composable
private fun MyStoriesGrid(
    entries: List<MyStoryEntry>,
    state: MyStoriesUiState,
    onOpen: (MyStoryEntry) -> Unit,
    onToggle: (MyStoryEntry) -> Unit,
    onViewers: (MyStoryEntry) -> Unit,
    onDelete: (MyStoryEntry) -> Unit,
    onRepublish: (MyStoryEntry) -> Unit,
    onSelectStart: (MyStoryEntry) -> Unit,
) {
    LazyVerticalGrid(
        columns = GridCells.Adaptive(150.dp),
        contentPadding = PaddingValues(MeeshySpacing.lg),
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
        modifier = Modifier.fillMaxSize(),
    ) {
        items(entries, key = { it.id }, contentType = { "my_story" }) { entry ->
            MyStoryCard(
                entry = entry,
                selection = MyStoryCardRules.selectionIndicator(state.isSelecting, entry.id in state.selectedIds),
                onClick = { onOpen(entry) },
                onLongClick = { onSelectStart(entry) },
                onToggle = { onToggle(entry) },
                onViewers = { onViewers(entry) },
                onDelete = { onDelete(entry) },
                onRepublish = { onRepublish(entry) },
                modifier = Modifier.animateItem(),
            )
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun MyStoryCard(
    entry: MyStoryEntry,
    selection: MyStorySelectionIndicator,
    onClick: () -> Unit,
    onLongClick: () -> Unit,
    onToggle: () -> Unit,
    onViewers: () -> Unit,
    onDelete: () -> Unit,
    onRepublish: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val card = remember(entry) { MyStoryCardRules.fromStory(entry.item, entry.viewCount) }
    val nowMillis = remember(entry) { System.currentTimeMillis() }
    val expired = card.isExpired(nowMillis)
    val locale = LocalConfiguration.current.locales[0]
    val dateText = remember(card.dateEpochMillis, locale) {
        MyStoryDateFormatter.format(MyStoryDateLabel.resolve(card.dateEpochMillis, nowMillis), locale)
    }
    val scale by animateFloatAsState(if (selection == MyStorySelectionIndicator.SELECTED) 0.94f else 1f, label = "myStoryScale")
    var menuOpen by remember { mutableStateOf(false) }
    val a11y = if (expired) stringResource(R.string.my_stories_card_expired, dateText) else dateText

    Box(
        modifier = modifier
            .fillMaxWidth()
            .aspectRatio(0.62f)
            .graphicsLayer { scaleX = scale; scaleY = scale }
            .clip(RoundedCornerShape(16.dp))
            .background(MeeshyTheme.tokens.textSecondary.copy(alpha = 0.12f))
            .combinedClickable(onClick = onClick, onLongClick = onLongClick)
            .semantics { role = Role.Button; contentDescription = a11y },
    ) {
        when (val source = card.thumbnailSource) {
            is MyStoryThumbnailSource.RemoteUrl -> AsyncImage(
                model = source.url,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize().alpha(if (expired) 0.55f else 1f),
            )
            is MyStoryThumbnailSource.Background -> Box(
                Modifier.fillMaxSize().background(hexColor(source.hex)).alpha(if (expired) 0.55f else 1f),
            )
            else -> Unit
        }
        Box(
            Modifier.align(Alignment.BottomCenter).fillMaxWidth()
                .background(Brush.verticalGradient(listOf(Color.Transparent, Color.Black.copy(alpha = 0.7f))))
                .padding(MeeshySpacing.sm),
        ) {
            Column {
                Text(dateText, color = Color.White, style = MaterialTheme.typography.labelMedium)
                Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm), verticalAlignment = Alignment.CenterVertically) {
                    card.glyphs.filter { it.isCounted(card) }.forEach { glyph ->
                        Glyph(glyph, card.counts.getValue(glyph))
                    }
                }
            }
        }
        if (selection == MyStorySelectionIndicator.HIDDEN) {
            Box(Modifier.align(Alignment.TopEnd)) {
                IconButton(onClick = { menuOpen = true }) {
                    Icon(MeeshyIcons.MoreHorizontal, stringResource(R.string.my_stories_more), tint = Color.White)
                }
                DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                    if (!expired) {
                        DropdownMenuItem(
                            text = { Text(stringResource(R.string.my_stories_viewers)) },
                            leadingIcon = { Icon(MeeshyIcons.Eye, null) },
                            onClick = { menuOpen = false; onViewers() },
                        )
                    } else {
                        DropdownMenuItem(
                            text = { Text(stringResource(R.string.my_stories_repost)) },
                            leadingIcon = { Icon(MeeshyIcons.Repeat, null) },
                            onClick = { menuOpen = false; onRepublish() },
                        )
                    }
                    DropdownMenuItem(
                        text = { Text(stringResource(R.string.my_stories_delete)) },
                        leadingIcon = { Icon(MeeshyIcons.Delete, null) },
                        onClick = { menuOpen = false; onDelete() },
                    )
                }
            }
        } else {
            SelectionDot(selected = selection == MyStorySelectionIndicator.SELECTED, onClick = onToggle, modifier = Modifier.align(Alignment.TopEnd))
        }
    }
}

private fun MyStoryGlyph.isCounted(card: MyStoryCardModel): Boolean =
    this != MyStoryGlyph.MORE && this != MyStoryGlyph.PUBLISH && (card.counts[this] ?: 0) > 0

@Composable
private fun Glyph(glyph: MyStoryGlyph, count: Int) {
    val icon = when (glyph) {
        MyStoryGlyph.VIEWS_AND_REACTIONS -> MeeshyIcons.Eye
        MyStoryGlyph.REACTIONS -> MeeshyIcons.HeartFilled
        else -> MeeshyIcons.Chat
    }
    Row(verticalAlignment = Alignment.CenterVertically) {
        Icon(icon, contentDescription = null, tint = Color.White, modifier = Modifier.size(14.dp))
        Spacer(Modifier.width(2.dp))
        Text(count.toString(), color = Color.White, style = MaterialTheme.typography.labelSmall)
    }
}

@Composable
private fun SelectionDot(selected: Boolean, onClick: () -> Unit, modifier: Modifier = Modifier) {
    Box(
        modifier = modifier.padding(MeeshySpacing.sm).size(26.dp).clip(CircleShape)
            .background(if (selected) MaterialTheme.colorScheme.primary else Color.Black.copy(alpha = 0.35f))
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        if (selected) Icon(MeeshyIcons.Check, null, tint = Color.White, modifier = Modifier.size(16.dp))
    }
}

@Composable
private fun MyStoriesEmpty(archive: Boolean) {
    Column(
        modifier = Modifier.fillMaxSize().padding(MeeshySpacing.xl),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(
            stringResource(if (archive) R.string.my_stories_archive_empty_title else R.string.my_stories_empty_title),
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
            color = MeeshyTheme.tokens.textPrimary,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.size(MeeshySpacing.xs))
        Text(
            stringResource(if (archive) R.string.my_stories_archive_empty_subtitle else R.string.my_stories_empty_subtitle),
            style = MaterialTheme.typography.bodyMedium,
            color = MeeshyTheme.tokens.textSecondary,
            textAlign = TextAlign.Center,
        )
    }
}

@Composable
private fun MyStoriesSkeleton() {
    LazyVerticalGrid(
        columns = GridCells.Adaptive(150.dp),
        contentPadding = PaddingValues(MeeshySpacing.lg),
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
        userScrollEnabled = false,
        modifier = Modifier.fillMaxSize(),
    ) {
        items(6) {
            me.meeshy.ui.component.MeeshySkeletonBox(
                modifier = Modifier.fillMaxWidth().aspectRatio(0.62f),
                shape = RoundedCornerShape(16.dp),
            )
        }
    }
}
