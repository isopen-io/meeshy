package me.meeshy.app.chat

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.AddCircle
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.PhotoLibrary
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import me.meeshy.feature.chat.R
import me.meeshy.sdk.model.PermissionNature
import me.meeshy.sdk.model.composer.RecentMediaAttachmentLink
import me.meeshy.sdk.model.composer.RecentMediaSelection
import me.meeshy.sdk.model.media.MediaPermissionState
import me.meeshy.ui.component.FeedbackKind
import me.meeshy.ui.component.MeeshyFeedbackToast
import me.meeshy.ui.component.permission.PermissionFlowHost
import me.meeshy.ui.component.permission.openAppSettings
import me.meeshy.ui.component.permission.rememberPermissionFlow
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

private val GRID_SPACING = 8.dp
private val GRID_HORIZONTAL_PADDING = 12.dp
private val GRID_HEIGHT = 300.dp
private const val FAILURE_TOAST_MS = 4_000L

/**
 * The composer's "recent media" gate: shown only to a sender allowed to attach an image or a
 * video, it hands every resolved media to [onPickFile] exactly like the system picker does.
 */
@Composable
internal fun ComposerRecentMedia(
    canCapture: Boolean,
    accentColor: Color,
    onPickFile: (bytes: ByteArray, fileName: String, mimeType: String?) -> Unit,
    modifier: Modifier = Modifier,
    onPickUri: ((Uri) -> Unit)? = null,
    onEdit: ((PickedAttachment) -> Unit)? = null,
) {
    if (!canCapture) return
    RecentMediaGrid(
        accentColor = accentColor,
        onPick = { _, picked -> onPickFile(picked.bytes, picked.fileName, picked.mimeType) },
        modifier = modifier,
        onEdit = onEdit,
        onPickUri = onPickUri?.let { stage -> { _: RecentMediaItem?, uri: Uri -> stage(uri) } },
    )
}

/**
 * Four-column grid of the 40 most recent photos/videos — port of iOS `RecentMediaStrip`.
 * Tap adds; long press opens the quick look with Ajouter / Sélectionner / Éditer; the
 * multi-selection numbers picks in tap order and confirms with « Ajouter (n) »; the last
 * cell opens the full library. Without access the grid is replaced by an invitation tile
 * (ask, or open the settings once refused); under Android 14 partial access it works and
 * offers to extend the selection. [attachedAssetIds] are the assets already in the
 * attachment zone, derived by the host through [RecentMediaAttachmentLink]: their tile is
 * veiled, ticked and refuses (warning haptic) to be taken twice.
 */
@Composable
internal fun RecentMediaGrid(
    accentColor: Color,
    onPick: (item: RecentMediaItem?, picked: PickedAttachment) -> Unit,
    modifier: Modifier = Modifier,
    attachedAssetIds: Set<String> = emptySet(),
    onEdit: ((PickedAttachment) -> Unit)? = null,
    onSelectionChanged: ((List<String>) -> Unit)? = null,
    onPickUri: ((item: RecentMediaItem?, uri: Uri) -> Unit)? = null,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val haptics = rememberMeeshyHaptics()
    val permissions = rememberPermissionFlow()
    PermissionFlowHost(permissions, accent = accentColor)

    var access by remember { mutableStateOf<MediaPermissionState?>(null) }
    LaunchedEffect(Unit) { access = permissions.stateOf(PermissionNature.PHOTO_LIBRARY_READ) }
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) {
        scope.launch { access = permissions.stateOf(PermissionNature.PHOTO_LIBRARY_READ) }
    }
    val canRead = access?.isUsable == true
    val items by produceState(emptyList<RecentMediaItem>(), canRead) {
        if (canRead) RecentMediaSource.observe(context).collect { value = it }
    }
    val thumbnails = remember { RecentMediaThumbnails(context, scope) }
    DisposableEffect(thumbnails) { onDispose { thumbnails.clear() } }

    var selection by remember { mutableStateOf(RecentMediaSelection()) }
    var resolvingId by remember { mutableStateOf<String?>(null) }
    var isBatchResolving by remember { mutableStateOf(false) }
    var failures by remember { mutableStateOf(0) }
    var previewItem by remember { mutableStateOf<RecentMediaItem?>(null) }

    LaunchedEffect(selection.ids) { onSelectionChanged?.invoke(selection.ids) }
    LaunchedEffect(attachedAssetIds) { selection = selection.discard(attachedAssetIds) }
    LaunchedEffect(failures) {
        if (failures > 0) {
            delay(FAILURE_TOAST_MS)
            failures = 0
        }
    }

    // With [onPickUri] the host copies the media itself (streamed, size-checked): a recent
    // video is never read whole into memory here.
    suspend fun deliver(item: RecentMediaItem): Boolean {
        onPickUri?.let { stage ->
            stage(item, item.uri)
            return true
        }
        val picked = withContext(Dispatchers.IO) { readPickedAttachment(context, item.uri) } ?: return false
        onPick(item, picked)
        return true
    }

    fun addSingle(item: RecentMediaItem) {
        if (resolvingId != null || isBatchResolving || item.id in attachedAssetIds) return
        haptics.light()
        resolvingId = item.id
        scope.launch {
            val delivered = deliver(item)
            resolvingId = null
            if (!delivered) failures = 1
        }
    }

    fun toggleSelection(item: RecentMediaItem) {
        if (item.id in attachedAssetIds) return haptics.warning()
        haptics.medium()
        selection = if (selection.isActive) selection.toggle(item.id) else selection.begin(item.id)
    }

    fun onCellClick(item: RecentMediaItem) {
        when {
            item.id in attachedAssetIds -> haptics.warning()
            selection.isActive -> {
                haptics.light()
                selection = selection.toggle(item.id)
            }
            else -> addSingle(item)
        }
    }

    fun confirmSelection() {
        if (selection.isEmpty || isBatchResolving) return
        haptics.medium()
        isBatchResolving = true
        val ids = RecentMediaAttachmentLink.fresh(selection.ids, excluding = attachedAssetIds)
        scope.launch {
            var failed = 0
            ids.forEach { id ->
                val item = items.firstOrNull { it.id == id } ?: return@forEach
                resolvingId = id
                if (!deliver(item)) failed += 1
            }
            resolvingId = null
            isBatchResolving = false
            selection = selection.clear()
            if (failed > 0) failures = failed
        }
    }

    fun edit(item: RecentMediaItem) {
        val handler = onEdit ?: return
        if (resolvingId != null || isBatchResolving) return
        haptics.light()
        resolvingId = item.id
        scope.launch {
            val picked = withContext(Dispatchers.IO) { readPickedAttachment(context, item.uri) }
            resolvingId = null
            if (picked != null) handler(picked) else failures = 1
        }
    }

    val libraryPicker = rememberLauncherForActivityResult(
        ActivityResultContracts.PickMultipleVisualMedia(RecentMediaSource.HEAD_SAMPLE_COUNT),
    ) { uris ->
        scope.launch {
            var failed = 0
            uris.forEach { uri ->
                onPickUri?.let { stage ->
                    stage(null, uri)
                    return@forEach
                }
                val picked = withContext(Dispatchers.IO) { readPickedAttachment(context, uri) }
                if (picked != null) onPick(null, picked) else failed += 1
            }
            if (failed > 0) failures = failed
        }
    }
    fun openLibrary() {
        haptics.light()
        libraryPicker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageAndVideo))
    }

    Column(modifier = modifier.fillMaxWidth().height(GRID_HEIGHT)) {
        AnimatedVisibility(visible = selection.isActive) {
            SelectionBar(
                count = selection.count,
                isBatchResolving = isBatchResolving,
                accentColor = accentColor,
                onCancel = {
                    haptics.light()
                    selection = selection.clear()
                },
                onConfirm = ::confirmSelection,
            )
        }
        if (!selection.isActive && canRead && items.isNotEmpty()) {
            SelectButtonRow(accentColor) {
                haptics.light()
                selection = selection.activate()
            }
        }
        if (access == MediaPermissionState.LIMITED) LimitedAccessRow(accentColor) { context.openAppSettings() }
        Box(Modifier.weight(1f).fillMaxWidth()) {
            if (access != null && !canRead) {
                AuthorizationTile(
                    refused = access == MediaPermissionState.DENIED || access == MediaPermissionState.RESTRICTED,
                    accentColor = accentColor,
                ) {
                    haptics.light()
                    scope.launch {
                        val refused = access == MediaPermissionState.DENIED || access == MediaPermissionState.RESTRICTED
                        if (refused) {
                            context.openAppSettings()
                        } else if (permissions.ensure(PermissionNature.PHOTO_LIBRARY_READ, announcesRefusal = false)) {
                            access = permissions.stateOf(PermissionNature.PHOTO_LIBRARY_READ)
                        }
                    }
                }
            } else if (canRead) {
                MediaGrid(
                    items = items,
                    thumbnails = thumbnails,
                    accentColor = accentColor,
                    attachedAssetIds = attachedAssetIds,
                    selection = selection,
                    resolvingId = resolvingId,
                    onClick = ::onCellClick,
                    onLongClick = { previewItem = it },
                    onOpenLibrary = ::openLibrary,
                )
            }
            if (failures > 0) {
                MeeshyFeedbackToast(
                    message = if (failures > 1) {
                        stringResource(R.string.recentMedia_resolveFailed_multiple, failures)
                    } else {
                        stringResource(R.string.recentMedia_resolveFailed)
                    },
                    kind = FeedbackKind.Error,
                    modifier = Modifier.align(Alignment.BottomCenter).padding(MeeshySpacing.md),
                )
            }
        }
    }

    previewItem?.let { item ->
        val poster by produceState<android.graphics.Bitmap?>(null, item.id) { value = thumbnails.load(item, PREVIEW_POSTER_PX) }
        RecentMediaPreviewDialog(
            item = item,
            poster = poster,
            accentColor = accentColor,
            isAttached = item.id in attachedAssetIds,
            isSelected = selection.position(item.id) != null,
            canEdit = onEdit != null,
            onAdd = {
                previewItem = null
                addSingle(item)
            },
            onToggleSelect = {
                previewItem = null
                toggleSelection(item)
            },
            onEdit = {
                previewItem = null
                edit(item)
            },
            onDismiss = { previewItem = null },
        )
    }
}

private const val PREVIEW_POSTER_PX = 256

@Composable
private fun MediaGrid(
    items: List<RecentMediaItem>,
    thumbnails: RecentMediaThumbnails,
    accentColor: Color,
    attachedAssetIds: Set<String>,
    selection: RecentMediaSelection,
    resolvingId: String?,
    onClick: (RecentMediaItem) -> Unit,
    onLongClick: (RecentMediaItem) -> Unit,
    onOpenLibrary: () -> Unit,
) {
    val density = LocalDensity.current
    BoxWithConstraints(Modifier.fillMaxSize()) {
        val columns = RecentMediaSource.COLUMN_COUNT
        val cell = (maxWidth - GRID_HORIZONTAL_PADDING * 2 - GRID_SPACING * (columns - 1)) / columns
        val pixelSide = with(density) { cell.toPx() }.toInt().coerceAtLeast(1)
        LazyVerticalGrid(
            columns = GridCells.Fixed(columns),
            horizontalArrangement = Arrangement.spacedBy(GRID_SPACING),
            verticalArrangement = Arrangement.spacedBy(GRID_SPACING),
            contentPadding = PaddingValues(horizontal = GRID_HORIZONTAL_PADDING, vertical = MeeshySpacing.smPlus),
            modifier = Modifier.fillMaxSize(),
        ) {
            item(key = "open-library", contentType = "open-library") {
                OpenLibraryTile(accentColor, onOpenLibrary, Modifier.size(cell))
            }
            items(items, key = { it.id }, contentType = { "media" }) { item ->
                LaunchedEffect(item.id, pixelSide) { thumbnails.cacheAround(item.id, items, pixelSide) }
                RecentMediaCell(
                    item = item,
                    thumbnails = thumbnails,
                    pixelSide = pixelSide,
                    accentColor = accentColor,
                    isResolving = resolvingId == item.id,
                    isAttached = item.id in attachedAssetIds,
                    isSelecting = selection.isActive,
                    selectionPosition = selection.position(item.id),
                    onClick = { onClick(item) },
                    onLongClick = { onLongClick(item) },
                    modifier = Modifier.size(cell),
                )
            }
        }
    }
}

@Composable
private fun OpenLibraryTile(accentColor: Color, onClick: () -> Unit, modifier: Modifier) {
    val shape = RoundedCornerShape(MeeshyRadius.smPlus)
    val label = stringResource(R.string.composer_a11y_openFullLibrary)
    Column(
        modifier = modifier
            .clip(shape)
            .background(accentColor.copy(alpha = 0.12f))
            .border(1.dp, accentColor.copy(alpha = 0.3f), shape)
            .clickable(role = Role.Button, onClickLabel = label, onClick = onClick),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Icon(Icons.Filled.PhotoLibrary, contentDescription = label, tint = accentColor, modifier = Modifier.size(24.dp))
        Icon(Icons.Filled.Add, contentDescription = null, tint = accentColor, modifier = Modifier.size(16.dp))
    }
}

@Composable
private fun SelectButtonRow(accentColor: Color, onClick: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = GRID_HORIZONTAL_PADDING, vertical = MeeshySpacing.xs),
        horizontalArrangement = Arrangement.End,
    ) {
        Row(
            modifier = Modifier
                .clip(RoundedCornerShape(MeeshyRadius.pill))
                .clickable(role = Role.Button, onClick = onClick)
                .heightIn(min = 48.dp)
                .padding(horizontal = MeeshySpacing.md),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        ) {
            Icon(Icons.Filled.CheckCircle, contentDescription = null, tint = accentColor, modifier = Modifier.size(18.dp))
            Text(
                text = stringResource(R.string.composer_recent_select),
                style = MaterialTheme.typography.labelLarge,
                fontWeight = FontWeight.SemiBold,
                color = accentColor,
            )
        }
    }
}

@Composable
private fun SelectionBar(
    count: Int,
    isBatchResolving: Boolean,
    accentColor: Color,
    onCancel: () -> Unit,
    onConfirm: () -> Unit,
) {
    val cancelLabel = stringResource(R.string.composer_a11y_cancelSelection)
    val addLabel = stringResource(R.string.composer_a11y_addSelection)
    val canConfirm = count > 0 && !isBatchResolving
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = GRID_HORIZONTAL_PADDING, vertical = MeeshySpacing.xs),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = stringResource(R.string.composer_recent_cancelSelection),
            style = MaterialTheme.typography.labelLarge,
            fontWeight = FontWeight.SemiBold,
            color = MeeshyTheme.tokens.textSecondary,
            modifier = Modifier
                .clip(RoundedCornerShape(MeeshyRadius.pill))
                .clickable(role = Role.Button, onClickLabel = cancelLabel, onClick = onCancel)
                .heightIn(min = 48.dp)
                .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.smPlus),
        )
        Box(Modifier.weight(1f))
        Row(
            modifier = Modifier
                .clip(RoundedCornerShape(MeeshyRadius.pill))
                .background(accentColor.copy(alpha = if (canConfirm) 1f else 0.5f))
                .clickable(enabled = canConfirm, role = Role.Button, onClickLabel = addLabel, onClick = onConfirm)
                .heightIn(min = 48.dp)
                .padding(horizontal = MeeshySpacing.mdPlus),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xsPlus),
        ) {
            if (isBatchResolving) {
                CircularProgressIndicator(color = Color.White, strokeWidth = 2.dp, modifier = Modifier.size(16.dp))
            } else {
                Icon(Icons.Filled.AddCircle, contentDescription = null, tint = Color.White, modifier = Modifier.size(16.dp))
            }
            Text(
                text = stringResource(R.string.composer_recent_addSelected, count),
                style = MaterialTheme.typography.labelLarge,
                fontWeight = FontWeight.Bold,
                color = Color.White,
            )
        }
    }
}

@Composable
private fun LimitedAccessRow(accentColor: Color, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(role = Role.Button, onClick = onClick)
            .heightIn(min = 48.dp)
            .padding(horizontal = GRID_HORIZONTAL_PADDING),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        Text(
            text = stringResource(R.string.recent_media_limited_access),
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.SemiBold,
            color = MeeshyTheme.tokens.textPrimary,
        )
        Text(
            text = stringResource(R.string.recent_media_limited_access_hint),
            style = MaterialTheme.typography.labelSmall,
            color = accentColor,
        )
    }
}

@Composable
private fun AuthorizationTile(refused: Boolean, accentColor: Color, onClick: () -> Unit) {
    val title = stringResource(if (refused) R.string.composer_recent_accessDenied else R.string.composer_recent_grantAccess)
    val hint = stringResource(if (refused) R.string.composer_recent_accessDenied_hint else R.string.composer_recent_grantAccess_hint)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(role = Role.Button, onClick = onClick)
            .heightIn(min = 48.dp)
            .padding(horizontal = GRID_HORIZONTAL_PADDING, vertical = MeeshySpacing.mdPlus),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.smPlus),
    ) {
        Icon(Icons.Filled.PhotoLibrary, contentDescription = null, tint = accentColor, modifier = Modifier.size(28.dp))
        Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xxs)) {
            Text(
                text = title,
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
                color = MeeshyTheme.tokens.textPrimary,
            )
            Text(text = hint, style = MaterialTheme.typography.bodySmall, color = MeeshyTheme.tokens.textSecondary)
        }
    }
}
