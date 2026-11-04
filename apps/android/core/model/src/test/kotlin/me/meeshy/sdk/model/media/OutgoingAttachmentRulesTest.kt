package me.meeshy.sdk.model.media

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.guest.GuestAttachmentKind
import me.meeshy.sdk.model.guest.GuestAttachmentRefusal
import org.junit.Test

class OutgoingAttachmentRulesTest {
    @Test
    fun `le consentement vocal se demande une fois, a un envoi qui porte de l'audio`() {
        assertThat(OutgoingAttachmentRules.shouldPromptVoiceConsent(hasAudio = true, consentMissing = true, alreadyPrompted = false)).isTrue()
        assertThat(OutgoingAttachmentRules.shouldPromptVoiceConsent(hasAudio = true, consentMissing = true, alreadyPrompted = true)).isFalse()
        assertThat(OutgoingAttachmentRules.shouldPromptVoiceConsent(hasAudio = false, consentMissing = true, alreadyPrompted = false)).isFalse()
        assertThat(OutgoingAttachmentRules.shouldPromptVoiceConsent(hasAudio = true, consentMissing = false, alreadyPrompted = false)).isFalse()
    }

    @Test
    fun `un groupe audio est toujours une bulle audio`() {
        assertThat(OutgoingAttachmentRules.optimisticMessageType(true, listOf("audio/mp4", "application/pdf"))).isEqualTo("audio")
    }

    @Test
    fun `une seule categorie donne cette categorie, un melange donne file`() {
        assertThat(OutgoingAttachmentRules.optimisticMessageType(false, listOf("video/mp4", "video/quicktime"))).isEqualTo("video")
        assertThat(OutgoingAttachmentRules.optimisticMessageType(false, listOf("image/png", "video/mp4"))).isEqualTo("file")
        assertThat(OutgoingAttachmentRules.optimisticMessageType(false, listOf("application/pdf"))).isEqualTo("file")
        assertThat(OutgoingAttachmentRules.optimisticMessageType(false, emptyList())).isEqualTo("file")
    }

    @Test
    fun `l'audio part en audio mp4, les autres gardent leur type, le vide devient generique`() {
        assertThat(OutgoingAttachmentRules.uploadMimeType(true, "audio/x-m4a")).isEqualTo("audio/mp4")
        assertThat(OutgoingAttachmentRules.uploadMimeType(false, "image/webp")).isEqualTo("image/webp")
        assertThat(OutgoingAttachmentRules.uploadMimeType(false, "")).isEqualTo("application/octet-stream")
        assertThat(OutgoingAttachmentRules.uploadMimeType(false, null)).isEqualTo("application/octet-stream")
    }

    @Test
    fun `le conseil de reduire n'accompagne que plusieurs pieces`() {
        val hint = { count: Int -> "Réduisez ($count)." }

        assertThat(OutgoingAttachmentRules.uploadFailureReason("Réseau", 1, hint)).isEqualTo("Réseau")
        assertThat(OutgoingAttachmentRules.uploadFailureReason("Réseau", 3, hint)).isEqualTo("Réseau Réduisez (3).")
        assertThat(OutgoingAttachmentRules.uploadFailureReason(null, 1, hint)).isNotEmpty()
    }

    @Test
    fun `le refus d'une piece d'invite est definitif et garde les types autorises`() {
        val reason = OutgoingAttachmentRules.guestRefusalReason(
            GuestAttachmentRefusal(GuestAttachmentRefusal.Reason.KIND_NOT_ALLOWED),
            listOf(GuestAttachmentKind.TEXT, GuestAttachmentKind.AUDIO),
        )

        assertThat(OutgoingAttachmentRules.isDefinitiveReason(reason)).isTrue()
        val reading = OutgoingAttachmentRules.parseGuestRefusal(reason)!!
        assertThat(reading.reason).isEqualTo(GuestAttachmentRefusal.Reason.KIND_NOT_ALLOWED)
        assertThat(reading.allowedKinds).containsExactly(GuestAttachmentKind.TEXT, GuestAttachmentKind.AUDIO).inOrder()
    }

    @Test
    fun `un refus trop lourd sans restriction de familles se relit sans types`() {
        val reason = OutgoingAttachmentRules.guestRefusalReason(GuestAttachmentRefusal(GuestAttachmentRefusal.Reason.TOO_LARGE), null)

        assertThat(OutgoingAttachmentRules.parseGuestRefusal(reason)!!.allowedKinds).isNull()
    }

    @Test
    fun `un motif ordinaire n'est pas un refus d'invite`() {
        assertThat(OutgoingAttachmentRules.parseGuestRefusal("timeout")).isNull()
        assertThat(OutgoingAttachmentRules.parseGuestRefusal(null)).isNull()
        assertThat(OutgoingAttachmentRules.isDefinitiveReason("timeout")).isFalse()
    }
}
