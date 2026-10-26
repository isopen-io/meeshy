package me.meeshy.app.community

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyGridState
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.grid.itemsIndexed
import androidx.compose.foundation.lazy.grid.rememberLazyGridState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.AddCircle
import androidx.compose.material.icons.filled.ChatBubble
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.Public
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import java.util.Locale
import kotlinx.coroutines.delay
import me.meeshy.feature.community.R
import me.meeshy.sdk.model.Community
import me.meeshy.sdk.model.format.CompactCountFormat
import me.meeshy.sdk.theme.DynamicColorGenerator
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.component.MeeshyEmptyState
import me.meeshy.ui.component.MeeshySkeletonBox
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.theme.MeeshyMotion
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.hexColor

/**
 * La liste des communautés (iOS `CommunityListScreen`) : en-tête avec retour et création, recherche,
 * grille de cartes à bannière. Cache-first (rien d'un spinner sur une liste déjà là), tirer pour
 * rafraîchir, pagination à l'approche du bas, cartes qui entrent en cascade et se réordonnent en ressort.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CommunityListScreen(
    onBack: () -> Unit,
    onOpenCommunity: (String) -> Unit,
    onCreateCommunity: () -> Unit,
    viewModel: CommunityListViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val gridState = rememberLazyGridState()
    LoadMoreOnApproach(gridState = gridState, enabled = state.hasMore && !state.isLoadingMore, onLoadMore = viewModel::loadMore)

    Column(
        Modifier
            .fillMaxSize()
            .background(MeeshyTheme.tokens.backgroundPrimary)
            .statusBarsPadding(),
    ) {
        ListHeader(onBack = onBack, onCreate = onCreateCommunity)
        SearchField(query = state.query, onQueryChange = viewModel::onQueryChange)
        PullToRefreshBox(isRefreshing = state.isRefreshing, onRefresh = viewModel::refresh, modifier = Modifier.fillMaxSize()) {
            when {
                state.showSkeleton -> SkeletonGrid()
                state.showError -> MeeshyEmptyState(
                    icon = Icons.Filled.Warning,
                    title = stringResource(R.string.community_common_error),
                    subtitle = stringResource(R.string.community_settings_error_default),
                    actionLabel = stringResource(R.string.community_common_retry),
                    onAction = viewModel::retry,
                )
                state.showEmpty -> MeeshyEmptyState(
                    icon = Icons.Filled.Groups,
                    title = stringResource(R.string.community_list_empty_title),
                    subtitle = stringResource(R.string.community_list_empty_subtitle),
                    actionLabel = stringResource(R.string.community_list_empty_create_button),
                    onAction = onCreateCommunity,
                )
                else -> LazyVerticalGrid(
                    state = gridState,
                    columns = GridCells.Fixed(2),
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 4.dp, bottom = 24.dp),
                    horizontalArrangement = Arrangement.spacedBy(14.dp),
                    verticalArrangement = Arrangement.spacedBy(14.dp),
                ) {
                    itemsIndexed(state.communities, key = { _, c -> c.id }, contentType = { _, _ -> "community" }) { index, community ->
                        CommunityCard(
                            community = community,
                            entranceIndex = index,
                            onClick = { onOpenCommunity(community.id) },
                            modifier = Modifier.animateItem(),
                        )
                    }
                    if (state.hasMore) {
                        item(span = { GridItemSpan(maxLineSpan) }, key = "more", contentType = "more") {
                            Box(Modifier.fillMaxWidth().padding(16.dp), contentAlignment = Alignment.Center) {
                                CircularProgressIndicator(Modifier.size(24.dp), strokeWidth = 2.dp, color = MeeshyPalette.Indigo500)
                            }
                        }
                    }
                }
            }
        }
    }
}

/** Charge la page suivante quand les quatre dernières rangées approchent — sans lire l'état dans la composition. */
@Composable
private fun LoadMoreOnApproach(gridState: LazyGridState, enabled: Boolean, onLoadMore: () -> Unit) {
    val nearEnd by remember(gridState) {
        derivedStateOf {
            val info = gridState.layoutInfo
            val last = info.visibleItemsInfo.lastOrNull()?.index ?: -1
            info.totalItemsCount > 0 && last >= info.totalItemsCount - 5
        }
    }
    LaunchedEffect(nearEnd, enabled) {
        if (nearEnd && enabled) onLoadMore()
    }
}

@Composable
private fun ListHeader(onBack: () -> Unit, onCreate: () -> Unit) {
    val haptics = rememberMeeshyHaptics()
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        IconButton(onClick = onBack) {
            Icon(
                Icons.AutoMirrored.Filled.ArrowBack,
                contentDescription = stringResource(R.string.community_back),
                tint = MeeshyPalette.Indigo500,
            )
        }
        Text(
            text = stringResource(R.string.community_list_title),
            style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold),
            color = MeeshyTheme.tokens.textPrimary,
            modifier = Modifier.weight(1f).padding(start = 4.dp),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        IconButton(onClick = {
            haptics.light()
            onCreate()
        }) {
            Icon(
                Icons.Filled.AddCircle,
                contentDescription = stringResource(R.string.community_list_create_accessibility_label),
                tint = MeeshyPalette.Indigo500,
                modifier = Modifier.size(28.dp),
            )
        }
    }
}

@Composable
private fun SearchField(query: String, onQueryChange: (String) -> Unit) {
    val tokens = MeeshyTheme.tokens
    Row(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(tokens.backgroundSecondary.copy(alpha = 0.5f))
            .padding(horizontal = 10.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icons.Filled.Search, contentDescription = null, tint = tokens.textMuted, modifier = Modifier.size(18.dp))
        Spacer(Modifier.width(8.dp))
        Box(Modifier.weight(1f)) {
            if (query.isEmpty()) {
                Text(stringResource(R.string.community_list_search_placeholder), color = tokens.textMuted, fontSize = 16.sp)
            }
            BasicTextField(
                value = query,
                onValueChange = onQueryChange,
                singleLine = true,
                textStyle = MaterialTheme.typography.bodyLarge.copy(color = tokens.textPrimary),
                cursorBrush = SolidColor(MeeshyPalette.Indigo500),
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                modifier = Modifier.fillMaxWidth(),
            )
        }
        if (query.isNotEmpty()) {
            Icon(
                Icons.Filled.Close,
                contentDescription = stringResource(R.string.community_common_close),
                tint = tokens.textMuted,
                modifier = Modifier.size(18.dp).clip(CircleShape).pressableScale(onClick = { onQueryChange("") }),
            )
        }
    }
}

@Composable
private fun SkeletonGrid() {
    LazyVerticalGrid(
        columns = GridCells.Fixed(2),
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(14.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
        userScrollEnabled = false,
    ) {
        items(SKELETON_COUNT, key = { it }) {
            MeeshySkeletonBox(Modifier.fillMaxWidth().height(CARD_HEIGHT), RoundedCornerShape(20.dp))
        }
    }
}

private val CARD_HEIGHT = 180.dp
private const val SKELETON_COUNT = 6
private const val ENTRANCE_STAGGER_CAP = 10

@Composable
private fun CommunityCard(
    community: Community,
    entranceIndex: Int,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val accent = remember(community.name) { DynamicColorGenerator.colorForName(community.name) }
    val accentColor = remember(accent) { hexColor(accent) }
    val reduceMotion = LocalReduceMotion.current
    var appeared by remember(community.id) { mutableStateOf(reduceMotion) }
    LaunchedEffect(community.id) {
        if (!appeared) {
            delay(MeeshyMotion.staggerDelayMillis(entranceIndex.coerceAtMost(ENTRANCE_STAGGER_CAP)).toLong())
            appeared = true
        }
    }
    val entrance by animateFloatAsState(if (appeared) 1f else 0f, MeeshyMotion.springDefault(), label = "cardEntrance")
    val countLocale = remember { Locale.getDefault() }

    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(CARD_HEIGHT)
            .graphicsLayer {
                alpha = entrance
                val s = 0.9f + 0.1f * entrance
                scaleX = s
                scaleY = s
            }
            .shadow(8.dp, RoundedCornerShape(20.dp), ambientColor = accentColor.copy(alpha = 0.3f), spotColor = accentColor.copy(alpha = 0.3f))
            .clip(RoundedCornerShape(20.dp))
            .pressableScale(onClick = onClick)
            .semantics(mergeDescendants = true) { contentDescription = community.name },
    ) {
        CommunityBanner(community.banner, accent, Modifier.fillMaxSize())
        Box(
            Modifier.fillMaxSize().background(
                Brush.verticalGradient(0f to Color.Transparent, 0.4f to Color.Transparent, 1f to Color.Black.copy(alpha = 0.65f)),
            ),
        )
        PrivacyChip(community.isPrivate, Modifier.align(Alignment.TopStart).padding(start = 10.dp, top = 10.dp))
        MeeshyAvatar(
            name = community.name,
            size = 44.dp,
            containerColor = accentColor,
            imageUrl = community.avatar,
            modifier = Modifier
                .align(Alignment.TopEnd)
                .padding(end = 10.dp, top = 10.dp)
                .border(BorderStroke(2.dp, Color.White.copy(alpha = 0.85f)), CircleShape),
        )
        Column(Modifier.align(Alignment.BottomStart).padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(
                community.name,
                color = Color.White,
                fontWeight = FontWeight.Bold,
                fontSize = 16.sp,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            community.description?.takeIf { it.isNotBlank() }?.let {
                Text(it, color = Color.White.copy(alpha = 0.8f), fontSize = 12.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                CountBadge(Icons.Filled.People, CompactCountFormat.text(community.memberCount, countLocale))
                CountBadge(Icons.Filled.ChatBubble, CompactCountFormat.text(community.conversationCount, countLocale))
            }
        }
    }
}

@Composable
private fun PrivacyChip(isPrivate: Boolean, modifier: Modifier = Modifier) {
    Row(
        modifier
            .clip(CircleShape)
            .background(Color.Black.copy(alpha = 0.25f))
            .padding(horizontal = 6.dp, vertical = 2.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Icon(
            if (isPrivate) Icons.Filled.Lock else Icons.Filled.Public,
            contentDescription = stringResource(if (isPrivate) R.string.community_privacy_private else R.string.community_privacy_public),
            tint = Color.White.copy(alpha = 0.85f),
            modifier = Modifier.size(11.dp),
        )
    }
}

@Composable
private fun CountBadge(icon: androidx.compose.ui.graphics.vector.ImageVector, text: String) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(3.dp)) {
        Icon(icon, contentDescription = null, tint = Color.White.copy(alpha = 0.9f), modifier = Modifier.size(11.dp))
        Text(text, color = Color.White.copy(alpha = 0.9f), fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
    }
}
