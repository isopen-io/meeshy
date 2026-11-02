package me.meeshy.app.chat

import me.meeshy.sdk.composer.ComposerAffordances
import me.meeshy.sdk.model.composer.ComposerCapability
import me.meeshy.sdk.model.composer.ComposerConfiguration

/**
 * The kinds of entry the composer's attachment ladder ("+") can offer, in the
 * fixed order iOS lists them (`UniversalComposerBar+Attachments.carouselTiles`).
 */
enum class AttachmentTileKind { Photo, Camera, File, Contact, Location, Voice, Emoji }

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
 * The Contact tile (#13703) sends a `.vcf` through the file path, so it rides
 * `canSendFiles` — an end-to-end conversation, whose affordances are closed, never
 * offers it, and no card leaves in clear. [showContact] carries iOS's
 * `offersContactsAndPlaces` gate (a link guest whose kinds are restricted).
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
        showContact: Boolean = true,
        showLocation: Boolean = true,
        showVoice: Boolean = true,
        showEmoji: Boolean = true,
        configuration: ComposerConfiguration = ComposerConfiguration.CONVERSATION,
    ): List<AttachmentTile> {
        val canCapture = affordances.canSendImages || affordances.canSendVideos
        val offered = TILE_CAPABILITY.filterValues(configuration::offers).keys
        return listOfNotNull(
            AttachmentTile(AttachmentTileKind.Photo, COLOR_PHOTO)
                .takeIf { canCapture && !hasRecentMediaStrip },
            AttachmentTile(AttachmentTileKind.Camera, COLOR_CAMERA)
                .takeIf { canCapture && showCamera },
            AttachmentTile(AttachmentTileKind.File, COLOR_FILE)
                .takeIf { affordances.canSendFiles },
            AttachmentTile(AttachmentTileKind.Contact, COLOR_CONTACT)
                .takeIf { affordances.canSendFiles && showContact },
            AttachmentTile(AttachmentTileKind.Location, COLOR_LOCATION)
                .takeIf { affordances.canSendLocations && showLocation },
            AttachmentTile(AttachmentTileKind.Voice, COLOR_VOICE)
                .takeIf { affordances.canSendAudios && showVoice },
            AttachmentTile(AttachmentTileKind.Emoji, COLOR_EMOJI)
                .takeIf { affordances.canSendText && showEmoji },
        ).filter { it.kind in offered }
    }

    /** La porte du réglage (#14265) qui ouvre chaque tuile : une tuile dont le réglage ferme la porte ne s'affiche pas. */
    private val TILE_CAPABILITY: Map<AttachmentTileKind, ComposerCapability> = mapOf(
        AttachmentTileKind.Photo to ComposerCapability.PHOTO_LIBRARY,
        AttachmentTileKind.Camera to ComposerCapability.CAMERA,
        AttachmentTileKind.File to ComposerCapability.FILE,
        AttachmentTileKind.Contact to ComposerCapability.CONTACT,
        AttachmentTileKind.Location to ComposerCapability.LOCATION,
        AttachmentTileKind.Voice to ComposerCapability.VOICE,
        AttachmentTileKind.Emoji to ComposerCapability.EMOJI,
    )

    private const val COLOR_PHOTO = "9B59B6"
    private const val COLOR_CAMERA = "F8B500"
    private const val COLOR_FILE = "45B7D1"
    private const val COLOR_CONTACT = "5B8DEF"
    private const val COLOR_LOCATION = "2ECC71"
    private const val COLOR_VOICE = "E74C3C"
    private const val COLOR_EMOJI = "FF9F43"
}
