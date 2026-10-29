package me.meeshy.app.chat.piece

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.piece.MessagePieceTarget
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
        assertThat(writer.actionsFor(0).map { it.name }).containsExactly("REPLY", "SAVE", "WHOLE_MESSAGE").inOrder()
        val readOnly = PieceOverlayModel.of(message(photo("a")), "a", canReply = false, resolveUrl = resolve)!!
        assertThat(readOnly.actionsFor(0).map { it.name }).containsExactly("SAVE", "WHOLE_MESSAGE").inOrder()
    }

    @Test
    fun `seules les actions dont l'effet est branche sont offertes, les autres restent absentes`() {
        val none = PieceOverlayModel.of(message(photo("a")), "a", canReply = true, resolveUrl = resolve)!!
        assertThat(none.actionsFor(0)).containsNoneOf(
            MessagePieceTarget.Action.FORWARD, MessagePieceTarget.Action.COPY, MessagePieceTarget.Action.DELETE,
        )
        assertThat(none.offersReaction(0)).isFalse()

        val wired = PieceOverlayModel.of(
            message(photo("a")), "a", canReply = true, resolveUrl = resolve,
            capabilities = PieceCapabilities(canForward = true, canCopy = true, canDelete = true, canReact = true),
        )!!
        assertThat(wired.actionsFor(0).map { it.name })
            .containsExactly("REPLY", "FORWARD", "SAVE", "COPY", "DELETE", "WHOLE_MESSAGE").inOrder()
        assertThat(wired.offersReaction(0)).isTrue()
    }
    @Test
    fun `the bande de reactions marque ce que ce lecteur a deja pose sur chaque piece`() {
        val message = message(photo("a").copy(currentUserReactions = listOf("👍")), photo("b"))
        val model = PieceOverlayModel.of(message, "a", canReply = true, resolveUrl = resolve)!!

        assertThat(model.pages.map { it.ownReactions }).containsExactly(setOf("👍"), emptySet<String>()).inOrder()
    }

    private fun own(vararg pieces: ApiMessageAttachment, id: String = "64b7f0a1c2d3e4f5a6b7c8d9") =
        ApiMessage(id = id, conversationId = "c1", senderId = "me", content = "", attachments = pieces.toList())

    @Test
    fun `un message accuse, vivant et en clair se transfere, se reagit et se supprime par son auteur`() {
        val capabilities = PieceCapabilities.of(own(photo("a")), viewerId = "me", viewerMayWrite = true, conversationIsEndToEnd = false)

        assertThat(capabilities).isEqualTo(PieceCapabilities(canForward = true, canCopy = false, canDelete = true, canReact = true))
    }

    @Test
    fun `copier reste absent, aucune URI de presse-papiers sure n'existe et iOS n'offre pas de copie de piece`() {
        val capabilities = PieceCapabilities.of(own(photo("a")), "me", viewerMayWrite = true, conversationIsEndToEnd = false)
        val model = PieceOverlayModel.of(own(photo("a")), "a", canReply = true, capabilities = capabilities, resolveUrl = resolve)!!

        assertThat(model.actionsFor(0)).doesNotContain(MessagePieceTarget.Action.COPY)
        assertThat(model.actionsFor(0)).contains(MessagePieceTarget.Action.FORWARD)
        assertThat(model.actionsFor(0)).contains(MessagePieceTarget.Action.DELETE)
    }

    @Test
    fun `un lecteur sans droit d'ecrire ne reagit pas, et le message d'un autre ne se supprime pas`() {
        val others = own(photo("a")).copy(senderId = "other")

        val readOnly = PieceCapabilities.of(others, viewerId = "me", viewerMayWrite = false, conversationIsEndToEnd = false)

        assertThat(readOnly.canReact).isFalse()
        assertThat(readOnly.canDelete).isFalse()
        assertThat(readOnly.canForward).isTrue()
    }

    @Test
    fun `une bulle locale, un message supprime ou une conversation chiffree n'offrent aucun effet serveur`() {
        val local = PieceCapabilities.of(own(photo("a"), id = "cid_1"), "me", viewerMayWrite = true, conversationIsEndToEnd = false)
        val deleted = PieceCapabilities.of(own(photo("a")).copy(deletedAt = "2026-10-28T10:00:00Z"), "me", true, false)
        val encrypted = PieceCapabilities.of(own(photo("a")), "me", viewerMayWrite = true, conversationIsEndToEnd = true)

        val none = PieceCapabilities(canForward = false, canCopy = false, canDelete = false, canReact = false)
        assertThat(local).isEqualTo(none)
        assertThat(deleted).isEqualTo(none)
        assertThat(encrypted).isEqualTo(none)
    }

    @Test
    fun `un message dont une piece est protegee n ouvre aucun apercu, quelles que soient les capacites`() {
        val message = own(photo("a"), photo("b", blurred = true))
        val model = PieceOverlayModel.of(
            message, "a", canReply = true, resolveUrl = resolve,
            capabilities = PieceCapabilities.of(message, "me", true, false),
        )

        assertThat(model).isNull()
    }
}
