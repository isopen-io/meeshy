package me.meeshy.app.chat

import me.meeshy.sdk.composer.ComposerAffordances

/**
 * The kinds of entry the composer's attachment ladder ("+") can offer, in the
 * fixed order iOS lists them (`UniversalComposerBar+Attachments.carouselTiles`).
 */
enum class AttachmentTileKind { Photo, Camera, File, Location, Voice, Emoji }

/**
 * One ladder entry — its [kind] and the deterministic gradient [colorHex] iOS
 * paints it with. The Composable maps [kind] onto an icon + label + tap handler;
 * keeping the colour here locks colour parity with iOS as a pure, testable fact.
 */
data class AttachmentTile(
    val kind: AttachmentTileKind,
    val colorHex: String,
)

/**
 * Pure SSOT deciding *which* attachment-ladder tiles a composer offers and in
 * *what order* — a faithful port of iOS `UniversalComposerBar+Attachments`'s
 * `carouselTiles`, folded out of the SwiftUI `View` so every gate is JVM-testable
 * (iOS recomputes the list inside the view, untestable without a UI host).
 *
 * Two gate families, mirroring iOS:
 *  - **Permission** (from [ComposerAffordances]): a guest denied a capability is
 *    never shown its tile. iOS never consults permissions in the composer; Android
 *    gates at the source of truth (same SOTA stance as [ComposerAttachmentPolicy]).
 *    Photo and Camera both ride the *capture* capability (`canSendImages` OR
 *    `canSendVideos`) — the library and the lens both yield an image or a video.
 *  - **Host capability / product policy** (the `show*` flags + [hasRecentMediaStrip]):
 *    iOS gates photo/camera/file/location/voice/emoji on the host wiring a handler
 *    (`onCamera != nil`, `showLocation`, `resolvedShowVoice`, …). Android expresses
 *    "this screen can actually handle this action yet" through the defaulted flags,
 *    so a tile is never a dead end.
 *
 * The dedicated Photo tile is suppressed when a recent-media strip is present
 * (the strip already exposes library picking) — iOS's
 * `onPhotoLibrary != nil && onRecentMediaSelected == nil` branch, kept even though
 * Android has no strip yet so parity is preserved the day one lands.
 */
object ComposerAttachmentLadder {
    fun tiles(
        affordances: ComposerAffordances,
        hasRecentMediaStrip: Boolean = false,
        showCamera: Boolean = true,
        showLocation: Boolean = true,
        showVoice: Boolean = true,
        showEmoji: Boolean = true,
    ): List<AttachmentTile> {
        val canCapture = affordances.canSendImages || affordances.canSendVideos
        return listOfNotNull(
            AttachmentTile(AttachmentTileKind.Photo, COLOR_PHOTO)
                .takeIf { canCapture && !hasRecentMediaStrip },
            AttachmentTile(AttachmentTileKind.Camera, COLOR_CAMERA)
                .takeIf { canCapture && showCamera },
            AttachmentTile(AttachmentTileKind.File, COLOR_FILE)
                .takeIf { affordances.canSendFiles },
            AttachmentTile(AttachmentTileKind.Location, COLOR_LOCATION)
                .takeIf { affordances.canSendLocations && showLocation },
            AttachmentTile(AttachmentTileKind.Voice, COLOR_VOICE)
                .takeIf { affordances.canSendAudios && showVoice },
            AttachmentTile(AttachmentTileKind.Emoji, COLOR_EMOJI)
                .takeIf { affordances.canSendText && showEmoji },
        )
    }

    private const val COLOR_PHOTO = "9B59B6"
    private const val COLOR_CAMERA = "F8B500"
    private const val COLOR_FILE = "45B7D1"
    private const val COLOR_LOCATION = "2ECC71"
    private const val COLOR_VOICE = "E74C3C"
    private const val COLOR_EMOJI = "FF9F43"
}
