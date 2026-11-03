package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ComposerTrayPresenterTest {

    private fun piece(id: String, ready: Boolean, name: String? = id, type: PendingAttachmentType = PendingAttachmentType.IMAGE) =
        PendingAttachment(
            id = id,
            type = type,
            fileName = name,
            localPath = "/f/$id",
            phase = if (ready) PendingAttachmentPhase.Ready else PendingAttachmentPhase.Preparing,
        )

    private val place = PendingPlace(latitude = 1.0, longitude = 2.0, name = "Chez moi")

    @Test
    fun `un plateau sans rien est absent`() {
        assertThat(ComposerTrayPresenter.present(emptyList(), null).isEmpty).isTrue()
    }

    @Test
    fun `les pieces en preparation passent avant les pretes puis le lieu`() {
        val entries = ComposerTrayPresenter.present(
            items = listOf(piece("a", ready = true), piece("b", ready = false), piece("c", ready = true)),
            place = place,
        ).entries
        assertThat(entries.map { it.key }).containsExactly("b", "a", "c", ComposerTrayPresenter.PLACE_KEY).inOrder()
        assertThat(entries.map { it.kind }).containsExactly(
            TrayEntryKind.PREPARING, TrayEntryKind.READY, TrayEntryKind.READY, TrayEntryKind.PLACE,
        ).inOrder()
    }

    @Test
    fun `la position et le total servent a TalkBack`() {
        val entries = ComposerTrayPresenter.present(listOf(piece("a", true), piece("b", true)), place).entries
        assertThat(entries.map { it.position }).containsExactly(1, 2, 3).inOrder()
        assertThat(entries.map { it.total }.distinct()).containsExactly(3)
    }

    @Test
    fun `le libelle est le nom du fichier ou rien pour un nom absent`() {
        val entries = ComposerTrayPresenter.present(listOf(piece("a", true, name = "photo.jpg"), piece("b", true, name = " ")), null).entries
        assertThat(entries[0].label).isEqualTo("photo.jpg")
        assertThat(entries[1].label).isNull()
    }

    @Test
    fun `le lieu porte son nom et un lieu invalide n entre pas`() {
        val tray = ComposerTrayPresenter.present(emptyList(), place)
        assertThat(tray.entries.single().label).isEqualTo("Chez moi")
        assertThat(ComposerTrayPresenter.present(emptyList(), PendingPlace(200.0, 0.0)).isEmpty).isTrue()
    }

    @Test
    fun `le plafond est annonce quand il est atteint`() {
        val full = List(ComposerAttachmentLimits.MAX_PENDING_ATTACHMENTS) { piece("p$it", true) }
        assertThat(ComposerTrayPresenter.present(full, null).capReached).isTrue()
        assertThat(ComposerTrayPresenter.present(full.drop(1), null).capReached).isFalse()
    }
}
