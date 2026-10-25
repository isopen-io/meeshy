package me.meeshy.app.feed

import android.content.ContentResolver
import android.media.MediaRecorder
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.core.content.FileProvider
import coil.compose.AsyncImage
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import me.meeshy.feature.feed.R
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.model.ComposerLanguage
import me.meeshy.sdk.model.SharedPlace
import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.sdk.model.auth.LanguageStepSelection
import me.meeshy.sdk.model.formattedCoordinates
import me.meeshy.sdk.model.waveform.VoiceRecordingFile
import me.meeshy.sdk.model.waveform.VoiceRecordingOutcome
import me.meeshy.sdk.model.waveform.VoiceRecordingSession
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.ui.component.recording.VoiceRecordingPill
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
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
 * Camera-photo capture (`onCamera`, [MeeshyIcons.Camera] tile) mirrors iOS's
 * `camera.fill` button — one system `ACTION_IMAGE_CAPTURE` activity
 * ([ActivityResultContracts.TakePicture]) writing into a fresh [CameraCaptureFile]-named
 * destination the composer creates via the app's [FileProvider] authority, then dispatched
 * through the exact same [dispatchPicked] pipeline as a gallery pick — zero new upload/error
 * logic. Camera-video capture (`onVideoCapture`, [MeeshyIcons.Video] tile) is the same
 * pattern one level over: `ACTION_VIDEO_CAPTURE` ([ActivityResultContracts.CaptureVideo]) writing
 * into a [CameraCaptureFile.nextVideo]-named destination, dispatched through the identical
 * [dispatchPicked] pipeline. **Deliberate, documented scope cut vs. iOS**: two system-delegated
 * tiles, no in-composer photo/video toggle ([CameraView]'s combined `.photo`/`.video` case) — iOS
 * opens a single custom AVFoundation capture screen with an in-app mode switch; Android delegates
 * to the system camera app's own `ACTION_IMAGE_CAPTURE`/`ACTION_VIDEO_CAPTURE` intents, so no
 * camera runtime permission is needed here (the system camera app owns that).
 *
 * Generic file attachment (`onAttachFile`, [MeeshyIcons.AttachFile] tile) mirrors iOS's
 * `doc.fill` button: [ActivityResultContracts.OpenMultipleDocuments] (any MIME type) lets the
 * author pick ANY document from the system picker, dispatched through the **exact same** [dispatchPicked]
 * pipeline every other tile already uses — the TUS upload/error-handling logic is fully
 * MIME-agnostic (confirmed by reading `getAttachmentType`/`UploadProcessor.validateFile` gateway-side:
 * arbitrary MIME types are accepted and classified, never rejected outright), so no new upload path
 * was needed. The one genuinely new rendering decision — a picked document has no
 * image/video thumbnail to show — lives in the pure [UploadedMedia.hasThumbnailPreview] extension
 * (next to [FeedComposerDraft]), not inlined here: [MediaAttachmentsRow] renders a generic
 * [MeeshyIcons.Document] tile instead of [AsyncImage] whenever an attached
 * item answers `false`. **Deliberate, documented scope cut**: no filename/size label on the file tile yet —
 * [UploadedMedia] (`:core:model`) doesn't carry the original filename the gateway's TUS response
 * discards on this path, unlike iOS's `MessageAttachment.fileName`; adding it is a separately-scoped
 * follow-up touching the wire model, not a rendering-only change. The emoji picker remains
 * unshipped — a real, separately-scoped follow-up.
 *
 * **Per-post language override** (a compact flag pill under the header, mirrors iOS's
 * `ComposerLanguageFlag` button opening `AudioLanguagePickerView`): defaults to
 * [ComposerLanguage.DEFAULT] (never auto-detected from the typed text — the Feed composer
 * has no live-typing detector, exactly like iOS's own `FeedComposerSheet.composerLanguage`),
 * tapping it opens [ComposerLanguagePickerDialog], a search-filtered list reusing the
 * already-tested [LanguageStepSelection.pickerLanguages]/[LanguageStepSelection.filter]
 * pure core (the same catalogue the registration wizard's language step already uses) — no
 * re-implementation of the catalogue or the filter rule. The chosen code is always forwarded
 * on publish ([FeedComposerDraft.language]), matching iOS always sending
 * `originalLanguage: composerLanguage`, never omitting it once a draft exists.
 *
 * **Audio attachment** ([FeedVoiceRecorder], [MeeshyIcons.Mic] tile) mirrors iOS's
 * `mic.fill` button, but scoped to the smallest genuinely-unblocked slice rather than porting
 * iOS's dedicated full-screen `AudioPostComposerView` (its own record → on-device-transcribe →
 * pick-language → preview flow): a take recorded here dispatches through [dispatchItems] as one
 * more `audio/mp4` attachment — the exact same MIME-agnostic upload pipeline the file tile
 * already proved handles non-media attachments correctly (renders as the generic file icon via
 * the already-tested [UploadedMedia.hasThumbnailPreview] `AUDIO` case). **Reuses, not
 * duplicates, chat's proven recording stack** (`chat-voice-recording-capture`) — the pure
 * [VoiceRecordingSession]/[VoiceRecordingOutcome]/[VoiceRecordingFile] and the
 * [VoiceRecordingPill] Composable moved to `:core:model`/`:sdk-ui` in this same slice
 * (`feed-composer-voice-capture`, no behaviour change to chat) specifically so this composer
 * reuses them verbatim instead of a second copy of the same state machine. The permission
 * request (`RECORD_AUDIO`) -> `MediaRecorder` (`MPEG_4`/`AAC`) -> 100 ms tick-and-meter loop ->
 * Stop/Send-finalises-identically shape mirrors `ChatScreen`'s composer glue exactly, since
 * that's Android-runtime I/O glue with no further pure decision left to share (matching this
 * codebase's own established convention of duplicating I/O glue rather than pure logic — see
 * also [readMediaUploadItem]). While recording, the pill **replaces** [MediaAttachmentsRow] in
 * place (same UX shape as the chat composer swapping its whole input row for the pill) — the
 * already-attached media/spinner reappear immediately once the take is cancelled/finalised.
 * **Deliberate, documented scope cut vs. iOS**: no on-device transcription preview, no per-post
 * language override tied to the clip, no dedicated full-screen composer — each a
 * separately-scoped, heavier follow-up.
 *
 * **Location attachment** ([FeedLocationCapture], [MeeshyIcons.LocationFilled] tile) mirrors iOS's
 * `location.fill` button, scoped to the smallest genuinely-valuable first sub-slice rather than
 * porting iOS's dedicated `LocationPickerView` (its own full-screen MapKit map, search, "my
 * position" recentring and `CLGeocoder` reverse-geocoding into a name/address): tapping the tile
 * requests `ACCESS_FINE_LOCATION`/`ACCESS_COARSE_LOCATION`, then captures one fresh fix straight
 * from [android.location.LocationManager] (GPS preferred, network fallback — no Play Services
 * dependency added, matching this module's existing footprint) and attaches it as a bare
 * [SharedPlace] (coordinates only, `name`/`address` left `null`). The attached place renders as
 * its own removable chip (coordinates formatted via [me.meeshy.sdk.model.formattedCoordinates]),
 * separate from [MediaAttachmentsRow] since a post carries at most one location, never a list
 * (mirrors [FeedComposerDraft.withLocation] replacing rather than accumulating). **Deliberate,
 * documented scope cut vs. iOS**: no map UI, no search, no reverse-geocoded name/address — each a
 * separately-scoped, heavier follow-up (the map picker alone would need a Maps SDK dependency this
 * slice deliberately avoids pulling in).
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
    var showLanguagePicker by remember { mutableStateOf(false) }
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val mediaLimitMessage = pluralStringResource(R.plurals.feed_composer_media_limit, FeedComposerDraft.MAX_MEDIA, FeedComposerDraft.MAX_MEDIA)
    val mediaUnusableMessage = stringResource(R.string.feed_composer_media_unusable)

    // The shared upload tail every attach path (gallery/camera/file Uris, and now a
    // directly-built voice-recording MediaUploadItem) converges on: upload, then fold the
    // result into both the pure draft and the richer display-only previews. Extracted from
    // dispatchPicked (refactor while extending, not duplicating).
    suspend fun uploadAndAttach(items: List<MediaUploadItem>) {
        if (items.isEmpty()) return
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
            uploadAndAttach(items)
        }
    }

    // Entry point for an already-built MediaUploadItem (the voice recorder hands off real
    // bytes + an explicit "audio/mp4" MIME directly, unlike a picked Uri whose MIME/filename
    // dispatchPicked reads via the ContentResolver) — same cap/error/upload tail as dispatchPicked,
    // minus the Uri-reading step it doesn't need.
    fun dispatchItems(items: List<MediaUploadItem>) {
        if (items.isEmpty() || isUploadingMedia) return
        if (draft.remainingMediaSlots <= 0) {
            onMediaError(mediaLimitMessage)
            return
        }
        scope.launch { uploadAndAttach(items) }
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

    var retouch by remember { mutableStateOf<FeedRetouchPending?>(null) }
    retouch?.let { pending ->
        FeedCaptureRetouchHost(pending, onDeliver = { item -> retouch = null; dispatchItems(listOf(item)) }, onDismiss = { retouch = null })
    }
    val camera = rememberFeedCameraCapture(
        onPhoto = { uri ->
            scope.launch {
                val item = withContext(Dispatchers.IO) { context.contentResolver.readMediaUploadItem(uri) }
                val pending = item?.let { withContext(Dispatchers.Default) { FeedRetouchPending.of(it) } }
                if (pending != null) retouch = pending else dispatchPicked(listOf(uri))
            }
        },
        onVideo = { uri -> dispatchPicked(listOf(uri)) },
    )

    fun launchCapture(capture: () -> Unit) {
        if (FeedMediaPicker.modeFor(draft.remainingMediaSlots) == FeedMediaPickMode.None) {
            onMediaError(mediaLimitMessage)
            return
        }
        capture()
    }

    // File attachment: unlike PickMultipleVisualMedia, OpenMultipleDocuments has no
    // maxItems<=1 crash constraint, so there is no picker-mode routing to do — dispatchPicked
    // already caps to draft.remainingMediaSlots and surfaces mediaLimitMessage on overflow.
    val pickFiles = rememberLauncherForActivityResult(
        ActivityResultContracts.OpenMultipleDocuments(),
    ) { uris: List<Uri> -> dispatchPicked(uris) }

    fun launchFilePicker() {
        if (draft.isMediaFull) {
            onMediaError(mediaLimitMessage)
            return
        }
        pickFiles.launch(arrayOf("*/*"))
    }

    val voice = rememberFeedVoiceRecorder()

    fun requestVoiceRecording() {
        if (draft.isMediaFull) {
            onMediaError(mediaLimitMessage)
            return
        }
        voice.request()
    }

    fun finishVoiceRecording() {
        voice.finish()?.let { take -> dispatchItems(listOf(take)) }
    }

    fun removeMedia(id: String) {
        draft = draft.withoutMedia(id)
        attachedMedia = attachedMedia.filterNot { it.id == id }
    }

    val locationUnavailableMessage = stringResource(R.string.feed_composer_location_unavailable)
    val location = rememberFeedLocationCapture(
        onPlace = { place -> draft = draft.withLocation(place) },
        onUnavailable = { onMediaError(locationUnavailableMessage) },
    )

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
            FeedComposerHeader(
                canPublish = draft.canPublish && !isUploadingMedia && !voice.session.isRecording,
                onClose = onDismiss,
                onPublish = { draft.publishRequest()?.let(onPublish) },
            )

            ComposerLanguagePill(
                code = draft.language,
                onClick = { showLanguagePicker = true },
            )

            FeedVisibilityRow(
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

            draft.location?.let { place ->
                LocationAttachmentChip(
                    place = place,
                    onRemove = { draft = draft.withoutLocation() },
                )
            }

            if (voice.session.isRecording) {
                VoiceRecordingPill(
                    session = voice.session,
                    accentColor = MeeshyPalette.Indigo500,
                    onCancel = voice::cancel,
                    onStop = ::finishVoiceRecording,
                    onSend = ::finishVoiceRecording,
                )
            } else {
                MediaAttachmentsRow(
                    media = attachedMedia,
                    isUploading = isUploadingMedia,
                    canAddMore = !draft.isMediaFull,
                    isCapturingLocation = location.isCapturing,
                    onAdd = ::launchMediaPicker,
                    onCamera = { launchCapture(camera::photo) },
                    onVideoCapture = { launchCapture(camera::video) },
                    onAttachFile = ::launchFilePicker,
                    onRecordVoice = ::requestVoiceRecording,
                    onAddLocation = location::request,
                    onRemove = ::removeMedia,
                )
                MediaAltTextFields(
                    media = attachedMedia,
                    altById = draft.mediaAlt,
                    onAltChange = { mediaId, text -> draft = draft.withAlt(mediaId, text) },
                )
            }
        }
    }

    if (showLanguagePicker) {
        ComposerLanguagePickerDialog(
            currentCode = draft.language,
            onSelect = { code ->
                draft = draft.withLanguage(code)
                showLanguagePicker = false
            },
            onDismiss = { showLanguagePicker = false },
        )
    }
}
