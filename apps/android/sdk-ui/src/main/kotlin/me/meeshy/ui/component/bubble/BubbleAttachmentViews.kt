package me.meeshy.ui.component.bubble

import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.key
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import me.meeshy.sdk.model.AudioTranscriptionReveal
import me.meeshy.ui.theme.MeeshyPalette
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
    accent: Color = MeeshyPalette.Indigo500,
) {
    if (content.isDeleted) return
    if (content.images.isNotEmpty()) {
        BubbleImageGrid(
            images = content.images,
            onImageClick = callbacks.onImageClick,
            onImageLongClick = callbacks.onImageLongClick,
            modifier = Modifier.padding(bottom = MeeshySpacing.xs),
        )
    }
    content.sealedPieceIds.forEach { _ ->
        BubbleSealedPieceRow(onColor = onColor, modifier = Modifier.padding(bottom = MeeshySpacing.xs))
    }
    val videoIds = content.videos.mapTo(HashSet()) { it.attachmentId }
    content.videos.forEach { video ->
        val file = content.files.firstOrNull { it.attachmentId == video.attachmentId } ?: return@forEach
        key(video.attachmentId) {
            val transfers = LocalBubbleFileTransfers.current
            val badge = rememberVideoAutoDownloadBadge(file, remember(file, transfers) { transfers.badgeOf(file) })
            BubbleVideoRow(
                video = video,
                badge = badge,
                accent = accent,
                onClick = callbacks.onFileClick?.takeIf { file.opensOnTap }?.let { { it(file) } },
                modifier = Modifier.padding(bottom = MeeshySpacing.xs),
            )
        }
    }
    BubbleNonVisualSections(content, onColor, callbacks, audioPlayback, videoIds, accent = accent)
}

/**
 * Les pièces qui ne sont ni une image ni une vidéo — fichiers, lieux partagés, notes vocales —, dans leur ordre fixe.
 * Partagée par la bulle et par le bloc non-média de la rangée plate ([videoIds] : les vidéos déjà montrées ailleurs).
 */
@Composable
internal fun BubbleNonVisualSections(
    content: BubbleContent,
    onColor: Color,
    callbacks: BubbleCallbacks,
    audioPlayback: BubbleAudioPlayback?,
    videoIds: Set<String> = content.videos.mapTo(HashSet()) { it.attachmentId },
    includeAudios: Boolean = true,
    accent: Color = MeeshyPalette.Indigo500,
) {
    if (content.isDeleted) return
    val autoReveal = AudioTranscriptionReveal.autoReveals(content.isOutgoing, LocalAutoRevealTranscription.current)
    content.files.filterNot { it.attachmentId in videoIds }.forEach { file ->
        BubbleFileRow(
            file = file,
            onColor = onColor,
            onClick = callbacks.onFileClick?.takeIf { file.opensOnTap }
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
    if (includeAudios) {
        BubbleAudioStack(
            content = content,
            playback = audioPlayback,
            onColor = onColor,
            accent = accent,
            callbacks = callbacks,
            autoRevealTranscription = autoReveal,
            modifier = Modifier.padding(bottom = MeeshySpacing.xs),
        )
    }
}

/**
 * La rangée répond au toucher : jamais scellée ni sans adresse ; une pièce protégée ne s'ouvre que si c'est une VIDÉO,
 * que l'hôte joue dans son lecteur sécurisé (#13822) — un autre fichier protégé ne sort pas de Meeshy (#13492).
 */
internal val BubbleFile.opensOnTap: Boolean
    get() = !isSealed && !url.isNullOrBlank() && (isVideo || !isProtected)

/** True when the bubble carries at least one attachment of a kind the body renders. */
internal val BubbleContent.hasRenderedAttachments: Boolean
    get() = images.isNotEmpty() || files.isNotEmpty() || sealedPieceIds.isNotEmpty() || locations.isNotEmpty() || audios.isNotEmpty()
