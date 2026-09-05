package me.meeshy.app.feed

import android.Manifest
import android.content.ContentResolver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.MediaRecorder
import android.net.Uri
import android.os.Build
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
import androidx.compose.material.icons.automirrored.filled.InsertDriveFile
import androidx.compose.material.icons.filled.AttachFile
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.Image
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Mic
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
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
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
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import coil.compose.AsyncImage
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import me.meeshy.feature.feed.R
import me.meeshy.sdk.location.awaitFreshLocationFix
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.model.ComposerLanguage
import me.meeshy.sdk.model.SharedPlace
import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.sdk.model.auth.LanguageStepSelection
import me.meeshy.sdk.model.formattedCoordinates
import me.meeshy.sdk.model.waveform.MicAmplitudeDecibels
import me.meeshy.sdk.model.waveform.VoiceRecordingFile
import me.meeshy.sdk.model.waveform.VoiceRecordingOutcome
import me.meeshy.sdk.model.waveform.VoiceRecordingSession
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.ui.component.LanguagePickerDialog
import me.meeshy.ui.component.LanguagePickerOption
import me.meeshy.ui.component.recording.VoiceRecordingPill
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
 * camera runtime permission is needed here (the system camera app owns that).
 *
 * Generic file attachment (`onAttachFile`, [Icons.Filled.AttachFile] tile) mirrors iOS's
 * `doc.fill` button: [ActivityResultContracts.OpenMultipleDocuments] (any MIME type) lets the
 * author pick ANY document from the system picker, dispatched through the **exact same** [dispatchPicked]
 * pipeline every other tile already uses — the TUS upload/error-handling logic is fully
 * MIME-agnostic (confirmed by reading `getAttachmentType`/`UploadProcessor.validateFile` gateway-side:
 * arbitrary MIME types are accepted and classified, never rejected outright), so no new upload path
 * was needed. The one genuinely new rendering decision — a picked document has no
 * image/video thumbnail to show — lives in the pure [UploadedMedia.hasThumbnailPreview] extension
 * (next to [FeedComposerDraft]), not inlined here: [MediaAttachmentsRow] renders a generic
 * [Icons.AutoMirrored.Filled.InsertDriveFile] tile instead of [AsyncImage] whenever an attached
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
 * **Audio attachment** (`requestVoiceRecording`, [Icons.Filled.Mic] tile) mirrors iOS's
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
 * **Location attachment** (`requestDeviceLocation`, [Icons.Filled.LocationOn] tile) mirrors iOS's
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
    val mediaLimitMessage = stringResource(R.string.feed_composer_media_limit, FeedComposerDraft.MAX_MEDIA)
    val mediaUnusableMessage = stringResource(R.string.feed_composer_media_unusable)

    // The shared upload tail every attach path (gallery/camera/file Uris, and now a
    // directly-built voice-recording MediaUploadItem) converges on: upload, then fold the
    // result into both the pure draft and the richer display-only previews. Extracted from
    // dispatchPicked (refactor while extending, not duplicating — same precedent as
    // launchCamera/launchVideoCapture sharing grantCaptureWritePermission/createCaptureUri).
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

    // Audio attachment: an in-app recording, not a system-delegated picker (Android has no
    // system "record audio to a file" intent this composer can rely on) — mirrors ChatScreen's
    // proven MediaRecorder wiring verbatim (same MPEG_4/AAC config, same permission-then-record
    // shape). This is Android-runtime I/O glue with no further pure decision to extract, so it's
    // duplicated rather than shared, exactly like this composer's own readMediaUploadItem is
    // deliberately duplicated from StoryComposerScreen's/RegistrationScreen's — the pure state
    // machine it drives (VoiceRecordingSession/VoiceRecordingFile) and the VoiceRecordingPill it
    // renders ARE shared (see the class doc on each, moved to :core:model/:sdk-ui this slice).
    var recording by remember { mutableStateOf(VoiceRecordingSession.idle()) }
    var activeVoiceRecorder by remember { mutableStateOf<MediaRecorder?>(null) }
    var activeVoiceRecordingFile by remember { mutableStateOf<File?>(null) }

    // A ModalBottomSheet can be dismissed at any time via the system back gesture, discarding
    // this Composable's remember-scoped state with no confirmation (documented gotcha from the
    // file-attachment slice's own on-device verification) — unlike a picked-but-unsent image,
    // an un-released MediaRecorder left recording would leak an open microphone/file handle
    // past the sheet's lifetime. Release on dispose covers every dismissal path (Cancel, back
    // gesture, publish) uniformly.
    DisposableEffect(Unit) {
        onDispose {
            activeVoiceRecorder?.let { recorder -> runCatching { recorder.release() } }
            activeVoiceRecordingFile?.delete()
        }
    }

    fun releaseVoiceRecorder(): File? {
        activeVoiceRecorder?.let { recorder ->
            // stop() throws IllegalStateException if called too soon after start() with no
            // data captured yet (e.g. a cancel within the same frame as the tap) — never worth
            // crashing the composer over a take too short to matter.
            runCatching { recorder.stop() }
            recorder.release()
        }
        activeVoiceRecorder = null
        val file = activeVoiceRecordingFile
        activeVoiceRecordingFile = null
        return file
    }

    fun startVoiceRecording() {
        val dir = File(context.cacheDir, "voice").apply { mkdirs() }
        val file = File(dir, VoiceRecordingFile.next(System.currentTimeMillis()))
        val recorder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            MediaRecorder(context)
        } else {
            @Suppress("DEPRECATION")
            MediaRecorder()
        }
        try {
            recorder.setAudioSource(MediaRecorder.AudioSource.MIC)
            recorder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
            recorder.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
            recorder.setOutputFile(file.absolutePath)
            recorder.prepare()
            recorder.start()
            activeVoiceRecorder = recorder
            activeVoiceRecordingFile = file
            recording = recording.start()
        } catch (e: Exception) {
            recorder.release()
            file.delete()
        }
    }

    val micPermissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { granted -> if (granted) startVoiceRecording() }

    fun requestVoiceRecording() {
        if (draft.isMediaFull) {
            onMediaError(mediaLimitMessage)
            return
        }
        val granted = ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.RECORD_AUDIO,
        ) == PackageManager.PERMISSION_GRANTED
        if (granted) startVoiceRecording() else micPermissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
    }

    fun cancelVoiceRecording() {
        releaseVoiceRecorder()?.delete()
        recording = recording.cancel()
    }

    // Both Stop and Send finalise the take identically — there is no staging tray in this
    // composer either (every other attachment kind delivers on pick too), so "stop and add to
    // attachments" reads as "deliver it now", identically to "send". A take below the minimum
    // sendable duration never reaches here — the pill disables both buttons (VoiceRecordingSession.canSend).
    fun finishVoiceRecording() {
        val file = releaseVoiceRecorder()
        val stop = recording.stop()
        recording = stop.session
        val completedFile = file.takeIf { stop.outcome is VoiceRecordingOutcome.Completed }
        val bytes = completedFile?.let { runCatching { it.readBytes() }.getOrNull() }
        file?.delete()
        if (completedFile != null && bytes != null && bytes.isNotEmpty()) {
            dispatchItems(listOf(MediaUploadItem(bytes = bytes, fileName = completedFile.name, mimeType = "audio/mp4")))
        }
    }

    fun removeMedia(id: String) {
        draft = draft.withoutMedia(id)
        attachedMedia = attachedMedia.filterNot { it.id == id }
    }

    // Location attachment: one fresh GPS/network fix via android.location.LocationManager, no
    // Play Services dependency added (matches this module's existing footprint — see the class
    // doc comment's documented scope cut). Independent of the media-upload-in-flight gate: it
    // never touches MAX_MEDIA/attachedMedia, only guarded against a concurrent capture of its own.
    var isCapturingLocation by remember { mutableStateOf(false) }
    val locationUnavailableMessage = stringResource(R.string.feed_composer_location_unavailable)

    fun captureDeviceLocation() {
        if (isCapturingLocation) return
        scope.launch {
            isCapturingLocation = true
            val fix = context.awaitFreshLocationFix()
            isCapturingLocation = false
            if (fix != null) {
                draft = draft.withLocation(SharedPlace(latitude = fix.latitude, longitude = fix.longitude))
            } else {
                onMediaError(locationUnavailableMessage)
            }
        }
    }

    val locationPermissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions(),
    ) { results ->
        val granted = results[Manifest.permission.ACCESS_FINE_LOCATION] == true ||
            results[Manifest.permission.ACCESS_COARSE_LOCATION] == true
        if (granted) captureDeviceLocation() else onMediaError(locationUnavailableMessage)
    }

    fun requestDeviceLocation() {
        val fineGranted = ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.ACCESS_FINE_LOCATION,
        ) == PackageManager.PERMISSION_GRANTED
        val coarseGranted = ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.ACCESS_COARSE_LOCATION,
        ) == PackageManager.PERMISSION_GRANTED
        if (fineGranted || coarseGranted) {
            captureDeviceLocation()
        } else {
            locationPermissionLauncher.launch(
                arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION),
            )
        }
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
                canPublish = draft.canPublish && !isUploadingMedia && !recording.isRecording,
                onClose = onDismiss,
                onPublish = { draft.publishRequest()?.let(onPublish) },
            )

            ComposerLanguagePill(
                code = draft.language,
                onClick = { showLanguagePicker = true },
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

            draft.location?.let { place ->
                LocationAttachmentChip(
                    place = place,
                    onRemove = { draft = draft.withoutLocation() },
                )
            }

            // 100ms tick-and-meter loop, only alive while recording — identical shape to
            // ChatScreen's own LaunchedEffect(recording.isRecording) driving the same pill.
            LaunchedEffect(recording.isRecording) {
                while (recording.isRecording) {
                    delay(100)
                    recording = recording.tick(0.1)
                    val amplitude = activeVoiceRecorder?.let { runCatching { it.maxAmplitude }.getOrNull() }
                    if (amplitude != null) {
                        recording = recording.meter(MicAmplitudeDecibels.toDecibels(amplitude))
                    }
                }
            }

            if (recording.isRecording) {
                VoiceRecordingPill(
                    session = recording,
                    accentColor = MeeshyPalette.Indigo500,
                    onCancel = ::cancelVoiceRecording,
                    onStop = ::finishVoiceRecording,
                    onSend = ::finishVoiceRecording,
                )
            } else {
                MediaAttachmentsRow(
                    media = attachedMedia,
                    isUploading = isUploadingMedia,
                    canAddMore = !draft.isMediaFull,
                    isCapturingLocation = isCapturingLocation,
                    onAdd = ::launchMediaPicker,
                    onCamera = ::launchCamera,
                    onVideoCapture = ::launchVideoCapture,
                    onAttachFile = ::launchFilePicker,
                    onRecordVoice = ::requestVoiceRecording,
                    onAddLocation = ::requestDeviceLocation,
                    onRemove = ::removeMedia,
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
 * The compact language-flag pill, shown under the header — port of iOS's
 * `ComposerLanguageFlag` button (collapsed state shows ONLY the flag; the language
 * name only appears inside the picker list, matching iOS's own 2026-07-30 directive).
 * Its accessible value carries the language's native name, via the already-tested
 * [LanguageStepSelection.selectedLanguageName], so a screen reader announces the
 * chosen language even though the glyph alone doesn't.
 */
@Composable
private fun ComposerLanguagePill(
    code: String,
    onClick: () -> Unit,
) {
    val displayName = LanguageStepSelection.selectedLanguageName(code)
    Box(
        modifier = Modifier
            .size(36.dp)
            .clip(CircleShape)
            .background(MeeshyTheme.tokens.inputBackground)
            .border(1.dp, MeeshyTheme.tokens.inputBorder, CircleShape)
            .clickable(onClickLabel = displayName, onClick = onClick)
            .semantics { contentDescription = displayName },
        contentAlignment = Alignment.Center,
    ) {
        Text(text = ComposerLanguage.flag(code), style = MaterialTheme.typography.titleMedium)
    }
}

/**
 * The per-post language picker — a search-filtered list over [LanguageStepSelection.
 * pickerLanguages]/[LanguageStepSelection.filter], the same pure catalogue/filter core
 * the registration wizard's language step already uses (no re-implementation). Mirrors
 * the shape of `SettingsScreen`'s own `RegionalLanguageDialog` (a plain [AlertDialog],
 * not a nested [ModalBottomSheet] — two stacked modal sheets is an established anti-
 * pattern this codebase avoids) rather than porting iOS's dedicated full-screen
 * `AudioLanguagePickerView`.
 */
@Composable
private fun ComposerLanguagePickerDialog(
    currentCode: String,
    onSelect: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    var query by remember { mutableStateOf("") }
    val languages = remember(query) { LanguageStepSelection.filter(query) }
    LanguagePickerDialog(
        titleText = stringResource(R.string.feed_composer_language_title),
        options = languages.map { info ->
            LanguagePickerOption(
                code = info.code,
                label = "${info.flag}  ${info.nativeName}",
                isSelected = info.code.equals(currentCode, ignoreCase = true),
            )
        },
        onSelect = { code -> code?.let(onSelect) },
        onDismiss = onDismiss,
        dismissButtonLabel = stringResource(R.string.feed_composer_cancel),
        searchQuery = query,
        onSearchQueryChange = { query = it },
        searchPlaceholder = stringResource(R.string.feed_composer_language_search),
    )
}

/**
 * The attached-location chip — shown between the text field and
 * [MediaAttachmentsRow] whenever [FeedComposerDraft.location] is non-null. Same
 * pill-with-close-affordance visual language as [ReelTypeToggle], displaying the
 * raw coordinates (this sub-slice attaches no name/address — see
 * [FeedComposerSheet]'s class doc comment) via the already-tested
 * [me.meeshy.sdk.model.formattedCoordinates].
 */
@Composable
private fun LocationAttachmentChip(
    place: SharedPlace,
    onRemove: () -> Unit,
) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        modifier = Modifier
            .clip(RoundedCornerShape(MeeshyRadius.pill))
            .background(MeeshyTheme.tokens.inputBackground)
            .border(1.dp, MeeshyTheme.tokens.inputBorder, RoundedCornerShape(MeeshyRadius.pill))
            .padding(horizontal = MeeshySpacing.sm, vertical = MeeshySpacing.xs),
    ) {
        Icon(
            imageVector = Icons.Filled.LocationOn,
            contentDescription = null,
            tint = MeeshyPalette.Indigo500,
            modifier = Modifier.size(16.dp),
        )
        Text(
            text = place.formattedCoordinates(),
            style = MaterialTheme.typography.labelMedium,
            color = MeeshyTheme.tokens.textSecondary,
        )
        IconButton(
            onClick = onRemove,
            modifier = Modifier.size(20.dp),
        ) {
            Icon(
                imageVector = Icons.Filled.Close,
                contentDescription = stringResource(R.string.feed_composer_remove_location),
                tint = MeeshyTheme.tokens.textMuted,
                modifier = Modifier.size(12.dp),
            )
        }
    }
}

/**
 * The attach-media/take-photo/take-video/attach-file/record-voice/add-location
 * affordances plus the picked-attachment strip — always shows the gallery, camera,
 * video-capture, file, mic and location tiles first (media tiles disabled once
 * [canAddMore] is false or while [isUploading]; the location tile disabled only
 * while [isCapturingLocation], independent of the media cap/upload state), then
 * each attached [media] item with a remove overlay, then an in-flight spinner tile
 * while a pick is uploading. The caller only renders this Composable at all while
 * no recording is in progress (see [FeedComposerSheet] — [VoiceRecordingPill] takes
 * its place during an active take), so [onRecordVoice] only ever needs to start
 * one, never stop/cancel it. Each attached item renders either its real thumbnail
 * ([UploadedMedia.hasThumbnailPreview]) or a generic file-icon tile — the only
 * rendering decision made here, and it delegates to that already-tested pure
 * extension rather than re-sniffing the MIME type. Otherwise pure Compose glue:
 * every id/list decision it renders came from the already pure/tested
 * [FeedComposerDraft]/upload result upstream.
 */
@Composable
private fun MediaAttachmentsRow(
    media: List<UploadedMedia>,
    isUploading: Boolean,
    canAddMore: Boolean,
    isCapturingLocation: Boolean,
    onAdd: () -> Unit,
    onCamera: () -> Unit,
    onVideoCapture: () -> Unit,
    onAttachFile: () -> Unit,
    onRecordVoice: () -> Unit,
    onAddLocation: () -> Unit,
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

        IconButton(
            onClick = onAttachFile,
            enabled = attachEnabled,
            modifier = Modifier
                .size(56.dp)
                .clip(RoundedCornerShape(MeeshyRadius.md))
                .background(MeeshyTheme.tokens.inputBackground)
                .border(1.dp, MeeshyTheme.tokens.inputBorder, RoundedCornerShape(MeeshyRadius.md)),
        ) {
            Icon(
                imageVector = Icons.Filled.AttachFile,
                contentDescription = stringResource(R.string.feed_composer_attach_file),
                tint = if (attachEnabled) MeeshyPalette.Indigo500 else MeeshyTheme.tokens.textMuted,
            )
        }

        IconButton(
            onClick = onRecordVoice,
            enabled = attachEnabled,
            modifier = Modifier
                .size(56.dp)
                .clip(RoundedCornerShape(MeeshyRadius.md))
                .background(MeeshyTheme.tokens.inputBackground)
                .border(1.dp, MeeshyTheme.tokens.inputBorder, RoundedCornerShape(MeeshyRadius.md)),
        ) {
            Icon(
                imageVector = Icons.Filled.Mic,
                contentDescription = stringResource(R.string.feed_composer_record_voice),
                tint = if (attachEnabled) MeeshyPalette.Indigo500 else MeeshyTheme.tokens.textMuted,
            )
        }

        // Independent of attachEnabled: the location tile is not subject to MAX_MEDIA/upload —
        // only guarded against a concurrent capture in flight.
        val locationTileEnabled = !isCapturingLocation
        IconButton(
            onClick = onAddLocation,
            enabled = locationTileEnabled,
            modifier = Modifier
                .size(56.dp)
                .clip(RoundedCornerShape(MeeshyRadius.md))
                .background(MeeshyTheme.tokens.inputBackground)
                .border(1.dp, MeeshyTheme.tokens.inputBorder, RoundedCornerShape(MeeshyRadius.md)),
        ) {
            if (isCapturingLocation) {
                CircularProgressIndicator(strokeWidth = 2.dp, modifier = Modifier.size(20.dp))
            } else {
                Icon(
                    imageVector = Icons.Filled.LocationOn,
                    contentDescription = stringResource(R.string.feed_composer_add_location),
                    tint = MeeshyPalette.Indigo500,
                )
            }
        }

        media.forEach { item ->
            Box(modifier = Modifier.size(56.dp)) {
                if (item.hasThumbnailPreview) {
                    AsyncImage(
                        model = item.thumbnailUrl ?: item.url,
                        contentDescription = null,
                        contentScale = ContentScale.Crop,
                        modifier = Modifier
                            .size(56.dp)
                            .clip(RoundedCornerShape(MeeshyRadius.md)),
                    )
                } else {
                    Box(
                        modifier = Modifier
                            .size(56.dp)
                            .clip(RoundedCornerShape(MeeshyRadius.md))
                            .background(MeeshyTheme.tokens.inputBackground)
                            .border(1.dp, MeeshyTheme.tokens.inputBorder, RoundedCornerShape(MeeshyRadius.md)),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.InsertDriveFile,
                            contentDescription = null,
                            tint = MeeshyPalette.Indigo500,
                            modifier = Modifier.size(24.dp),
                        )
                    }
                }
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
