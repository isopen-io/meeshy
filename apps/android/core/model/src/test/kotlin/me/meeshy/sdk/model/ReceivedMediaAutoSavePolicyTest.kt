package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** #14642 — les exclusions d'iOS : éphémère, chiffré, flouté, vue unique, reçu avant l'installation. */
class ReceivedMediaAutoSavePolicyTest {

    private val me = "me"
    private val installedAt = WireDate.epochMillis("2026-11-01T00:00:00.000Z")!!

    private fun photo(id: String = "a1", mime: String = "image/jpeg", url: String? = "https://x/$id.jpg") =
        ApiMessageAttachment(id = id, mimeType = mime, fileUrl = url, isViewOnce = false, isBlurred = false, effectFlags = 0L)

    private fun message(
        attachments: List<ApiMessageAttachment> = listOf(photo()),
        senderId: String = "friend",
        createdAt: String? = "2026-11-02T10:00:00.000Z",
    ) = ApiMessage(id = "m1", conversationId = "c1", senderId = senderId, createdAt = createdAt, attachments = attachments)

    private fun eligible(message: ApiMessage) =
        ReceivedMediaAutoSavePolicy.eligibleMedia(message, me, installedAt).map { it.id }

    @Test
    fun anOrdinaryReceivedPhotoOrVideo_isEligible_documentsAndAudioAreNot() {
        val m = message(listOf(photo("p"), photo("v", "video/mp4"), photo("d", "application/pdf"), photo("s", "audio/m4a")))
        assertThat(eligible(m)).containsExactly("p", "v").inOrder()
    }

    @Test
    fun myOwnMessage_isNeverAutoSaved() {
        assertThat(eligible(message(senderId = me))).isEmpty()
    }

    @Test
    fun aMessageReceivedBeforeTheInstallation_orWithAnUnreadableDate_isNotAutoSaved() {
        assertThat(eligible(message(createdAt = "2026-10-31T23:59:59.000Z"))).isEmpty()
        assertThat(eligible(message(createdAt = null))).isEmpty()
        assertThat(eligible(message(createdAt = "hier"))).isEmpty()
    }

    @Test
    fun anEphemeralMessage_isNotAutoSaved() {
        assertThat(eligible(message().copy(ephemeralDuration = 30))).isEmpty()
        assertThat(eligible(message().copy(expiresAt = "2026-11-03T00:00:00.000Z"))).isEmpty()
    }

    @Test
    fun aViewOnceOrBlurredMessage_isNotAutoSaved() {
        assertThat(eligible(message().copy(isViewOnce = true))).isEmpty()
        assertThat(eligible(message().copy(isBlurred = true))).isEmpty()
    }

    @Test
    fun anEncryptedMessage_isNotAutoSaved() {
        assertThat(eligible(message().copy(isEncrypted = true))).isEmpty()
        assertThat(eligible(message().copy(encryptionMode = "e2ee"))).isEmpty()
        assertThat(eligible(message(listOf(photo().copy(isEncrypted = true))))).isEmpty()
    }

    @Test
    fun aPieceThatIsItselfProtected_orSaysNothingOfItsProtection_isNotAutoSaved() {
        val viewOnce = photo("vo").copy(isViewOnce = true)
        val undeclared = ApiMessageAttachment(id = "u", mimeType = "image/png", fileUrl = "https://x/u.png")
        assertThat(eligible(message(listOf(photo("ok"), viewOnce)))).doesNotContain("vo")
        assertThat(eligible(message(listOf(undeclared)))).isEmpty()
    }

    @Test
    fun aDeletedMessage_orAPieceWithoutUrl_isNotAutoSaved() {
        assertThat(eligible(message().copy(deletedAt = "2026-11-02T11:00:00.000Z"))).isEmpty()
        assertThat(eligible(message(listOf(photo(url = null), photo("b", url = " "))))).isEmpty()
    }
}
