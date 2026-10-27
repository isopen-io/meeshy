package me.meeshy.app.chat.mediahub

import android.content.Intent
import android.net.Uri
import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import android.widget.Toast
import me.meeshy.app.chat.rememberChatAudioPlayer
import me.meeshy.ui.component.video.MeeshyVideoViewer
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyGridState
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.grid.rememberLazyGridState
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.util.Locale
import androidx.compose.ui.graphics.toArgb
import me.meeshy.app.chat.FileAttachmentIntentResolver
import me.meeshy.app.chat.openChatLink
import me.meeshy.feature.chat.R
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.mediahub.ConversationMediaKind
import me.meeshy.sdk.model.mediahub.MediaHubItem
import me.meeshy.sdk.model.mediahub.MediaHubPhase
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.component.viewer.MeeshyImageViewer
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyFontSize
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

private const val COLUMNS = 3
private const val PREFETCH_DISTANCE = 6

/**
 * « Médias, liens et documents » (miroir de `ConversationMediaHubView` iOS) : recherche, un segment par genre, grille
 * 3 colonnes pour le visuel, rangées pour le reste. Cache d'abord, pagination sans saut (clés stables, la suite se
 * demande à six éléments de la fin), les photos s'ouvrent dans la visionneuse existante. Dans une conversation
 * chiffrée, le serveur liste des fichiers scellés : l'écran le dit et ne tente pas de les charger.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun ConversationMediaHubSheet(
    conversationId: String,
    accentColor: Color,
    isEndToEnd: Boolean,
    conversationTitle: String?,
    onGoToMessage: ((String) -> Unit)?,
    onOpenFile: (messageId: String, attachment: ApiMessageAttachment) -> Unit,
    onDismiss: () -> Unit,
    viewModel: ConversationMediaHubViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    LaunchedEffect(conversationId) { viewModel.start(conversationId) }
    var query by rememberSaveable { mutableStateOf("") }
    var viewerIndex by remember { mutableStateOf<Int?>(null) }
    var video by remember { mutableStateOf<MediaHubLaunch.Video?>(null) }
    val audioPlayer = rememberChatAudioPlayer(conversationTitle)
    val haptics = rememberMeeshyHaptics()
    val context = LocalContext.current
    val reduceMotion = LocalReduceMotion.current
    val gridState = rememberLazyGridState()
    LoadMoreOnApproach(gridState, state.items.size, state.canLoadMore && !state.isLoadingMore && !state.loadMoreFailed, viewModel::loadMore)

    val photos = remember(state.items) { state.items.filter { it.attachment?.let { a -> !a.isVideo && !a.isEncrypted } == true } }
    val zone = remember { ZoneId.systemDefault() }
    val dateFormat = remember { DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM).withLocale(Locale.getDefault()) }
    fun meta(item: MediaHubItem): String {
        val date = if (item.sentAtMillis > 0) dateFormat.format(Instant.ofEpochMilli(item.sentAtMillis).atZone(zone)) else ""
        return listOf(item.senderName.ifBlank { "—" }, date).filter { it.isNotBlank() }.joinToString(" · ")
    }
    fun open(item: MediaHubItem) {
        haptics.light()
        val index = photos.indexOfFirst { it.id == item.id }
        if (index >= 0) {
            viewerIndex = index
            return
        }
        when (val launch = viewModel.launchFor(item, isEndToEnd)) {
            is MediaHubLaunch.ChatLink -> openChatLink(context, launch.url, accentColor.toArgb())
            is MediaHubLaunch.GatewayFile ->
                viewModel.carrier(item.messageId)?.attachments?.firstOrNull { it.id == item.attachment?.id }
                    ?.let { onOpenFile(item.messageId, it) }
            is MediaHubLaunch.Video -> video = launch
            MediaHubLaunch.Refused -> Toast.makeText(context, R.string.chat_exit_blocked_title, Toast.LENGTH_SHORT).show()
            MediaHubLaunch.Ignored -> Unit
        }
    }
    val shieldsCapture = remember(state.items) { state.items.any { viewModel.rowExit(it, isEndToEnd).shieldsCapture } }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = MeeshyTheme.tokens.backgroundPrimary,
    ) {
        HubCaptureShield(active = shieldsCapture)
        LazyVerticalGrid(
            columns = GridCells.Fixed(COLUMNS),
            state = gridState,
            modifier = Modifier.fillMaxSize().navigationBarsPadding(),
            horizontalArrangement = Arrangement.spacedBy(2.dp),
            verticalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            item(key = "title", span = { GridItemSpan(maxLineSpan) }) {
                Text(
                    stringResource(R.string.media_hub_title),
                    modifier = Modifier.padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.xs),
                    color = MeeshyTheme.tokens.textPrimary,
                    fontSize = MeeshyFontSize.headline,
                    fontWeight = FontWeight.Bold,
                )
            }
            item(key = "search", span = { GridItemSpan(maxLineSpan) }) {
                SearchField(
                    value = query,
                    placeholder = stringResource(R.string.media_hub_search_placeholder),
                    label = stringResource(R.string.media_hub_search_label, state.selectedKind.label()),
                    accent = accentColor,
                    onChange = { query = it; viewModel.updateQuery(it) },
                )
            }
            item(key = "segments", span = { GridItemSpan(maxLineSpan) }) {
                SegmentBar(state.selectedKind, accentColor) { kind ->
                    if (kind != state.selectedKind) {
                        haptics.selection()
                        viewModel.select(kind)
                    }
                }
            }
            if (isEndToEnd) {
                item(key = "e2ee", span = { GridItemSpan(maxLineSpan) }) {
                    Row(Modifier.fillMaxWidth().padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.xs), verticalAlignment = Alignment.CenterVertically) {
                        Icon(MeeshyIcons.Lock, null, tint = accentColor, modifier = Modifier.size(16.dp))
                        Text(
                            stringResource(R.string.media_hub_encrypted_notice),
                            modifier = Modifier.padding(start = MeeshySpacing.sm),
                            color = MeeshyTheme.tokens.textSecondary,
                            fontSize = MeeshyFontSize.small,
                        )
                    }
                }
            }
            if (state.phase == MediaHubPhase.OFFLINE && state.items.isNotEmpty()) {
                item(key = "offline", span = { GridItemSpan(maxLineSpan) }) {
                    Row(Modifier.fillMaxWidth().padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.xs), verticalAlignment = Alignment.CenterVertically) {
                        Icon(MeeshyIcons.WifiOff, null, tint = MeeshyTheme.tokens.warning, modifier = Modifier.size(16.dp))
                        Text(stringResource(R.string.media_hub_offline), Modifier.padding(start = MeeshySpacing.sm), color = MeeshyTheme.tokens.warning, fontSize = MeeshyFontSize.small)
                    }
                }
            }
            if (state.items.isEmpty()) {
                emptyContent(state.phase, state.selectedKind, state.activeQuery, accentColor, viewModel::retry)
            } else if (state.selectedKind == ConversationMediaKind.VISUAL) {
                items(state.items, key = { it.id }, contentType = { "tile" }) { item ->
                    val kindLabel = stringResource(if (item.attachment?.isVideo == true) R.string.media_hub_tile_video else R.string.media_hub_tile_image, item.senderName.ifBlank { "—" }, meta(item).substringAfterLast(" · "))
                    MediaHubVisualTile(
                        item, kindLabel, accentColor, onClick = { open(item) }, modifier = rowAnimation(reduceMotion, this),
                        onGoToMessage = onGoToMessage?.let { go -> { go(item.messageId) } },
                    )
                }
            } else {
                items(state.items, key = { it.id }, span = { GridItemSpan(maxLineSpan) }, contentType = { "row" }) { item ->
                    Row(rowAnimation(reduceMotion, this)) {
                        val goTo = onGoToMessage?.let { go -> { go(item.messageId) } }
                        MediaHubRichRow(
                            item = item,
                            meta = meta(item),
                            accent = accentColor,
                            rendering = viewModel.rendering(item),
                            mayLeave = viewModel.rowExit(item, isEndToEnd).mayLeave,
                            audioPlayer = audioPlayer,
                            onOpen = { open(item) },
                            onOpenLink = { url -> openChatLink(context, url, accentColor.toArgb()) },
                            onGoToMessage = goTo,
                        )
                    }
                }
            }
            if (state.items.isNotEmpty()) {
                item(key = "footer", span = { GridItemSpan(maxLineSpan) }) {
                    Footer(state.loadMoreFailed, state.canLoadMore, accentColor, viewModel::loadMore)
                }
            }
        }
    }

    video?.let { v -> MeeshyVideoViewer(mediaUrl = v.url, onDismiss = { video = null }, secure = v.shieldsCapture) }

    val index = viewerIndex
    if (index != null && photos.isNotEmpty()) {
        MeeshyImageViewer(
            imageUrls = photos.map { it.attachment?.url.orEmpty() },
            initialIndex = index,
            onDismiss = { viewerIndex = null },
            authors = photos.map { it.senderName.ifBlank { null } },
            thumbnailUrls = photos.map { it.attachment?.thumbnailUrl },
            altTexts = photos.map { it.attachment?.alt },
            exportable = photos.map { viewModel.rowExit(it, isEndToEnd).mayLeave },
            secure = photos.any { viewModel.rowExit(it, isEndToEnd).shieldsCapture },
        )
    }
}

private fun rowAnimation(reduceMotion: Boolean, scope: androidx.compose.foundation.lazy.grid.LazyGridItemScope): Modifier =
    if (reduceMotion) Modifier else with(scope) { Modifier.animateItem(fadeInSpec = tween(180), fadeOutSpec = tween(120)) }

@Composable
private fun LoadMoreOnApproach(state: LazyGridState, count: Int, enabled: Boolean, onLoadMore: () -> Unit) {
    val nearEnd by remember(state, count) {
        derivedStateOf { count > 0 && (state.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0) >= state.layoutInfo.totalItemsCount - PREFETCH_DISTANCE }
    }
    LaunchedEffect(nearEnd, enabled, count) { if (nearEnd && enabled) onLoadMore() }
}

private fun androidx.compose.foundation.lazy.grid.LazyGridScope.emptyContent(
    phase: MediaHubPhase,
    kind: ConversationMediaKind,
    activeQuery: String?,
    accent: Color,
    onRetry: () -> Unit,
) {
    item(key = "empty-$phase", span = { GridItemSpan(maxLineSpan) }) {
        when (phase) {
            MediaHubPhase.LOADING ->
                if (kind == ConversationMediaKind.VISUAL) {
                    Column2 { repeat(3) { Row(Modifier.fillMaxWidth(), Arrangement.spacedBy(2.dp)) { repeat(COLUMNS) { MediaHubTileSkeleton(Modifier.weight(1f)) } } } }
                } else Column2 { repeat(5) { MediaHubRowSkeleton() } }
            MediaHubPhase.OFFLINE -> MediaHubStateView(MeeshyIcons.WifiOff, stringResource(R.string.media_hub_offline_empty), accent, stringResource(R.string.media_hub_retry), onRetry)
            MediaHubPhase.FAILED -> MediaHubStateView(MeeshyIcons.Warning, stringResource(R.string.media_hub_error), accent, stringResource(R.string.media_hub_retry), onRetry)
            MediaHubPhase.LOADED -> MediaHubStateView(
                kind.icon(),
                if (activeQuery != null) stringResource(R.string.media_hub_empty_search, activeQuery) else stringResource(R.string.media_hub_empty, kind.label()),
                accent,
            )
        }
    }
}

@Composable
private fun Column2(content: @Composable () -> Unit) {
    androidx.compose.foundation.layout.Column(Modifier.fillMaxWidth().animateContentSize(), verticalArrangement = Arrangement.spacedBy(2.dp)) { content() }
}

@Composable
private fun Footer(failed: Boolean, canLoadMore: Boolean, accent: Color, onRetry: () -> Unit) {
    when {
        failed -> MediaHubStateView(MeeshyIcons.Refresh, stringResource(R.string.media_hub_more_error), accent, stringResource(R.string.media_hub_retry), onRetry)
        canLoadMore -> androidx.compose.foundation.layout.Box(Modifier.fillMaxWidth().heightIn(min = 48.dp), contentAlignment = Alignment.Center) {
            val loading = stringResource(R.string.media_hub_loading)
            CircularProgressIndicator(Modifier.size(20.dp).semantics { contentDescription = loading }, color = accent, strokeWidth = 2.dp)
        }
    }
}

@Composable
private fun SearchField(value: String, placeholder: String, label: String, accent: Color, onChange: (String) -> Unit) {
    val clear = stringResource(R.string.common_clear_search)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.sm)
            .heightIn(min = 48.dp)
            .clip(RoundedCornerShape(MeeshyRadius.sm))
            .background(MeeshyTheme.tokens.backgroundTertiary)
            .padding(horizontal = MeeshySpacing.smPlus),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(MeeshyIcons.Search, null, tint = MeeshyTheme.tokens.textSecondary, modifier = Modifier.size(18.dp))
        androidx.compose.foundation.layout.Box(Modifier.weight(1f).padding(horizontal = MeeshySpacing.sm)) {
            if (value.isEmpty()) Text(placeholder, color = MeeshyTheme.tokens.textSecondary, fontSize = MeeshyFontSize.body)
            BasicTextField(
                value = value,
                onValueChange = onChange,
                singleLine = true,
                textStyle = androidx.compose.ui.text.TextStyle(color = MeeshyTheme.tokens.textPrimary, fontSize = MeeshyFontSize.body),
                cursorBrush = SolidColor(accent),
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                keyboardActions = KeyboardActions(onSearch = { onChange(value) }),
                modifier = Modifier.fillMaxWidth().semantics { contentDescription = label },
            )
        }
        AnimatedVisibility(visible = value.isNotEmpty(), enter = fadeIn(), exit = fadeOut()) {
            androidx.compose.foundation.layout.Box(
                Modifier.size(48.dp).clickable(role = Role.Button) { onChange("") }.semantics { contentDescription = clear },
                contentAlignment = Alignment.Center,
            ) { Icon(MeeshyIcons.CloseCircleFilled, null, tint = MeeshyTheme.tokens.textSecondary, modifier = Modifier.size(18.dp)) }
        }
    }
}

@Composable
private fun SegmentBar(selected: ConversationMediaKind, accent: Color, onSelect: (ConversationMediaKind) -> Unit) {
    val groupLabel = stringResource(R.string.media_hub_segments_label)
    LazyRow(
        modifier = Modifier.fillMaxWidth().semantics { contentDescription = groupLabel },
        contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.sm),
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        items(ConversationMediaKind.entries, key = { it.wire }) { kind ->
            val isSelected = kind == selected
            Row(
                modifier = Modifier
                    .heightIn(min = 40.dp)
                    .clip(RoundedCornerShape(MeeshyRadius.pill))
                    .background(if (isSelected) accent else accent.copy(alpha = 0.12f))
                    .clickable(role = Role.Tab) { onSelect(kind) }
                    .semantics { this.selected = isSelected }
                    .padding(horizontal = MeeshySpacing.md),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                val tint = if (isSelected) Color.White else accent
                Icon(kind.icon(), null, tint = tint, modifier = Modifier.size(16.dp))
                Text(kind.label(), Modifier.padding(start = MeeshySpacing.xs), color = tint, fontSize = MeeshyFontSize.label, fontWeight = FontWeight.SemiBold)
            }
        }
    }
}
