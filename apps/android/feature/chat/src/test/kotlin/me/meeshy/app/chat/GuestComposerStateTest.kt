package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ParticipantPermissions
import me.meeshy.sdk.model.guest.GuestAttachmentKind
import org.junit.Test

class GuestComposerStateTest {
    private val guest = ParticipantPermissions.anonymous(canSendMessages = true, canSendFiles = true, canSendImages = true)

    @Test
    fun `l echelle du composeur d un invite World Wide ne propose ni photo ni lieu mais le micro et les fichiers`() {
        val state = ChatUiState(
            composerPermissions = guest.copy(allowedAttachmentKinds = listOf("text", "audio")),
        )
        val tiles = ComposerAttachmentLadder.tiles(state.composerAffordances).map { it.kind }
        assertThat(tiles).contains(AttachmentTileKind.File)
        assertThat(tiles).contains(AttachmentTileKind.Voice)
        assertThat(tiles).doesNotContain(AttachmentTileKind.Photo)
        assertThat(tiles).doesNotContain(AttachmentTileKind.Camera)
        assertThat(tiles).doesNotContain(AttachmentTileKind.Location)
    }

    @Test
    fun `un membre n est jamais borne par des termes de lien`() {
        assertThat(ChatUiState().guestAttachmentAllowance.isRestricted).isFalse()
    }

    @Test
    fun `chaque famille a un mime pour le selecteur`() {
        GuestAttachmentKind.entries.forEach { assertThat(it.mimeTypes()).isNotEmpty() }
    }
}
