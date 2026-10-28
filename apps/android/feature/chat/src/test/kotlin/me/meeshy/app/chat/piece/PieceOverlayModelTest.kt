package me.meeshy.app.chat.piece

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageAttachment
import org.junit.Test

class PieceOverlayModelTest {

    private fun photo(id: String, w: Int? = 400, h: Int? = 200, blurred: Boolean? = null) = ApiMessageAttachment(
        id = id, mimeType = "image/jpeg", fileUrl = "/full/$id", thumbnailUrl = "/thumb/$id", width = w, height = h, isBlurred = blurred,
    )

    private fun message(vararg pieces: ApiMessageAttachment, viewOnce: Boolean? = null) =
        ApiMessage(id = "m1", conversationId = "c1", senderId = "u", content = "", attachments = pieces.toList(), isViewOnce = viewOnce)

    private val resolve: (String) -> String = { "https://cdn$it" }

    @Test
    fun `l'apercu s'ouvre sur la piece pressee avec toutes les tuiles du message`() {
        val model = PieceOverlayModel.of(message(photo("a"), photo("b"), photo("c")), "b", canReply = true, resolveUrl = resolve)!!

        assertThat(model.pages.map { it.attachmentId }).containsExactly("a", "b", "c").inOrder()
        assertThat(model.startIndex).isEqualTo(1)
        assertThat(model.pages[1].ratio).isEqualTo(2f)
        assertThat(model.pages[1].url).isEqualTo("https://cdn/full/b")
    }

    @Test
    fun `un message protege n'ouvre pas d'apercu de piece`() {
        assertThat(PieceOverlayModel.of(message(photo("a"), viewOnce = true), "a", canReply = true, resolveUrl = resolve)).isNull()
    }

    @Test
    fun `une conversation chiffree de bout en bout n'ouvre aucun apercu de piece`() {
        assertThat(
            PieceOverlayModel.of(message(photo("a")), "a", canReply = true, conversationIsEndToEnd = true, resolveUrl = resolve),
        ).isNull()
    }

    @Test
    fun `une piece floutee protege tout le message, aucun apercu et aucune page en clair a cote d elle`() {
        assertThat(PieceOverlayModel.of(message(photo("a"), photo("b", blurred = true)), "a", canReply = true, resolveUrl = resolve)).isNull()
        assertThat(PieceOverlayModel.of(message(photo("a"), photo("b", blurred = true)), "b", canReply = true, resolveUrl = resolve)).isNull()
    }

    @Test
    fun `une piece inconnue du message ne s'ouvre pas`() {
        assertThat(PieceOverlayModel.of(message(photo("a")), "ghost", canReply = true, resolveUrl = resolve)).isNull()
    }

    @Test
    fun `sans dimensions la piece est un carre`() {
        val model = PieceOverlayModel.of(message(photo("a", w = null, h = null)), "a", canReply = true, resolveUrl = resolve)!!
        assertThat(model.pages.single().ratio).isEqualTo(1f)
    }

    @Test
    fun `les actions offertes suivent le droit d'ecrire`() {
        val writer = PieceOverlayModel.of(message(photo("a"), photo("b")), "a", canReply = true, resolveUrl = resolve)!!
        assertThat(writer.actionsFor(0).map { it.name }).containsExactly("REPLY", "WHOLE_MESSAGE").inOrder()
        val readOnly = PieceOverlayModel.of(message(photo("a")), "a", canReply = false, resolveUrl = resolve)!!
        assertThat(readOnly.actionsFor(0).map { it.name }).containsExactly("WHOLE_MESSAGE")
    }
}
