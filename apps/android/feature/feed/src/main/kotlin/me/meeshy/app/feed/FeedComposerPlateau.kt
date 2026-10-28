package me.meeshy.app.feed

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.unit.dp
import androidx.compose.ui.res.stringResource
import me.meeshy.feature.feed.R
import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.sdk.model.composer.ComposerDocumentTool
import me.meeshy.sdk.model.composer.ComposerFormat
import me.meeshy.sdk.model.composer.ComposerRailPlan
import me.meeshy.sdk.model.composer.PublicationControl
import me.meeshy.sdk.model.composer.PublicationControlPlace
import me.meeshy.sdk.model.waveform.VoiceRecordingSession
import me.meeshy.ui.component.MeeshyPrimaryButton
import me.meeshy.ui.component.composer.ComposerPlateau
import me.meeshy.ui.component.composer.ComposerRailButton
import me.meeshy.ui.component.recording.VoiceRecordingPill
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.ComposerPlateauInk
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing

/** The tools the post composer serves on its canonical row; the model keeps the iOS order and drops the rest. */
private val ServedTools = ComposerDocumentTool.servedRow(
    setOf(
        ComposerDocumentTool.PHOTO, ComposerDocumentTool.CAMERA, ComposerDocumentTool.VIDEO,
        ComposerDocumentTool.DOCUMENT, ComposerDocumentTool.PLACE, ComposerDocumentTool.MICROPHONE,
    ),
)

/**
 * The post / reel composer ON the plateau — a post without a scene is the iOS DOCUMENT surface
 * (`ComposerDocumentSurface` under `MeeshyComposerHost`): the cross and the format in the top corridor, the body on the
 * card with its language at the FOOT of the text it qualifies, the attachments under it, the canonical row of tools
 * (photo, camera, video, file, place, microphone) under the card, and the socle — audience, then Publish. No column:
 * nothing is PLACED on a scene that does not exist, and nothing is laid over the card.
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
    actions: PostComposerActions,
) {
    val places = remember(format) { ComposerRailPlan.publicationControls(format) }
    val mediaEnabled = !draft.isMediaFull && !isUploading && !voice.isRecording
    ComposerPlateau(
        onDismiss = actions.onClose,
        topCorridor = {
            ComposerRailButton(MeeshyIcons.Close, stringResource(R.string.feed_composer_cancel), actions.onClose)
            formatSlot?.invoke()
            Spacer(Modifier.weight(1f))
        },
        canonicalRow = {
            ServedTools.forEach { tool ->
                DocumentToolDoor(tool, enabled = if (tool.consumesMediaSlot) mediaEnabled else !isCapturingLocation, draft, voice, actions)
            }
        },
        socle = {
            if (places[PublicationControl.AUDIENCE] == PublicationControlPlace.SOCLE) {
                PlateauAudienceChip(draft.visibility, actions.onVisibility)
            }
            MeeshyPrimaryButton(
                text = stringResource(R.string.feed_composer_publish),
                onClick = actions.onPublish,
                enabled = draft.canPublish && !isUploading && !voice.isRecording,
                modifier = Modifier.weight(1f),
            )
        },
    ) {
        PostCard(
            draft = draft,
            attachedMedia = attachedMedia,
            isUploading = isUploading,
            isCapturingLocation = isCapturingLocation,
            voice = voice,
            showReelToggle = showReelToggle,
            showsLanguage = places[PublicationControl.LANGUAGE] == PublicationControlPlace.CONTENT_FOOT,
            canAddMore = mediaEnabled,
            actions = actions,
        )
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
    showsLanguage: Boolean,
    canAddMore: Boolean,
    actions: PostComposerActions,
) {
    Column(
        modifier = Modifier
            .verticalScroll(rememberScrollState())
            .padding(MeeshySpacing.lg),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        OutlinedTextField(
            value = draft.text,
            onValueChange = actions.onText,
            modifier = Modifier.fillMaxWidth(),
            placeholder = { Text(stringResource(R.string.feed_composer_placeholder)) },
            minLines = 6,
        )
        if (showsLanguage) {
            Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.CenterEnd) {
                ComposerLanguagePill(code = draft.language, onClick = actions.onLanguage)
            }
        }
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

/** One tool of the canonical row, in the plateau's dark inks; the place and the microphone light up while set. */
@Composable
private fun DocumentToolDoor(
    tool: ComposerDocumentTool,
    enabled: Boolean,
    draft: FeedComposerDraft,
    voice: VoiceRecordingSession,
    actions: PostComposerActions,
) {
    when (tool) {
        ComposerDocumentTool.PHOTO ->
            ComposerRailButton(MeeshyIcons.PhotoFilled, stringResource(R.string.feed_composer_attach_media), actions.onGallery, enabled = enabled)
        ComposerDocumentTool.CAMERA ->
            ComposerRailButton(MeeshyIcons.Camera, stringResource(R.string.feed_composer_take_photo), actions.onCamera, enabled = enabled)
        ComposerDocumentTool.VIDEO ->
            ComposerRailButton(MeeshyIcons.Video, stringResource(R.string.feed_composer_take_video), actions.onVideo, enabled = enabled)
        ComposerDocumentTool.DOCUMENT ->
            ComposerRailButton(MeeshyIcons.AttachFile, stringResource(R.string.feed_composer_attach_file), actions.onFile, enabled = enabled)
        ComposerDocumentTool.PLACE -> ComposerRailButton(
            MeeshyIcons.LocationFilled, stringResource(R.string.feed_composer_add_location), actions.onLocation,
            enabled = enabled, active = draft.location != null,
        )
        ComposerDocumentTool.MICROPHONE -> ComposerRailButton(
            MeeshyIcons.Mic, stringResource(R.string.feed_composer_record_voice), actions.onVoice,
            enabled = enabled || voice.isRecording, active = voice.isRecording,
        )
        ComposerDocumentTool.EMOJI, ComposerDocumentTool.TEXT_SCENE, ComposerDocumentTool.MENTION -> Unit
    }
}

/** The socle's audience (iOS `audienceChip`): it CHOOSES — a capsule that opens the three audiences, in plateau inks. */
@Composable
private fun RowScope.PlateauAudienceChip(selected: FeedPostVisibility, onSelect: (FeedPostVisibility) -> Unit) {
    var open by remember { mutableStateOf(false) }
    val label = feedVisibilityLabel(selected)
    val audience = stringResource(R.string.feed_composer_socle_audience)
    Box {
        Row(
            modifier = Modifier
                .heightIn(min = ComposerPlateauInk.HIT_TARGET_DP.dp)
                .clip(RoundedCornerShape(MeeshyRadius.pill))
                .background(ComposerPlateauInk.primary.copy(alpha = 0.12f))
                .clickable(role = Role.Button) { open = true }
                .clearAndSetSemantics {
                    contentDescription = audience
                    stateDescription = label
                    role = Role.Button
                }
                .padding(horizontal = MeeshySpacing.md),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        ) {
            Icon(audienceGlyph(selected), contentDescription = null, tint = ComposerPlateauInk.primary)
            Text(label, style = MaterialTheme.typography.labelLarge, color = ComposerPlateauInk.primary)
        }
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
