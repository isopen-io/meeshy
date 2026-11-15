package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class VoiceQueueProtectionTest {

    private fun message(
        isViewOnce: Boolean? = null,
        isBlurred: Boolean? = null,
        expiresAt: String? = null,
        ephemeralDuration: Int? = null,
        isEncrypted: Boolean? = null,
        encryptionMode: String? = null,
        effectFlags: Int? = null,
        attachments: List<ApiMessageAttachment> = emptyList(),
    ) = ApiMessage(
        id = "m1",
        conversationId = "c1",
        messageType = "audio",
        isViewOnce = isViewOnce,
        isBlurred = isBlurred,
        expiresAt = expiresAt,
        ephemeralDuration = ephemeralDuration,
        isEncrypted = isEncrypted,
        encryptionMode = encryptionMode,
        effectFlags = effectFlags,
        attachments = attachments,
    )

    private fun piece(
        id: String = "a1",
        isViewOnce: Boolean? = null,
        isBlurred: Boolean? = null,
        effectFlags: Long? = null,
        isEncrypted: Boolean? = null,
    ) = ApiMessageAttachment(
        id = id,
        mimeType = "audio/mp4",
        fileUrl = "https://cdn.meeshy.me/$id.m4a",
        isViewOnce = isViewOnce,
        isBlurred = isBlurred,
        effectFlags = effectFlags,
        isEncrypted = isEncrypted,
    )

    @Test
    fun `un vocal ordinaire n'est pas protege`() {
        val plain = piece(isViewOnce = false, isBlurred = false, effectFlags = 0L)

        assertThat(VoiceQueueProtection.ofMessage(message(attachments = listOf(plain)))).isFalse()
        assertThat(VoiceQueueProtection.ofPiece(plain, message(attachments = listOf(plain)))).isFalse()
    }

    @Test
    fun `vue unique, flou, ephemere et chiffre protegent le message, comme isProtectedVoice d'iOS`() {
        val cases = listOf(
            message(isViewOnce = true),
            message(isBlurred = true),
            message(expiresAt = "2026-11-04T10:00:00Z"),
            message(isEncrypted = true),
        )

        assertThat(cases.map(VoiceQueueProtection::ofMessage)).containsExactly(true, true, true, true)
    }

    @Test
    fun `le bitfield seul suffit a proteger, flamme sans echeance comprise`() {
        val cases = listOf(
            message(effectFlags = MessageEffectFlags.VIEW_ONCE.toInt()),
            message(effectFlags = MessageEffectFlags.BLURRED.toInt()),
            message(effectFlags = (MessageEffectFlags.EPHEMERAL or MessageEffectFlags.EPHEMERAL_AFTER_READ).toInt()),
            message(ephemeralDuration = 30),
        )

        assertThat(cases.map(VoiceQueueProtection::ofMessage)).containsExactly(true, true, true, true)
    }

    @Test
    fun `un effet d'apparition ne protege pas`() {
        assertThat(VoiceQueueProtection.ofMessage(message(effectFlags = MessageEffectFlags.CONFETTI.toInt()))).isFalse()
    }

    @Test
    fun `une piece masquee ou scellee protege son vocal dans un message ordinaire`() {
        val cases = listOf(
            piece(isViewOnce = true),
            piece(isBlurred = true),
            piece(effectFlags = MessageEffectFlags.VIEW_ONCE),
            piece(isEncrypted = true),
        )

        assertThat(cases.map { VoiceQueueProtection.ofPiece(it, message(attachments = listOf(it))) })
            .containsExactly(true, true, true, true)
    }

    @Test
    fun `la protection du message couvre chacune de ses pieces`() {
        val plain = piece(isViewOnce = false, isBlurred = false, effectFlags = 0L)

        assertThat(VoiceQueueProtection.ofPiece(plain, message(isBlurred = true, attachments = listOf(plain)))).isTrue()
    }

    @Test
    fun `la file recopie la protection calculee depuis le message et sa piece`() {
        val open = piece(id = "open", isViewOnce = false, isBlurred = false, effectFlags = 0L)
        val masked = piece(id = "masked", isViewOnce = true)
        val carrier = message(attachments = listOf(open, masked))

        val entry = AudioQueueMessage(
            messageId = carrier.id,
            conversationId = carrier.conversationId,
            senderId = "other",
            senderName = "Nour",
            senderAvatarUrl = null,
            createdAtEpochMs = 10L,
            isProtected = VoiceQueueProtection.ofMessage(carrier),
            audios = carrier.attachments.map {
                AudioQueueAttachment(it.id, it.fileUrl.orEmpty(), 1_000L, VoiceQueueProtection.ofPiece(it, carrier))
            },
        )
        val queue = AudioQueueBuilder.build(listOf(entry), null, currentUserId = "me", listenedAttachmentIds = emptySet())

        assertThat(queue.map { it.attachmentId to it.isProtected })
            .containsExactly("open" to false, "masked" to true).inOrder()
    }
}
