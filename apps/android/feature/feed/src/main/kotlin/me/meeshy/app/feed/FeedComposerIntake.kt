package me.meeshy.app.feed

import me.meeshy.sdk.media.MediaIntake
import me.meeshy.sdk.media.readMediaUploadItem
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import me.meeshy.feature.feed.R
import me.meeshy.sdk.media.MediaLocationRefusal
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.model.PermissionNature
import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.ui.component.permission.PermissionFlowHost
import me.meeshy.ui.component.permission.launchWithCameraAccess
import me.meeshy.ui.component.permission.rememberPermissionFlow

/** What the post composer holds while it is open: the pure draft, the richer display-only previews, the upload flag. */
@Stable
internal class FeedComposerState(initialDraft: FeedComposerDraft) {
    var draft: FeedComposerDraft by mutableStateOf(initialDraft)
    var attachedMedia: List<UploadedMedia> by mutableStateOf(initialDraft.media)
    var isUploading: Boolean by mutableStateOf(false)

    fun attach(media: List<UploadedMedia>) {
        draft = draft.withMedia(media)
        attachedMedia = attachedMedia + media
    }

    fun detach(id: String) {
        draft = draft.withoutMedia(id)
        attachedMedia = attachedMedia.filterNot { it.id == id }
    }
}

/** Every way a file, a take or a place enters the post — one value, stable for the composer's whole life. */
@Stable
internal class FeedComposerIntake(
    val voice: FeedVoiceRecorder,
    val location: FeedLocationCapture,
    val pickMedia: () -> Unit,
    val capturePhoto: () -> Unit,
    val captureVideo: () -> Unit,
    val pickFiles: () -> Unit,
    val requestVoice: () -> Unit,
    val finishVoice: () -> Unit,
)

/**
 * The intake of the post composer (gallery, system camera with its retouch step, files, voice take, location) and the
 * upload tail they all converge on: upload, then fold the result into the draft — or, offline / refused, keep the media
 * on the device behind a placeholder the outbox uploads later (#13417). Hosts the retouch editors and the camera
 * permission flow it may raise. The callbacks are read at call time, so the returned value never goes stale.
 */
@Composable
internal fun rememberFeedComposerIntake(
    state: FeedComposerState,
    onUploadMedia: suspend (List<MediaUploadItem>) -> NetworkResult<List<UploadedMedia>>,
    onMediaError: (String) -> Unit,
    onQueueMedia: (suspend (MediaUploadItem) -> String)?,
): FeedComposerIntake {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val upload by rememberUpdatedState(onUploadMedia)
    val reportError by rememberUpdatedState(onMediaError)
    val queue by rememberUpdatedState(onQueueMedia)
    val limitMessage by rememberUpdatedState(
        pluralStringResource(R.plurals.feed_composer_media_limit, FeedComposerDraft.MAX_MEDIA, FeedComposerDraft.MAX_MEDIA),
    )
    val unusableMessage by rememberUpdatedState(stringResource(R.string.feed_composer_media_unusable))
    val unavailableMessage by rememberUpdatedState(stringResource(R.string.feed_composer_location_unavailable))
    val locationRefusedMessage by rememberUpdatedState(stringResource(R.string.feed_composer_media_location_refused))

    suspend fun deliver(items: List<MediaUploadItem>, previews: List<String?>) {
        when (val result = upload(items)) {
            is NetworkResult.Success ->
                if (result.data.isEmpty()) reportError(unusableMessage) else state.attach(result.data)
            is NetworkResult.Failure -> {
                val enqueue = queue
                when {
                    MediaLocationRefusal.isCode(result.error.code) -> reportError(locationRefusedMessage)
                    enqueue == null -> reportError(result.error.message ?: unusableMessage)
                    else -> state.attach(items.mapIndexed { index, item -> FeedPendingMedia.placeholder(enqueue(item), item, previews.getOrNull(index)) })
                }
            }
        }
    }

    suspend fun uploadAndAttach(items: List<MediaUploadItem>, previews: List<String?> = emptyList()) {
        if (items.isEmpty()) return
        state.isUploading = true
        try {
            deliver(items, previews)
        } finally {
            items.forEach(MediaIntake::release)
            state.isUploading = false
        }
    }

    fun dispatchPicked(uris: List<Uri>) {
        if (uris.isEmpty() || state.isUploading) return
        val remaining = state.draft.remainingMediaSlots
        if (remaining <= 0) return reportError(limitMessage)
        scope.launch {
            val picked = withContext(Dispatchers.IO) {
                uris.take(remaining).mapNotNull { uri -> context.readMediaUploadItem(uri)?.let { it to uri.toString() } }
            }
            uploadAndAttach(picked.map { it.first }, picked.map { it.second })
        }
    }

    fun dispatchItems(items: List<MediaUploadItem>) {
        if (items.isEmpty()) return
        if (state.isUploading || state.draft.remainingMediaSlots <= 0) {
            items.forEach(MediaIntake::release)
            if (!state.isUploading) reportError(limitMessage)
            return
        }
        scope.launch { uploadAndAttach(items) }
    }

    val pickSingle = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri: Uri? ->
        dispatchPicked(listOfNotNull(uri))
    }
    val pickMultiple = rememberLauncherForActivityResult(ActivityResultContracts.PickMultipleVisualMedia(FeedComposerDraft.MAX_MEDIA)) { uris ->
        dispatchPicked(uris)
    }
    val pickDocuments = rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris -> dispatchPicked(uris) }

    var retouch by remember { mutableStateOf<FeedRetouchPending?>(null) }
    retouch?.let { pending ->
        FeedCaptureRetouchHost(pending, onDeliver = { item -> retouch = null; if (item !== pending.item) MediaIntake.release(pending.item); dispatchItems(listOf(item)) }, onDismiss = { MediaIntake.release(pending.item); retouch = null })
    }
    var videoRetouch by remember { mutableStateOf<FeedVideoRetouchPending?>(null) }
    videoRetouch?.let { pending ->
        FeedVideoRetouchHost(
            pending,
            onDeliver = { item ->
                videoRetouch = null
                item?.let { dispatchItems(listOf(it)) } ?: reportError(unusableMessage)
            },
            onDismiss = {
                pending.discard()
                videoRetouch = null
            },
        )
    }
    val camera = rememberFeedCameraCapture(
        onPhoto = { uri ->
            scope.launch {
                val item = withContext(Dispatchers.IO) { context.readMediaUploadItem(uri) }
                val pending = item?.let { withContext(Dispatchers.Default) { FeedRetouchPending.of(it) } }
                if (pending != null) retouch = pending else { item?.let(MediaIntake::release); dispatchPicked(listOf(uri)) }
            }
        },
        onVideo = { uri ->
            scope.launch {
                val name = withContext(Dispatchers.IO) { context.contentResolver.captureName(uri) }
                val pending = FeedVideoRetouchPending.of(context, uri, name, System.currentTimeMillis())
                if (pending != null) videoRetouch = pending else dispatchPicked(listOf(uri))
            }
        },
    )
    val cameraAccess = rememberPermissionFlow()
    PermissionFlowHost(cameraAccess)
    val voice = rememberFeedVoiceRecorder()
    val location = rememberFeedLocationCapture(
        onPlace = { place -> state.draft = state.draft.withLocation(place) },
        onUnavailable = { reportError(unavailableMessage) },
    )

    return remember(state, voice, location, camera) {
        fun launchCapture(capture: () -> Unit) {
            if (FeedMediaPicker.modeFor(state.draft.remainingMediaSlots) == FeedMediaPickMode.None) return reportError(limitMessage)
            scope.launch { launchWithCameraAccess(ensureAccess = { cameraAccess.ensure(PermissionNature.CAMERA) }, launch = capture) }
        }
        val imageAndVideo = PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageAndVideo)
        FeedComposerIntake(
            voice = voice,
            location = location,
            pickMedia = {
                when (FeedMediaPicker.modeFor(state.draft.remainingMediaSlots)) {
                    FeedMediaPickMode.Single -> pickSingle.launch(imageAndVideo)
                    FeedMediaPickMode.Multiple -> pickMultiple.launch(imageAndVideo)
                    FeedMediaPickMode.None -> reportError(limitMessage)
                }
            },
            capturePhoto = { launchCapture(camera::photo) },
            captureVideo = { launchCapture(camera::video) },
            pickFiles = { if (state.draft.isMediaFull) reportError(limitMessage) else pickDocuments.launch(arrayOf("*/*")) },
            requestVoice = { if (state.draft.isMediaFull) reportError(limitMessage) else voice.request() },
            finishVoice = { voice.finish()?.let { take -> dispatchItems(listOf(take)) } },
        )
    }
}
