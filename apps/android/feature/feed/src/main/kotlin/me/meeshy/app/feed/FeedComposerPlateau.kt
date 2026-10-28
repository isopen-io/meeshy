package me.meeshy.app.feed

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import me.meeshy.feature.feed.R
import me.meeshy.sdk.model.ComposerLanguage
import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.sdk.model.auth.LanguageStepSelection
import me.meeshy.sdk.model.composer.ComposerFormat
import me.meeshy.sdk.model.composer.ComposerRailDoor
import me.meeshy.sdk.model.composer.ComposerRailPlan
import me.meeshy.sdk.model.composer.PublicationControl
import me.meeshy.sdk.model.waveform.VoiceRecordingSession
import me.meeshy.ui.component.MeeshyPrimaryButton
import me.meeshy.ui.component.composer.ComposerPlateau
import me.meeshy.ui.component.composer.ComposerRailButton
import me.meeshy.ui.component.recording.VoiceRecordingPill
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing

/** What the post plateau can do, handed over as one value so the composable stays readable. */
internal class PostPlateauActions(
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
)

/** The doors the post composer actually serves; the plan decides on which side each one stands. */
private val ServedDoors = setOf(ComposerRailDoor.MEDIA, ComposerRailDoor.SOUND, ComposerRailDoor.PLACE)

/**
 * The post / reel composer ON the plateau (iOS `MeeshyComposerHost` surfaces): what is PLACED (media, voice) in the left
 * corridor, what structures the PUBLICATION (location, language, audience) in the right one, the body and its
 * attachments on the card between them — nothing laid over the card. Publish stands in the socle.
 */
@Composable
internal fun FeedComposerPlateau(
    draft: FeedComposerDraft,
    attachedMedia: List<UploadedMedia>,
    isUploading: Boolean,
    isCapturingLocation: Boolean,
    voice: VoiceRecordingSession,
    format: ComposerFormat,
    formatSlot: (@Composable () -> Unit)?,
    showReelToggle: Boolean,
    actions: PostPlateauActions,
) {
    val plan = remember(format) { ComposerRailPlan.of(format, ServedDoors) }
    val mediaEnabled = !draft.isMediaFull && !isUploading && !voice.isRecording
    ComposerPlateau(
        onDismiss = actions.onClose,
        topCorridor = {
            ComposerRailButton(MeeshyIcons.Close, stringResource(R.string.feed_composer_cancel), actions.onClose)
            formatSlot?.invoke()
            Spacer(Modifier.weight(1f))
        },
        leadingRail = plan.leading.takeIf { it.isNotEmpty() }?.let { doors ->
            {
                doors.forEach { door ->
                    when (door) {
                        ComposerRailDoor.MEDIA -> MediaDoor(mediaEnabled, actions)
                        ComposerRailDoor.SOUND -> ComposerRailButton(
                            MeeshyIcons.Mic, stringResource(R.string.feed_composer_record_voice), actions.onVoice,
                            enabled = mediaEnabled, active = voice.isRecording,
                        )
                        else -> Unit
                    }
                }
            }
        },
        trailingRail = {
            ComposerRailPlan.publicationControls(format).forEach { control ->
                when (control) {
                    PublicationControl.LANGUAGE -> LanguageDoor(draft.language, actions.onLanguage)
                    PublicationControl.AUDIENCE -> AudienceDoor(draft.visibility, actions.onVisibility)
                }
            }
            plan.trailing.forEach { door ->
                if (door == ComposerRailDoor.PLACE) {
                    ComposerRailButton(
                        MeeshyIcons.LocationFilled, stringResource(R.string.feed_composer_add_location), actions.onLocation,
                        enabled = !isCapturingLocation, active = draft.location != null,
                    )
                }
            }
        },
        socle = {
            MeeshyPrimaryButton(
                text = stringResource(R.string.feed_composer_publish),
                onClick = actions.onPublish,
                enabled = draft.canPublish && !isUploading && !voice.isRecording,
                modifier = Modifier.fillMaxWidth(),
            )
        },
    ) {
        PostCard(draft, attachedMedia, isUploading, isCapturingLocation, voice, showReelToggle, mediaEnabled, actions)
    }
}

@Composable
private fun PostCard(
    draft: FeedComposerDraft,
    attachedMedia: List<UploadedMedia>,
    isUploading: Boolean,
    isCapturingLocation: Boolean,
    voice: VoiceRecordingSession,
    showReelToggle: Boolean,
    canAddMore: Boolean,
    actions: PostPlateauActions,
) {
    Column(
        modifier = Modifier
            .verticalScroll(rememberScrollState())
            .padding(MeeshySpacing.lg),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.lg),
    ) {
        OutlinedTextField(
            value = draft.text,
            onValueChange = actions.onText,
            modifier = Modifier.fillMaxWidth(),
            placeholder = { Text(stringResource(R.string.feed_composer_placeholder)) },
            minLines = 6,
        )
        draft.location?.let { place -> LocationAttachmentChip(place = place, onRemove = actions.onRemoveLocation) }
        if (showReelToggle) ReelTypeToggle(forcePlainPost = draft.forcePlainPost, onToggle = actions.onToggleReel)
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
                canAddMore = canAddMore,
                isCapturingLocation = isCapturingLocation,
                onAdd = actions.onGallery,
                onCamera = actions.onCamera,
                onVideoCapture = actions.onVideo,
                onAttachFile = actions.onFile,
                onRecordVoice = actions.onVoice,
                onAddLocation = actions.onLocation,
                onRemove = actions.onRemoveMedia,
                showAddTiles = false,
            )
            MediaAltTextFields(media = attachedMedia, altById = draft.mediaAlt, onAltChange = actions.onAlt)
        }
    }
}

/** The media door: one glyph for every source (gallery, photo, video, file) — the author picks a MEDIA, not a path. */
@Composable
private fun MediaDoor(enabled: Boolean, actions: PostPlateauActions) {
    var open by remember { mutableStateOf(false) }
    Box {
        ComposerRailButton(MeeshyIcons.PhotoFilled, stringResource(R.string.feed_composer_attach_media), { open = true }, enabled = enabled, active = open)
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            SourceItem(R.string.feed_composer_attach_media) { open = false; actions.onGallery() }
            SourceItem(R.string.feed_composer_take_photo) { open = false; actions.onCamera() }
            SourceItem(R.string.feed_composer_take_video) { open = false; actions.onVideo() }
            SourceItem(R.string.feed_composer_attach_file) { open = false; actions.onFile() }
        }
    }
}

@Composable
private fun SourceItem(label: Int, onPick: () -> Unit) {
    DropdownMenuItem(text = { Text(stringResource(label), style = MaterialTheme.typography.bodyLarge) }, onClick = onPick)
}

@Composable
private fun LanguageDoor(code: String, onClick: () -> Unit) {
    ComposerRailButton(
        label = stringResource(R.string.feed_composer_language_button, LanguageStepSelection.selectedLanguageName(code)),
        onClick = onClick,
    ) { Text(text = ComposerLanguage.flag(code), style = MaterialTheme.typography.titleMedium) }
}

@Composable
private fun AudienceDoor(selected: FeedPostVisibility, onSelect: (FeedPostVisibility) -> Unit) {
    var open by remember { mutableStateOf(false) }
    Box {
        ComposerRailButton(audienceGlyph(selected), feedVisibilityLabel(selected), { open = true }, active = open)
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            FeedPostVisibility.entries.forEach { visibility ->
                DropdownMenuItem(
                    text = { Text(feedVisibilityLabel(visibility)) },
                    onClick = { open = false; onSelect(visibility) },
                    leadingIcon = { Icon(audienceGlyph(visibility), contentDescription = null) },
                )
            }
        }
    }
}

private fun audienceGlyph(visibility: FeedPostVisibility) = when (visibility) {
    FeedPostVisibility.PUBLIC -> MeeshyIcons.Public
    FeedPostVisibility.FRIENDS -> MeeshyIcons.Group
    FeedPostVisibility.PRIVATE -> MeeshyIcons.Lock
}
