package me.meeshy.app.feed

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import me.meeshy.feature.feed.R
import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

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
internal fun MediaAttachmentsRow(
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
        AttachTile(MeeshyIcons.PhotoFilled, stringResource(R.string.feed_composer_attach_media), attachEnabled, onAdd)
        AttachTile(MeeshyIcons.Camera, stringResource(R.string.feed_composer_take_photo), attachEnabled, onCamera)
        AttachTile(MeeshyIcons.Video, stringResource(R.string.feed_composer_take_video), attachEnabled, onVideoCapture)
        AttachTile(MeeshyIcons.AttachFile, stringResource(R.string.feed_composer_attach_file), attachEnabled, onAttachFile)
        AttachTile(MeeshyIcons.Mic, stringResource(R.string.feed_composer_record_voice), attachEnabled, onRecordVoice)

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
                    imageVector = MeeshyIcons.LocationFilled,
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
                            imageVector = MeeshyIcons.Document,
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
                        imageVector = MeeshyIcons.Close,
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

private val TileShape = RoundedCornerShape(MeeshyRadius.md)

@Composable
private fun AttachTile(icon: ImageVector, label: String, enabled: Boolean, onClick: () -> Unit) {
    IconButton(
        onClick = onClick,
        enabled = enabled,
        modifier = Modifier
            .size(56.dp)
            .clip(TileShape)
            .background(MeeshyTheme.tokens.inputBackground)
            .border(1.dp, MeeshyTheme.tokens.inputBorder, TileShape),
    ) {
        Icon(imageVector = icon, contentDescription = label, tint = if (enabled) MeeshyPalette.Indigo500 else MeeshyTheme.tokens.textMuted)
    }
}

/**
 * One accessibility-description field per attached [media] item (#6739) —
 * the Android port of web's `MediaAccessibilityFields`. Pure Compose glue:
 * [altById]/[onAltChange] mirror [FeedComposerDraft.mediaAlt]/[FeedComposerDraft.
 * withAlt] exactly, and the 1-based index in the label (never the item's own
 * [UploadedMedia.id], which carries no human-readable filename on Android
 * unlike web's `originalName`) is the only per-row decision made here.
 */
@Composable
internal fun MediaAltTextFields(media: List<UploadedMedia>, altById: Map<String, String>, onAltChange: (String, String) -> Unit) {
    if (media.isEmpty()) return
    Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
        media.forEachIndexed { index, item ->
            OutlinedTextField(
                value = altById[item.id] ?: "",
                onValueChange = { value -> onAltChange(item.id, value.take(MEDIA_ALT_MAX_LENGTH)) },
                modifier = Modifier.fillMaxWidth(),
                label = { Text(stringResource(R.string.feed_composer_media_alt_label, index + 1)) },
                placeholder = { Text(stringResource(R.string.feed_composer_media_alt_placeholder)) },
                singleLine = true,
            )
        }
    }
}

/** Gateway cap on `CreatePostRequest.mediaAlt` values (`CreatePostSchema.mediaAlt`, #6739) — same bound web enforces client-side. */
internal const val MEDIA_ALT_MAX_LENGTH = 1000
