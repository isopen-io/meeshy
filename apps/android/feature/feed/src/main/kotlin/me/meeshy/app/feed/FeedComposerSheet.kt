package me.meeshy.app.feed

import android.content.ContentResolver
import android.net.Uri
import android.provider.OpenableColumns
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Image
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import me.meeshy.feature.feed.R
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * The feed-post composer — the "texte seul" first sub-slice of feature-parity
 * §F "Create post" (port of the text-input surface of iOS
 * `FeedView.composerOverlay`: `composerText` + `postVisibility`), now joined by
 * its photo/video fast-follow (`pendingAttachments`). A bottom sheet with a
 * visibility-pill row, a multi-line text field and an attachments row — the
 * same `ModalBottomSheet` shape [StatusComposerSheet] already established for
 * a feed composer on Android, reused rather than reinvented.
 *
 * Photo/video attachments upload through [onUploadMedia] (`post`-context TUS,
 * consuming the same foundation the story composer's media fix built) as soon
 * as they're picked — Instant-App feedback: the attach affordance shows an
 * in-flight spinner tile while uploading, then the real thumbnail, so the
 * publish gate only unlocks once media is genuinely attachable server-side.
 *
 * **Deliberate, documented scope cut vs. iOS** (routine's own "photo/caméra
 * d'abord" framing — this slice ships the photo/video half only): no camera
 * capture, file, location or audio attachments, no emoji picker, no per-post
 * language override — iOS's `composerOverlay` toolbar of 6 glyphes. Each is a
 * real, separately-scoped follow-up. Camera capture specifically has no
 * existing pattern anywhere else in the Android app yet (no `TakePicture`
 * contract, no `FileProvider` wiring) — a materially bigger increment than
 * reusing the already-proven gallery-picker pattern the story composer
 * established, so it stays out of this slice rather than being rushed in.
 *
 * Every text/visibility/media-id decision lives in the pure
 * [FeedComposerDraft]; this Composable holds one in `remember` (plus the
 * richer [UploadedMedia] previews and the upload-in-flight flag, which are
 * display-only) and stays coverage-exempt glue — mirroring the split
 * `me.meeshy.app.stories.StoryComposerViewModel` uses between its pure state
 * and its upload orchestration, just without a dedicated ViewModel for this
 * sheet (matching this composer's own existing local-`remember` precedent).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FeedComposerSheet(
    onPublish: (FeedPostPublishRequest) -> Unit,
    onDismiss: () -> Unit,
    onUploadMedia: suspend (List<MediaUploadItem>) -> NetworkResult<List<UploadedMedia>>,
    onMediaError: (String) -> Unit,
    initialDraft: FeedComposerDraft = FeedComposerDraft(),
) {
    var draft by remember { mutableStateOf(initialDraft) }
    var attachedMedia by remember { mutableStateOf<List<UploadedMedia>>(emptyList()) }
    var isUploadingMedia by remember { mutableStateOf(false) }
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val mediaLimitMessage = stringResource(R.string.feed_composer_media_limit, FeedComposerDraft.MAX_MEDIA)
    val mediaUnusableMessage = stringResource(R.string.feed_composer_media_unusable)

    fun dispatchPicked(uris: List<Uri>) {
        if (uris.isEmpty() || isUploadingMedia) return
        val remaining = draft.remainingMediaSlots
        if (remaining <= 0) {
            onMediaError(mediaLimitMessage)
            return
        }
        scope.launch {
            val items = withContext(Dispatchers.IO) {
                uris.take(remaining).mapNotNull { context.contentResolver.readMediaUploadItem(it) }
            }
            if (items.isEmpty()) return@launch
            isUploadingMedia = true
            when (val result = onUploadMedia(items)) {
                is NetworkResult.Success ->
                    if (result.data.isEmpty()) {
                        onMediaError(mediaUnusableMessage)
                    } else {
                        draft = draft.withMedia(result.data.map { it.id })
                        attachedMedia = attachedMedia + result.data
                    }
                is NetworkResult.Failure -> onMediaError(result.error.message ?: mediaUnusableMessage)
            }
            isUploadingMedia = false
        }
    }

    val pickSingle = rememberLauncherForActivityResult(
        ActivityResultContracts.PickVisualMedia(),
    ) { uri: Uri? -> dispatchPicked(listOfNotNull(uri)) }

    val pickMultiple = rememberLauncherForActivityResult(
        ActivityResultContracts.PickMultipleVisualMedia(FeedComposerDraft.MAX_MEDIA),
    ) { uris: List<Uri> -> dispatchPicked(uris) }

    val imageAndVideo = PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageAndVideo)

    fun launchMediaPicker() {
        when (FeedMediaPicker.modeFor(draft.remainingMediaSlots)) {
            FeedMediaPickMode.Single -> pickSingle.launch(imageAndVideo)
            FeedMediaPickMode.Multiple -> pickMultiple.launch(imageAndVideo)
            FeedMediaPickMode.None -> onMediaError(mediaLimitMessage)
        }
    }

    fun removeMedia(id: String) {
        draft = draft.withoutMedia(id)
        attachedMedia = attachedMedia.filterNot { it.id == id }
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = MeeshyTheme.tokens.backgroundPrimary,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = MeeshySpacing.lg)
                .padding(bottom = MeeshySpacing.xl),
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.lg),
        ) {
            Header(
                canPublish = draft.canPublish && !isUploadingMedia,
                onClose = onDismiss,
                onPublish = { draft.publishRequest()?.let(onPublish) },
            )

            VisibilityRow(
                selected = draft.visibility,
                onSelect = { visibility -> draft = draft.withVisibility(visibility) },
            )

            OutlinedTextField(
                value = draft.text,
                onValueChange = { value -> draft = draft.withText(value) },
                modifier = Modifier.fillMaxWidth(),
                placeholder = { Text(stringResource(R.string.feed_composer_placeholder)) },
                minLines = 4,
            )

            MediaAttachmentsRow(
                media = attachedMedia,
                isUploading = isUploadingMedia,
                canAddMore = !draft.isMediaFull,
                onAdd = ::launchMediaPicker,
                onRemove = ::removeMedia,
            )
        }
    }
}

/**
 * The attach-media affordance plus the picked-photo/video thumbnail strip —
 * always shows the attach tile first (disabled once [canAddMore] is false or
 * while [isUploading]), then each attached [media] item with a remove
 * overlay, then an in-flight spinner tile while a pick is uploading. Pure
 * Compose glue: every id/list decision it renders came from the already
 * pure/tested [FeedComposerDraft]/upload result upstream.
 */
@Composable
private fun MediaAttachmentsRow(
    media: List<UploadedMedia>,
    isUploading: Boolean,
    canAddMore: Boolean,
    onAdd: () -> Unit,
    onRemove: (String) -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        IconButton(
            onClick = onAdd,
            enabled = canAddMore && !isUploading,
            modifier = Modifier
                .size(56.dp)
                .clip(RoundedCornerShape(MeeshyRadius.md))
                .background(MeeshyTheme.tokens.inputBackground)
                .border(1.dp, MeeshyTheme.tokens.inputBorder, RoundedCornerShape(MeeshyRadius.md)),
        ) {
            Icon(
                imageVector = Icons.Filled.Image,
                contentDescription = stringResource(R.string.feed_composer_attach_media),
                tint = if (canAddMore && !isUploading) MeeshyPalette.Indigo500 else MeeshyTheme.tokens.textMuted,
            )
        }

        media.forEach { item ->
            Box(modifier = Modifier.size(56.dp)) {
                AsyncImage(
                    model = item.thumbnailUrl ?: item.url,
                    contentDescription = null,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier
                        .size(56.dp)
                        .clip(RoundedCornerShape(MeeshyRadius.md)),
                )
                IconButton(
                    onClick = { onRemove(item.id) },
                    modifier = Modifier
                        .size(20.dp)
                        .align(Alignment.TopEnd)
                        .background(Color.Black.copy(alpha = 0.6f), CircleShape),
                ) {
                    Icon(
                        imageVector = Icons.Filled.Close,
                        contentDescription = stringResource(R.string.feed_composer_remove_media),
                        tint = MeeshyPalette.White,
                        modifier = Modifier.size(12.dp),
                    )
                }
            }
        }

        if (isUploading) {
            Box(
                modifier = Modifier
                    .size(56.dp)
                    .clip(RoundedCornerShape(MeeshyRadius.md))
                    .background(MeeshyTheme.tokens.inputBackground),
                contentAlignment = Alignment.Center,
            ) {
                CircularProgressIndicator(strokeWidth = 2.dp, modifier = Modifier.size(20.dp))
            }
        }
    }
}

/**
 * Reads the picked content into a [MediaUploadItem] (bytes + advertised
 * filename + MIME). Returns null when the stream can't be opened. Pure-IO
 * glue — the filename/MIME defaulting lives in `MediaUpload`, so this stays a
 * thin reader. Mirror of `StoryComposerScreen`'s own private extension
 * (duplicated per this codebase's existing convention — see also
 * `RegistrationScreen`/`ProfileScreen`).
 */
private fun ContentResolver.readMediaUploadItem(uri: Uri): MediaUploadItem? {
    val bytes = runCatching { openInputStream(uri)?.use { it.readBytes() } }.getOrNull() ?: return null
    val mimeType = getType(uri).orEmpty()
    val fileName = displayName(uri).orEmpty()
    return MediaUploadItem(bytes = bytes, fileName = fileName, mimeType = mimeType)
}

private fun ContentResolver.displayName(uri: Uri): String? =
    runCatching {
        query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
            val index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
            if (index >= 0 && cursor.moveToFirst()) cursor.getString(index) else null
        }
    }.getOrNull()

@Composable
private fun Header(
    canPublish: Boolean,
    onClose: () -> Unit,
    onPublish: () -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        TextButton(onClick = onClose) {
            Text(
                text = stringResource(R.string.feed_composer_cancel),
                color = MeeshyTheme.tokens.textSecondary,
            )
        }
        Text(
            text = stringResource(R.string.feed_composer_title),
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
            color = MeeshyTheme.tokens.textPrimary,
        )
        TextButton(onClick = onPublish, enabled = canPublish) {
            Text(
                text = stringResource(R.string.feed_composer_publish),
                fontWeight = FontWeight.SemiBold,
                color = if (canPublish) MeeshyPalette.Indigo500 else MeeshyTheme.tokens.textMuted,
            )
        }
    }
}

@Composable
private fun VisibilityRow(
    selected: FeedPostVisibility,
    onSelect: (FeedPostVisibility) -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        FeedPostVisibility.entries.forEach { visibility ->
            val active = visibility == selected
            Text(
                text = visibilityLabel(visibility),
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.Medium,
                color = if (active) MeeshyPalette.White else MeeshyTheme.tokens.textSecondary,
                modifier = Modifier
                    .background(
                        if (active) MeeshyPalette.Indigo500 else MeeshyTheme.tokens.inputBackground,
                        RoundedCornerShape(MeeshyRadius.pill),
                    )
                    .border(
                        width = 1.dp,
                        color = if (active) MeeshyPalette.Indigo500 else MeeshyTheme.tokens.inputBorder,
                        shape = RoundedCornerShape(MeeshyRadius.pill),
                    )
                    .clickable { onSelect(visibility) }
                    .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.sm),
            )
        }
    }
}

@Composable
private fun visibilityLabel(visibility: FeedPostVisibility): String = stringResource(
    when (visibility) {
        FeedPostVisibility.PUBLIC -> R.string.feed_composer_visibility_public
        FeedPostVisibility.FRIENDS -> R.string.feed_composer_visibility_friends
        FeedPostVisibility.PRIVATE -> R.string.feed_composer_visibility_private
    },
)
