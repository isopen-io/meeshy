package me.meeshy.app.feed

import android.content.ContentResolver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.MediaStore
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
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.Image
import androidx.compose.material.icons.filled.PhotoCamera
import androidx.compose.material.icons.filled.PlayCircle
import androidx.compose.material.icons.filled.Videocam
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
import androidx.core.content.FileProvider
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
import java.io.File

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
 * Camera-photo capture (`onCamera`, [Icons.Filled.PhotoCamera] tile) mirrors iOS's
 * `camera.fill` button — one system `ACTION_IMAGE_CAPTURE` activity
 * ([ActivityResultContracts.TakePicture]) writing into a fresh [CameraCaptureFile]-named
 * destination the composer creates via the app's [FileProvider] authority, then dispatched
 * through the exact same [dispatchPicked] pipeline as a gallery pick — zero new upload/error
 * logic. Camera-video capture (`onVideoCapture`, [Icons.Filled.Videocam] tile) is the same
 * pattern one level over: `ACTION_VIDEO_CAPTURE` ([ActivityResultContracts.CaptureVideo]) writing
 * into a [CameraCaptureFile.nextVideo]-named destination, dispatched through the identical
 * [dispatchPicked] pipeline. **Deliberate, documented scope cut vs. iOS**: two system-delegated
 * tiles, no in-composer photo/video toggle ([CameraView]'s combined `.photo`/`.video` case) — iOS
 * opens a single custom AVFoundation capture screen with an in-app mode switch; Android delegates
 * to the system camera app's own `ACTION_IMAGE_CAPTURE`/`ACTION_VIDEO_CAPTURE` intents, so no
 * camera runtime permission is needed here (the system camera app owns that). File, location or
 * audio attachments and the emoji picker or per-post language override remain unshipped too —
 * iOS's `composerOverlay` toolbar of 6 glyphes, each a real, separately-scoped follow-up.
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
                        draft = draft.withMedia(result.data)
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

    // Camera-photo/video capture: both TakePicture() and CaptureVideo() write into a Uri WE
    // provide (unlike the gallery pickers above, which hand one back), so the destination
    // file/Uri is created up front and held only long enough to resolve the callback — cleared
    // either way so a second tap always starts from a fresh destination.
    var cameraCaptureUri by remember { mutableStateOf<Uri?>(null) }
    val takePicture = rememberLauncherForActivityResult(
        ActivityResultContracts.TakePicture(),
    ) { success: Boolean ->
        val uri = cameraCaptureUri
        cameraCaptureUri = null
        if (success && uri != null) {
            dispatchPicked(listOf(uri))
        } else {
            // Cancelled/failed capture: the destination file may exist empty or not at all —
            // FileProvider.delete() is a no-op either way, never worth surfacing an error for.
            uri?.let { runCatching { context.contentResolver.delete(it, null, null) } }
        }
    }

    var videoCaptureUri by remember { mutableStateOf<Uri?>(null) }
    val captureVideo = rememberLauncherForActivityResult(
        ActivityResultContracts.CaptureVideo(),
    ) { success: Boolean ->
        val uri = videoCaptureUri
        videoCaptureUri = null
        if (success && uri != null) {
            dispatchPicked(listOf(uri))
        } else {
            uri?.let { runCatching { context.contentResolver.delete(it, null, null) } }
        }
    }

    fun launchCamera() {
        if (FeedMediaPicker.modeFor(draft.remainingMediaSlots) == FeedMediaPickMode.None) {
            onMediaError(mediaLimitMessage)
            return
        }
        val uri = context.createCaptureUri(CameraCaptureFile.next(System.currentTimeMillis()))
        context.grantCaptureWritePermission(MediaStore.ACTION_IMAGE_CAPTURE, uri)
        cameraCaptureUri = uri
        takePicture.launch(uri)
    }

    fun launchVideoCapture() {
        if (FeedMediaPicker.modeFor(draft.remainingMediaSlots) == FeedMediaPickMode.None) {
            onMediaError(mediaLimitMessage)
            return
        }
        val uri = context.createCaptureUri(CameraCaptureFile.nextVideo(System.currentTimeMillis()))
        context.grantCaptureWritePermission(MediaStore.ACTION_VIDEO_CAPTURE, uri)
        videoCaptureUri = uri
        captureVideo.launch(uri)
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

            if (draft.qualifiesAsReel) {
                ReelTypeToggle(
                    forcePlainPost = draft.forcePlainPost,
                    onToggle = { draft = draft.withForcePlainPost(!draft.forcePlainPost) },
                )
            }

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
                onCamera = ::launchCamera,
                onVideoCapture = ::launchVideoCapture,
                onRemove = ::removeMedia,
            )
        }
    }
}

/**
 * Builds the `content://` destination [Uri] a system capture activity ([ActivityResultContracts.
 * TakePicture]/[ActivityResultContracts.CaptureVideo]) will write its result into, under
 * `context.cacheDir/captures` via the app's [FileProvider] authority. Shared by both the photo
 * and video capture launchers — [fileName] (from [CameraCaptureFile.next]/[CameraCaptureFile.
 * nextVideo]) is the only thing that differs between them.
 */
private fun Context.createCaptureUri(fileName: String): Uri {
    val capturesDir = File(cacheDir, "captures").apply { mkdirs() }
    val file = File(capturesDir, fileName)
    return FileProvider.getUriForFile(this, "$packageName.fileprovider", file)
}

/**
 * Grants every activity that can resolve [action] (`ACTION_IMAGE_CAPTURE`/`ACTION_VIDEO_CAPTURE`)
 * write+read permission on [uri]. Both [ActivityResultContracts.TakePicture] and
 * [ActivityResultContracts.CaptureVideo] build their capture `Intent` with a plain `EXTRA_OUTPUT`
 * and never set `FLAG_GRANT_WRITE_URI_PERMISSION` themselves (confirmed by reading both
 * contracts' decompiled bytecode — identical shape, same gap) — so an implicitly-resolved camera
 * app has no permission to write into our [FileProvider] Uri unless granted here first (confirmed
 * on-device for the photo case: without this, the stock AOSP camera silently fails to save and
 * the launcher resolves `success = false`). Canonical Android pattern: grant every activity that
 * CAN resolve the capture intent, since the system picks one of them at launch time and the
 * caller can't know which in advance.
 */
private fun Context.grantCaptureWritePermission(action: String, uri: Uri) {
    packageManager
        .queryIntentActivities(Intent(action), PackageManager.MATCH_DEFAULT_ONLY)
        .forEach { resolveInfo ->
            grantUriPermission(
                resolveInfo.activityInfo.packageName,
                uri,
                Intent.FLAG_GRANT_WRITE_URI_PERMISSION or Intent.FLAG_GRANT_READ_URI_PERMISSION,
            )
        }
}

/**
 * The attach-media/take-photo/take-video affordances plus the picked-media
 * thumbnail strip — always shows the gallery, camera and video-capture tiles
 * first (all disabled once [canAddMore] is false or while [isUploading]),
 * then each attached [media] item with a remove overlay, then an in-flight
 * spinner tile while a pick is uploading. Pure Compose glue: every id/list
 * decision it renders came from the already pure/tested [FeedComposerDraft]/
 * upload result upstream.
 */
@Composable
private fun MediaAttachmentsRow(
    media: List<UploadedMedia>,
    isUploading: Boolean,
    canAddMore: Boolean,
    onAdd: () -> Unit,
    onCamera: () -> Unit,
    onVideoCapture: () -> Unit,
    onRemove: (String) -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        val attachEnabled = canAddMore && !isUploading
        IconButton(
            onClick = onAdd,
            enabled = attachEnabled,
            modifier = Modifier
                .size(56.dp)
                .clip(RoundedCornerShape(MeeshyRadius.md))
                .background(MeeshyTheme.tokens.inputBackground)
                .border(1.dp, MeeshyTheme.tokens.inputBorder, RoundedCornerShape(MeeshyRadius.md)),
        ) {
            Icon(
                imageVector = Icons.Filled.Image,
                contentDescription = stringResource(R.string.feed_composer_attach_media),
                tint = if (attachEnabled) MeeshyPalette.Indigo500 else MeeshyTheme.tokens.textMuted,
            )
        }

        IconButton(
            onClick = onCamera,
            enabled = attachEnabled,
            modifier = Modifier
                .size(56.dp)
                .clip(RoundedCornerShape(MeeshyRadius.md))
                .background(MeeshyTheme.tokens.inputBackground)
                .border(1.dp, MeeshyTheme.tokens.inputBorder, RoundedCornerShape(MeeshyRadius.md)),
        ) {
            Icon(
                imageVector = Icons.Filled.PhotoCamera,
                contentDescription = stringResource(R.string.feed_composer_take_photo),
                tint = if (attachEnabled) MeeshyPalette.Indigo500 else MeeshyTheme.tokens.textMuted,
            )
        }

        IconButton(
            onClick = onVideoCapture,
            enabled = attachEnabled,
            modifier = Modifier
                .size(56.dp)
                .clip(RoundedCornerShape(MeeshyRadius.md))
                .background(MeeshyTheme.tokens.inputBackground)
                .border(1.dp, MeeshyTheme.tokens.inputBorder, RoundedCornerShape(MeeshyRadius.md)),
        ) {
            Icon(
                imageVector = Icons.Filled.Videocam,
                contentDescription = stringResource(R.string.feed_composer_take_video),
                tint = if (attachEnabled) MeeshyPalette.Indigo500 else MeeshyTheme.tokens.textMuted,
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

/**
 * The Réel⇄Post override chip — port of iOS `FeedView.composerOverlay`'s toggle
 * (`composerForcePlainPost.toggle()`, shown only when
 * `ReelComposition.qualifiesAsReel`). The caller only renders this Composable
 * when [FeedComposerDraft.qualifiesAsReel] is already true, mirroring iOS's own
 * `if ReelComposition.qualifiesAsReel(...)` gate around the identical button —
 * so this Composable itself stays a pure display of [forcePlainPost], with no
 * qualification logic of its own to duplicate/drift from [ReelComposition].
 */
@Composable
private fun ReelTypeToggle(
    forcePlainPost: Boolean,
    onToggle: () -> Unit,
) {
    val hint = stringResource(R.string.feed_composer_type_hint)
    val tint = if (forcePlainPost) MeeshyTheme.tokens.textMuted else MeeshyPalette.Indigo300
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        modifier = Modifier
            .clip(RoundedCornerShape(MeeshyRadius.pill))
            .clickable(onClickLabel = hint, onClick = onToggle)
            .padding(vertical = MeeshySpacing.xs),
    ) {
        Icon(
            imageVector = if (forcePlainPost) Icons.Filled.Description else Icons.Filled.PlayCircle,
            contentDescription = null,
            tint = tint,
            modifier = Modifier.size(16.dp),
        )
        Text(
            text = stringResource(
                if (forcePlainPost) R.string.feed_composer_type_post else R.string.feed_composer_type_reel,
            ),
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.Medium,
            color = tint,
        )
    }
}
