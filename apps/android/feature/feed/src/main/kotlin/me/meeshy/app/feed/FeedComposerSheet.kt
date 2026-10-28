package me.meeshy.app.feed

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.res.stringResource
import me.meeshy.feature.feed.R
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.model.PostType
import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.sdk.model.composer.ComposerFormat
import me.meeshy.sdk.model.waveform.VoiceRecordingSession
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.ui.component.composer.LocalOnComposerPlateau
import me.meeshy.ui.component.recording.VoiceRecordingPill
import me.meeshy.ui.theme.MeeshyPalette
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
 * Camera-photo capture (`onCamera`, [MeeshyIcons.Camera] tile) mirrors iOS's
 * `camera.fill` button — one system `ACTION_IMAGE_CAPTURE` activity
 * ([ActivityResultContracts.TakePicture]) writing into a fresh [CameraCaptureFile]-named
 * destination the composer creates via the app's [FileProvider] authority, then dispatched
 * through the exact same [rememberFeedComposerIntake] pipeline as a gallery pick — zero new upload/error
 * logic. Camera-video capture (`onVideoCapture`, [MeeshyIcons.Video] tile) is the same
 * pattern one level over: `ACTION_VIDEO_CAPTURE` ([ActivityResultContracts.CaptureVideo]) writing
 * into a [CameraCaptureFile.nextVideo]-named destination, dispatched through the identical
 * [rememberFeedComposerIntake] pipeline. **Deliberate, documented scope cut vs. iOS**: two system-delegated
 * tiles, no in-composer photo/video toggle ([CameraView]'s combined `.photo`/`.video` case) — iOS
 * opens a single custom AVFoundation capture screen with an in-app mode switch; Android delegates
 * to the system camera app's own `ACTION_IMAGE_CAPTURE`/`ACTION_VIDEO_CAPTURE` intents. Because the
 * manifest declares `CAMERA`, the system refuses those intents unless the permission is granted, so
 * each capture goes through [launchWithCameraAccess] behind [rememberPermissionFlow] first.
 *
 * Generic file attachment (`onAttachFile`, [MeeshyIcons.AttachFile] tile) mirrors iOS's
 * `doc.fill` button: [ActivityResultContracts.OpenMultipleDocuments] (any MIME type) lets the
 * author pick ANY document from the system picker, dispatched through the **exact same** [rememberFeedComposerIntake]
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
 * pick-language → preview flow): a take recorded here dispatches through [rememberFeedComposerIntake] as one
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
@Composable
fun FeedComposerSheet(
    onPublish: (FeedPostPublishRequest, FeedComposerDraft) -> Unit,
    onDismiss: () -> Unit,
    onUploadMedia: suspend (List<MediaUploadItem>) -> NetworkResult<List<UploadedMedia>>,
    onMediaError: (String) -> Unit,
    initialDraft: FeedComposerDraft = FeedComposerDraft(),
    onDraftChange: (FeedComposerDraft) -> Unit = {},
    onQueueMedia: (suspend (MediaUploadItem) -> String)? = null,
    onRemoveMedia: (String) -> Unit = {},
    formatSlot: (@Composable () -> Unit)? = null,
    governingType: PostType? = null,
    raiseKeyboard: Boolean = false,
    onKeyboardRaised: () -> Unit = {},
) {
    val state = remember { FeedComposerState(initialDraft) }
    // The host's format choice governs the type; the sheet's own reel toggle then has nothing to decide.
    LaunchedEffect(governingType) {
        governingType?.let { state.draft = state.draft.withForcePlainPost(it == PostType.POST) }
    }
    // Autosave (#13417): every change reaches the durable draft, so a closed sheet or a killed
    // app reopens on what the author wrote.
    LaunchedEffect(state.draft) { onDraftChange(state.draft) }
    var showLanguagePicker by remember { mutableStateOf(false) }
    val intake = rememberFeedComposerIntake(state, onUploadMedia, onMediaError, onQueueMedia)
    val actions = rememberPostComposerActions(state, intake, onPublish, onDismiss, onRemoveMedia) { showLanguagePicker = true }
    val draft = state.draft
    val voice = intake.voice.session

    if (LocalOnComposerPlateau.current) {
        FeedComposerPlateau(
            draft = draft,
            attachedMedia = state.attachedMedia,
            isUploading = state.isUploading,
            isCapturingLocation = intake.location.isCapturing,
            voice = voice,
            format = if (governingType == PostType.REEL) ComposerFormat.REEL else ComposerFormat.POST,
            formatSlot = formatSlot,
            showReelToggle = draft.qualifiesAsReel && governingType == null,
            actions = actions,
            raiseKeyboard = raiseKeyboard,
            onKeyboardRaised = onKeyboardRaised,
        )
    } else {
        FeedComposerModal(
            draft = draft,
            attachedMedia = state.attachedMedia,
            isUploading = state.isUploading,
            isCapturingLocation = intake.location.isCapturing,
            voice = voice,
            formatSlot = formatSlot,
            showReelToggle = draft.qualifiesAsReel && governingType == null,
            actions = actions,
            raiseKeyboard = raiseKeyboard,
            onKeyboardRaised = onKeyboardRaised,
        )
    }

    if (showLanguagePicker) {
        ComposerLanguagePickerDialog(
            currentCode = draft.language,
            onSelect = { code ->
                state.draft = state.draft.withLanguage(code)
                showLanguagePicker = false
            },
            onDismiss = { showLanguagePicker = false },
        )
    }
}

/** What the post composer can do, handed over as one value — the plateau and the modal sheet share it. */
internal class PostComposerActions(
    val onClose: () -> Unit,
    val onPublish: () -> Unit,
    val onGallery: () -> Unit,
    val onCamera: () -> Unit,
    val onVideo: () -> Unit,
    val onFile: () -> Unit,
    val onVoice: () -> Unit,
    val onCancelVoice: () -> Unit,
    val onFinishVoice: () -> Unit,
    val onLocation: () -> Unit,
    val onLanguage: () -> Unit,
    val onVisibility: (FeedPostVisibility) -> Unit,
    val onText: (String) -> Unit,
    val onToggleReel: () -> Unit,
    val onRemoveMedia: (String) -> Unit,
    val onAlt: (String, String) -> Unit,
    val onRemoveLocation: () -> Unit,
    val onBackground: (String) -> Unit,
    val onOverflow: (PostOverflowEntry) -> Unit,
)

/**
 * Built ONCE per composer: every action reads the draft and the callbacks at call time, so typing never hands the
 * plateau a new value — the corridors, the tool row and the socle skip while only the card follows the keystrokes.
 */
@Composable
private fun rememberPostComposerActions(
    state: FeedComposerState,
    intake: FeedComposerIntake,
    onPublish: (FeedPostPublishRequest, FeedComposerDraft) -> Unit,
    onDismiss: () -> Unit,
    onRemoveMedia: (String) -> Unit,
    onLanguage: () -> Unit,
): PostComposerActions {
    val publish by rememberUpdatedState(onPublish)
    val dismiss by rememberUpdatedState(onDismiss)
    val removeMedia by rememberUpdatedState(onRemoveMedia)
    val language by rememberUpdatedState(onLanguage)
    return remember(state, intake) {
        PostComposerActions(
            onClose = { dismiss() },
            onPublish = { state.draft.let { draft -> draft.publishRequest()?.let { request -> publish(request, draft) } } },
            onGallery = intake.pickMedia,
            onCamera = intake.capturePhoto,
            onVideo = intake.captureVideo,
            onFile = intake.pickFiles,
            onVoice = intake.requestVoice,
            onCancelVoice = intake.voice::cancel,
            onFinishVoice = intake.finishVoice,
            onLocation = intake.location::request,
            onLanguage = { language() },
            onVisibility = { visibility -> state.draft = state.draft.withVisibility(visibility) },
            onText = { value -> state.draft = state.draft.withText(value) },
            onToggleReel = { state.draft = state.draft.withForcePlainPost(!state.draft.forcePlainPost) },
            onRemoveMedia = { id ->
                state.detach(id)
                removeMedia(id)
            },
            onAlt = { mediaId, text -> state.draft = state.draft.withAlt(mediaId, text) },
            onRemoveLocation = { state.draft = state.draft.withoutLocation() },
            onBackground = { hex -> state.draft = state.draft.withBackground(hex) },
            onOverflow = { entry ->
                if (entry == PostOverflowEntry.CLEAR_ALL) state.attachedMedia.forEach { removeMedia(it.id) }
                state.apply(entry)
            },
        )
    }
}

/** The feed shortcut's presentation: a modal sheet (header, language, audience, body, attachments with their tiles). */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun FeedComposerModal(
    draft: FeedComposerDraft,
    attachedMedia: List<UploadedMedia>,
    isUploading: Boolean,
    isCapturingLocation: Boolean,
    voice: VoiceRecordingSession,
    formatSlot: (@Composable () -> Unit)?,
    showReelToggle: Boolean,
    actions: PostComposerActions,
    raiseKeyboard: Boolean,
    onKeyboardRaised: () -> Unit,
) {
    ModalBottomSheet(onDismissRequest = actions.onClose, containerColor = MeeshyTheme.tokens.backgroundPrimary) {
        // Inside the sheet: the focus and the keyboard controller are those of the sheet's own window.
        val contentFocus = rememberContentFocus(raiseKeyboard, onKeyboardRaised)
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = MeeshySpacing.lg)
                .padding(bottom = MeeshySpacing.xl),
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.lg),
        ) {
            formatSlot?.invoke()
            FeedComposerHeader(
                canPublish = draft.canPublish && !isUploading && !voice.isRecording,
                onClose = actions.onClose,
                onPublish = actions.onPublish,
            )
            ComposerLanguagePill(code = draft.language, onClick = actions.onLanguage)
            FeedVisibilityRow(selected = draft.visibility, onSelect = actions.onVisibility)
            if (showReelToggle) ReelTypeToggle(forcePlainPost = draft.forcePlainPost, onToggle = actions.onToggleReel)
            // A restored draft may carry a scene: the sheet shows what will be published (no palette here, as iOS's sheet).
            if (draft.showsScene) PostSceneBlock(background = draft.background, paletteOpen = false, onPick = actions.onBackground)
            OutlinedTextField(
                value = draft.text,
                onValueChange = actions.onText,
                modifier = Modifier.fillMaxWidth().focusRequester(contentFocus),
                placeholder = { Text(stringResource(R.string.feed_composer_placeholder)) },
                minLines = 4,
            )
            draft.location?.let { place -> LocationAttachmentChip(place = place, onRemove = actions.onRemoveLocation) }
            if (voice.isRecording) {
                VoiceRecordingPill(
                    session = voice,
                    accentColor = MeeshyPalette.Indigo500,
                    onCancel = actions.onCancelVoice,
                    onStop = actions.onFinishVoice,
                    onSend = actions.onFinishVoice,
                )
            } else {
                MediaAttachmentsRow(
                    media = attachedMedia,
                    isUploading = isUploading,
                    canAddMore = !draft.isMediaFull,
                    isCapturingLocation = isCapturingLocation,
                    onAdd = actions.onGallery,
                    onCamera = actions.onCamera,
                    onVideoCapture = actions.onVideo,
                    onAttachFile = actions.onFile,
                    onRecordVoice = actions.onVoice,
                    onAddLocation = actions.onLocation,
                    onRemove = actions.onRemoveMedia,
                )
                MediaAltTextFields(media = attachedMedia, altById = draft.mediaAlt, onAltChange = actions.onAlt)
            }
        }
    }
}
