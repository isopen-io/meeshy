package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.composer.ComposerAffordances
import me.meeshy.sdk.composer.ComposerAttachmentPolicy
import org.junit.Test

/**
 * Behaviour of the pure attachment-ladder resolver. Every gate — the two capture
 * capabilities, each per-kind permission, each host-capability `show*` flag, the
 * recent-media suppression — is exercised through the public [ComposerAttachmentLadder.tiles].
 * Colour parity with iOS is locked once, and the concrete posture the chat screen
 * wires today is asserted end to end.
 */
class ComposerAttachmentLadderTest {

    private fun affordances(
        text: Boolean = true,
        images: Boolean = true,
        files: Boolean = true,
        videos: Boolean = true,
        audios: Boolean = true,
        locations: Boolean = true,
        links: Boolean = true,
    ) = ComposerAffordances(
        canSendText = text,
        canSendImages = images,
        canSendFiles = files,
        canSendVideos = videos,
        canSendAudios = audios,
        canSendLocations = locations,
        canSendLinks = links,
    )

    private fun kinds(tiles: List<AttachmentTile>) = tiles.map { it.kind }

    @Test
    fun `registered user with every capability offers all six tiles in iOS order`() {
        val tiles = ComposerAttachmentLadder.tiles(ComposerAttachmentPolicy.affordances(null))

        assertThat(kinds(tiles)).containsExactly(
            AttachmentTileKind.Photo,
            AttachmentTileKind.Camera,
            AttachmentTileKind.File,
            AttachmentTileKind.Location,
            AttachmentTileKind.Voice,
            AttachmentTileKind.Emoji,
        ).inOrder()
    }

    @Test
    fun `a recent-media strip suppresses the dedicated photo tile but keeps camera`() {
        val tiles = ComposerAttachmentLadder.tiles(affordances(), hasRecentMediaStrip = true)

        assertThat(kinds(tiles)).doesNotContain(AttachmentTileKind.Photo)
        assertThat(kinds(tiles)).contains(AttachmentTileKind.Camera)
    }

    @Test
    fun `no capture permission drops both photo and camera`() {
        val tiles = ComposerAttachmentLadder.tiles(affordances(images = false, videos = false))

        assertThat(kinds(tiles)).containsNoneOf(AttachmentTileKind.Photo, AttachmentTileKind.Camera)
    }

    @Test
    fun `video-only capture still yields photo and camera`() {
        val tiles = ComposerAttachmentLadder.tiles(affordances(images = false, videos = true))

        assertThat(kinds(tiles)).containsAtLeast(AttachmentTileKind.Photo, AttachmentTileKind.Camera)
    }

    @Test
    fun `image-only capture still yields photo and camera`() {
        val tiles = ComposerAttachmentLadder.tiles(affordances(images = true, videos = false))

        assertThat(kinds(tiles)).containsAtLeast(AttachmentTileKind.Photo, AttachmentTileKind.Camera)
    }

    @Test
    fun `host without a camera hides only the camera tile, photo stays`() {
        val tiles = ComposerAttachmentLadder.tiles(affordances(), showCamera = false)

        assertThat(kinds(tiles)).doesNotContain(AttachmentTileKind.Camera)
        assertThat(kinds(tiles)).contains(AttachmentTileKind.Photo)
    }

    @Test
    fun `no file permission drops the file tile`() {
        val tiles = ComposerAttachmentLadder.tiles(affordances(files = false))

        assertThat(kinds(tiles)).doesNotContain(AttachmentTileKind.File)
    }

    @Test
    fun `location tile needs both the permission and the host flag`() {
        val permissionOff = ComposerAttachmentLadder.tiles(affordances(locations = false))
        val hostOff = ComposerAttachmentLadder.tiles(affordances(), showLocation = false)
        val both = ComposerAttachmentLadder.tiles(affordances())

        assertThat(kinds(permissionOff)).doesNotContain(AttachmentTileKind.Location)
        assertThat(kinds(hostOff)).doesNotContain(AttachmentTileKind.Location)
        assertThat(kinds(both)).contains(AttachmentTileKind.Location)
    }

    @Test
    fun `voice tile needs both the audio permission and the host flag`() {
        val permissionOff = ComposerAttachmentLadder.tiles(affordances(audios = false))
        val hostOff = ComposerAttachmentLadder.tiles(affordances(), showVoice = false)

        assertThat(kinds(permissionOff)).doesNotContain(AttachmentTileKind.Voice)
        assertThat(kinds(hostOff)).doesNotContain(AttachmentTileKind.Voice)
    }

    @Test
    fun `emoji tile needs both text permission and the host flag`() {
        val readOnly = ComposerAttachmentLadder.tiles(affordances(text = false))
        val hostOff = ComposerAttachmentLadder.tiles(affordances(), showEmoji = false)

        assertThat(kinds(readOnly)).doesNotContain(AttachmentTileKind.Emoji)
        assertThat(kinds(hostOff)).doesNotContain(AttachmentTileKind.Emoji)
    }

    @Test
    fun `a read-only participant still gets the attachment tiles their permissions allow`() {
        val tiles = ComposerAttachmentLadder.tiles(affordances(text = false))

        assertThat(kinds(tiles)).contains(AttachmentTileKind.File)
        assertThat(kinds(tiles)).contains(AttachmentTileKind.Photo)
        assertThat(kinds(tiles)).doesNotContain(AttachmentTileKind.Emoji)
    }

    @Test
    fun `a fully-denied participant gets an empty ladder`() {
        val tiles = ComposerAttachmentLadder.tiles(
            affordances(
                text = false,
                images = false,
                files = false,
                videos = false,
                audios = false,
                locations = false,
                links = false,
            ),
        )

        assertThat(tiles).isEmpty()
    }

    @Test
    fun `a partial subset preserves the canonical order`() {
        // Only files + audios permitted → File then Voice, never reordered.
        val tiles = ComposerAttachmentLadder.tiles(
            affordances(images = false, videos = false, locations = false, text = false),
        )

        assertThat(kinds(tiles)).containsExactly(AttachmentTileKind.File, AttachmentTileKind.Voice).inOrder()
    }

    @Test
    fun `the posture the chat screen wires today yields every tile but location`() {
        // Camera and Emoji got a live handler in issue #3738 (camera chooser +
        // capture, cursor-aware emoji insertion). Location stays off: the wire
        // field it needs is on ApiMessage/MessageRepository, outside the
        // chat-only perimeter of that lot — see ChatScreen.kt's comment above
        // ladderTiles.
        val tiles = ComposerAttachmentLadder.tiles(
            ComposerAttachmentPolicy.affordances(null),
            showCamera = true,
            showLocation = false,
            showEmoji = true,
        )

        assertThat(kinds(tiles)).containsExactly(
            AttachmentTileKind.Photo,
            AttachmentTileKind.Camera,
            AttachmentTileKind.File,
            AttachmentTileKind.Voice,
            AttachmentTileKind.Emoji,
        ).inOrder()
    }

    @Test
    fun `each tile carries its iOS parity gradient colour`() {
        val byKind = ComposerAttachmentLadder.tiles(ComposerAttachmentPolicy.affordances(null))
            .associate { it.kind to it.colorHex }

        assertThat(byKind[AttachmentTileKind.Photo]).isEqualTo("9B59B6")
        assertThat(byKind[AttachmentTileKind.Camera]).isEqualTo("F8B500")
        assertThat(byKind[AttachmentTileKind.File]).isEqualTo("45B7D1")
        assertThat(byKind[AttachmentTileKind.Location]).isEqualTo("2ECC71")
        assertThat(byKind[AttachmentTileKind.Voice]).isEqualTo("E74C3C")
        assertThat(byKind[AttachmentTileKind.Emoji]).isEqualTo("FF9F43")
    }
}
