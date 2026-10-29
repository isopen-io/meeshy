package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiForwardedFrom
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageAttachment
import org.junit.Test

/** #13793 / #13797 — ce qu'on accuse « lu » depuis Android, et quand un `message:new` appelle encore le REST. */
class ReadAcknowledgementTest {

    private fun plain(id: String, senderId: String = "other") =
        ApiMessage(id = id, conversationId = "c1", senderId = senderId, content = "clair $id")

    private fun sealed(id: String, senderId: String = "other") = ApiMessage(
        id = id,
        conversationId = "c1",
        senderId = senderId,
        content = "[Encrypted]",
        isEncrypted = true,
        encryptionMode = "e2ee",
    )

    private fun mayAcknowledge(window: List<ApiMessage>, unread: Int, arrived: ApiMessage? = null) =
        ReadAcknowledgement.mayAcknowledge(window, ownUserId = "me", unreadCount = unread, arrived = arrived)

    @Test
    fun `une conversation dont tous les non lus sont scellés n'est pas accusée lue`() {
        assertThat(mayAcknowledge(listOf(sealed("m1"), sealed("m2")), unread = 2)).isFalse()
    }

    @Test
    fun `une conversation dont les non lus sont en clair est accusée lue`() {
        assertThat(mayAcknowledge(listOf(plain("m1"), plain("m2")), unread = 2)).isTrue()
    }

    @Test
    fun `un scellé parmi les non lus retient l'accusé de toute la conversation`() {
        assertThat(mayAcknowledge(listOf(plain("m1"), sealed("m2"), plain("m3")), unread = 3)).isFalse()
    }

    @Test
    fun `un scellé plus ancien que les non lus n'est pas concerné`() {
        assertThat(mayAcknowledge(listOf(sealed("m1"), plain("m2"), plain("m3")), unread = 2)).isTrue()
    }

    @Test
    fun `mes propres messages ne comptent ni comme non lus ni comme scellés`() {
        val window = listOf(plain("m1"), sealed("m2", senderId = "me"), plain("m3", senderId = "me"))
        assertThat(mayAcknowledge(window, unread = 1)).isTrue()
    }

    @Test
    fun `une pièce scellée sous un texte clair retient l'accusé`() {
        val piece = ApiMessageAttachment(id = "a1", isEncrypted = true)
        val withSealedPiece = plain("m1").copy(attachments = listOf(piece))
        assertThat(mayAcknowledge(listOf(withSealedPiece), unread = 1)).isFalse()
    }

    @Test
    fun `un message scellé qui arrive n'est pas accusé même sans non lu connu`() {
        assertThat(mayAcknowledge(emptyList(), unread = 0, arrived = sealed("m9"))).isFalse()
    }

    @Test
    fun `un message en clair qui arrive est accusé`() {
        assertThat(mayAcknowledge(emptyList(), unread = 0, arrived = plain("m9"))).isTrue()
    }

    @Test
    fun `mon propre message scellé qui revient d'un autre appareil ne retient rien`() {
        assertThat(mayAcknowledge(emptyList(), unread = 0, arrived = sealed("m9", senderId = "me"))).isTrue()
    }

    @Test
    fun `rien de non lu ne retient rien`() {
        assertThat(mayAcknowledge(listOf(sealed("m1")), unread = 0)).isTrue()
    }

    @Test
    fun `un message ordinaire ingéré n'appelle plus le REST`() {
        assertThat(IncomingMessageCompletion.needsRest(plain("m1"))).isFalse()
    }

    @Test
    fun `un transfert dont la provenance n'est pas arrivée garde un rafraîchissement ciblé`() {
        assertThat(IncomingMessageCompletion.needsRest(plain("m1").copy(forwardedFromId = "src"))).isTrue()
    }

    @Test
    fun `un transfert dont la provenance est arrivée n'appelle pas le REST`() {
        val message = plain("m1").copy(forwardedFromId = "src", forwardedFrom = ApiForwardedFrom(id = "src"))
        assertThat(IncomingMessageCompletion.needsRest(message)).isFalse()
    }
}
