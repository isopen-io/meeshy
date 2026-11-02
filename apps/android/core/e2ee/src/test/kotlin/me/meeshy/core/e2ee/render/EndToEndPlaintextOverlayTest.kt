package me.meeshy.core.e2ee.render

import com.google.common.truth.Truth.assertThat
import me.meeshy.core.e2ee.content.E2eeContent
import me.meeshy.core.e2ee.store.E2eePlaintextEntry
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageSender
import org.junit.Test

class EndToEndPlaintextOverlayTest {
    private fun served(
        id: String = "m1",
        cid: String? = "cid_1",
        conversationId: String = "c1",
        author: String = "alice",
        replyToId: String? = null,
        messageSource: String? = null,
    ) = ApiMessage(
        id = id, conversationId = conversationId, senderId = "participant_$author", sender = ApiMessageSender(userId = author),
        content = "[Encrypted]", isEncrypted = true, encryptionMode = "e2ee", clientMessageId = cid, replyToId = replyToId,
        messageSource = messageSource,
    )

    private fun readable(
        text: String,
        language: String? = "fr",
        sender: String = "alice",
        conversationId: String? = "c1",
        cid: String? = "cid_1",
        replyTo: String? = null,
    ) = E2eePlaintextEntry.Readable(E2eeContent.compose(text, language, replyTo, conversationId, cid, 1L), sender)

    private fun shown(message: ApiMessage, entries: Map<String, E2eePlaintextEntry>, reader: String = "bob", thread: String = "c1") =
        EndToEndPlaintextOverlay.apply(message, entries, conversationId = thread, readerUserId = reader)

    @Test
    fun anOpenedMessage_showsItsPlaintext_butStaysEndToEnd() {
        val shown = shown(served(), mapOf("m1" to readable("Bonjour")))

        assertThat(shown.content).isEqualTo("Bonjour")
        assertThat(shown.originalLanguage).isEqualTo("fr")
        assertThat(shown.encryptionMode).isEqualTo("e2ee")
        assertThat(shown.isEndToEndSealed).isFalse()
    }

    @Test
    fun myOwnSend_isFoundUnderItsClientId_beforeTheServerIdIsKnown() {
        val mine = served(id = "cid_1", author = "me")
        assertThat(shown(mine, mapOf("cid_1" to readable("envoyé", sender = "me")), reader = "me").content).isEqualTo("envoyé")
    }

    @Test
    fun myOwnSend_acknowledged_isFoundUnderItsClientId() {
        val mine = served(id = "m7", author = "me")
        assertThat(shown(mine, mapOf("cid_1" to readable("envoyé", sender = "me")), reader = "me").content).isEqualTo("envoyé")
    }

    @Test
    fun aForgedMessageInAnotherConversation_reusingMyClientId_staysSealed() {
        val entries = mapOf("cid_1" to E2eePlaintextEntry.Readable(E2eeContent.compose("secret", "fr", null, "c1", "cid_1", 1), "me"))
        val forged = ApiMessage(
            id = "m9", conversationId = "c2", senderId = "mallory", content = "[Encrypted]", clientMessageId = "cid_1",
            isEncrypted = true, encryptionMode = "e2ee",
        )
        assertThat(EndToEndPlaintextOverlay.apply(forged, entries, conversationId = "c2", readerUserId = "me").content).isEqualTo("[Encrypted]")
    }

    @Test
    fun aPeerMessage_isNeverLookedUpUnderItsClientId() {
        val entries = mapOf("cid_1" to readable("secret", sender = "alice"))
        assertThat(shown(served(id = "m9", author = "alice"), entries).isEndToEndSealed).isTrue()
        assertThat(EndToEndPlaintextOverlay.keysOf(served(id = "m9", author = "alice"), readerUserId = "bob")).containsExactly("m9")
    }

    @Test
    fun aPlaintextOfAnotherConversation_staysSealed_evenUnderTheServedId() {
        assertThat(shown(served(), mapOf("m1" to readable("ailleurs", conversationId = "c2"))).isEndToEndSealed).isTrue()
        assertThat(shown(served(), mapOf("m1" to readable("sans conversation", conversationId = null))).isEndToEndSealed).isTrue()
    }

    @Test
    fun aMessageServedInAnotherThread_staysSealed_evenIfItClaimsTheRightConversation() {
        assertThat(shown(served(), mapOf("m1" to readable("Bonjour")), thread = "c2").isEndToEndSealed).isTrue()
    }

    @Test
    fun aPlaintextAuthenticatedFromAnotherAuthor_staysSealed() {
        assertThat(shown(served(author = "mallory"), mapOf("m1" to readable("Bonjour", sender = "alice"))).isEndToEndSealed).isTrue()
    }

    @Test
    fun aMessageWithoutAnnouncedAuthor_staysSealed() {
        val anonymous = served().copy(sender = null, senderId = null)
        assertThat(shown(anonymous, mapOf("m1" to readable("Bonjour"))).isEndToEndSealed).isTrue()
    }

    @Test
    fun aMismatchedClientId_staysSealed() {
        assertThat(shown(served(cid = "cid_2"), mapOf("m1" to readable("Bonjour", cid = "cid_1"))).isEndToEndSealed).isTrue()
    }

    @Test
    fun aMismatchedQuote_staysSealed() {
        assertThat(shown(served(replyToId = "m0"), mapOf("m1" to readable("Bonjour"))).isEndToEndSealed).isTrue()
        assertThat(shown(served(), mapOf("m1" to readable("Bonjour", replyTo = "m0"))).isEndToEndSealed).isTrue()
        assertThat(shown(served(replyToId = "m0"), mapOf("m1" to readable("Bonjour", replyTo = "m0"))).content).isEqualTo("Bonjour")
    }

    @Test
    fun aSystemMessage_neverAdoptsAPlaintext() {
        assertThat(shown(served(messageSource = "system"), mapOf("m1" to readable("Bonjour"))).isEndToEndSealed).isTrue()
    }

    @Test
    fun anUndecryptableOrUnknownMessage_staysSealed() {
        assertThat(shown(served(), mapOf("m1" to E2eePlaintextEntry.Undecryptable)).isEndToEndSealed).isTrue()
        assertThat(shown(served(), emptyMap()).isEndToEndSealed).isTrue()
    }

    @Test
    fun aPlaintextMessage_isNeverRewritten_evenIfTheVaultHoldsItsId() {
        val clear = ApiMessage(id = "m1", conversationId = "c1", content = "en clair", sender = ApiMessageSender(userId = "alice"))
        assertThat(shown(clear, mapOf("m1" to readable("autre")))).isEqualTo(clear)
    }

    @Test
    fun anExpiredOrConsumedMessage_yieldsTheKeysToErase() {
        val now = 1_800_000_000_000L
        val expired = served().copy(expiresAt = "2020-01-01T00:00:00Z")
        val consumed = served().copy(isViewOnce = true, consumedByMe = true)
        val myExpired = served(id = "m7", author = "me").copy(expiresAt = "2020-01-01T00:00:00Z")

        assertThat(EndToEndPlaintextOverlay.erasableKeys(expired, readerUserId = "bob", nowMillis = now)).containsExactly("m1")
        assertThat(EndToEndPlaintextOverlay.erasableKeys(consumed, readerUserId = "bob", nowMillis = now)).containsExactly("m1")
        assertThat(EndToEndPlaintextOverlay.erasableKeys(myExpired, readerUserId = "me", nowMillis = now)).containsExactly("m7", "cid_1")
    }

    /**
     * #14656 — une pierre tombale se lit sans effacer : celle d'une suppression lancée ICI peut encore être refusée, et le
     * coffre est la seule copie du clair. L'effacement d'une suppression suit sa CONFIRMATION (réponse, écho, page servie)
     * par la file durable, jamais la projection.
     */
    @Test
    fun aTombstone_yieldsNothingToErase() {
        val now = 1_800_000_000_000L
        val deleted = served(id = "m7", author = "me").copy(deletedAt = "2026-11-01T10:00:00Z")
        assertThat(EndToEndPlaintextOverlay.erasableKeys(deleted, readerUserId = "me", nowMillis = now)).isEmpty()
    }

    @Test
    fun aLiveMessage_keepsItsPlaintext() {
        val now = 1_800_000_000_000L
        val pending = served().copy(expiresAt = "2099-01-01T00:00:00Z")
        val unopened = served().copy(isViewOnce = true, consumedByMe = false)
        assertThat(EndToEndPlaintextOverlay.erasableKeys(served(), readerUserId = "bob", nowMillis = now)).isEmpty()
        assertThat(EndToEndPlaintextOverlay.erasableKeys(pending, readerUserId = "bob", nowMillis = now)).isEmpty()
        assertThat(EndToEndPlaintextOverlay.erasableKeys(unopened, readerUserId = "bob", nowMillis = now)).isEmpty()
    }

    @Test
    fun aGoneMessage_neverShowsItsPlaintext() {
        val deleted = served().copy(deletedAt = "2026-11-01T10:00:00Z")
        assertThat(shown(deleted, mapOf("m1" to readable("Bonjour"))).content).isEqualTo("[Encrypted]")
    }
}
