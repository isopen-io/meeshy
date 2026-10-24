package me.meeshy.ui.component.bubble

import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import me.meeshy.ui.theme.MeeshySpacing

/**
 * The attachment sections of a standard bubble, in their fixed order: image grid, files, shared
 * locations, then voice notes. Emits sibling rows straight into the caller's column (no wrapping
 * layout), so the bubble body stacks them exactly as before. A deleted message shows none.
 *
 * Each row is only tappable when it can act: a file needs a url, a location its coordinates, an
 * audio a playable url — otherwise its callback is dropped and the row stays inert.
 */
@Composable
internal fun BubbleAttachmentSections(
    content: BubbleContent,
    onColor: Color,
    callbacks: BubbleCallbacks,
    audioPlayback: BubbleAudioPlayback?,
) {
    if (content.isDeleted) return
    if (content.images.isNotEmpty()) {
        BubbleImageGrid(
            images = content.images,
            onImageClick = callbacks.onImageClick,
            modifier = Modifier.padding(bottom = MeeshySpacing.xs),
        )
    }
    content.files.forEach { file ->
        BubbleFileRow(
            file = file,
            onColor = onColor,
            onClick = callbacks.onFileClick?.takeIf { !file.url.isNullOrBlank() }
                ?.let { { it(file) } },
            modifier = Modifier.padding(bottom = MeeshySpacing.xs),
        )
    }
    content.locations.forEach { location ->
        LocationPreview(
            location = location,
            onColor = onColor,
            onClick = callbacks.onLocationClick?.takeIf { location.hasCoordinates }
                ?.let { { it(location) } },
            modifier = Modifier.padding(bottom = MeeshySpacing.xs),
        )
    }
    content.audios.forEach { audio ->
        AudioBubble(
            audio = audio,
            playback = audioPlayback?.takeIf { it.attachmentId == audio.attachmentId },
            onColor = onColor,
            onClick = callbacks.onAudioClick?.takeIf { audio.isPlayable }
                ?.let { { it(audio) } },
            modifier = Modifier.padding(bottom = MeeshySpacing.xs),
        )
    }
}

/** True when the bubble carries at least one attachment of a kind the body renders. */
internal val BubbleContent.hasRenderedAttachments: Boolean
    get() = images.isNotEmpty() || files.isNotEmpty() || locations.isNotEmpty() || audios.isNotEmpty()
