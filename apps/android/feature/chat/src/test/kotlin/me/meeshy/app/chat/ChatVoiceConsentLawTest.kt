package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.composer.PendingAttachment
import me.meeshy.sdk.model.composer.PendingAttachmentType
import me.meeshy.sdk.model.composer.PendingAttachmentsState
import org.junit.Test

/** Ce que le fil produit pour la note de consentement vocal et le popup d'envoi (#16420). */
class ChatVoiceConsentLawTest {

    private val now = "2026-11-05T10:00:00Z"

    @Test
    fun `mon propre vocal porte le consentement manquant`() {
        val mine = voiceMessage("m1", now, voice("a1"), isOutgoing = true)

        assertThat(mine.withVoiceConsent(missing = true).voiceConsentMissing).isTrue()
    }

    @Test
    fun `le vocal d'un autre ne porte jamais la note`() {
        val theirs = voiceMessage("m1", now, voice("a1"), isOutgoing = false)

        assertThat(theirs.withVoiceConsent(missing = true)).isSameInstanceAs(theirs)
    }

    @Test
    fun `un message sans audio reste la meme bulle`() {
        val text = voiceMessage("m1", now, isOutgoing = true)

        assertThat(text.withVoiceConsent(missing = true)).isSameInstanceAs(text)
    }

    @Test
    fun `le consentement donne retire la note de mon vocal`() {
        val flagged = voiceMessage("m1", now, voice("a1"), isOutgoing = true).withVoiceConsent(missing = true)

        assertThat(flagged.withVoiceConsent(missing = false).voiceConsentMissing).isFalse()
    }

    @Test
    fun `une bulle deja a jour n'est pas recopiee`() {
        val mine = voiceMessage("m1", now, voice("a1"), isOutgoing = true)

        assertThat(mine.withVoiceConsent(missing = false)).isSameInstanceAs(mine)
    }

    private fun pending(type: PendingAttachmentType) = PendingAttachment(id = type.name, type = type, fileName = null)

    @Test
    fun `le plateau porte un audio des qu'une piece est un vocal`() {
        assertThat(PendingAttachmentsState(listOf(pending(PendingAttachmentType.IMAGE), pending(PendingAttachmentType.AUDIO))).hasAudio).isTrue()
        assertThat(PendingAttachmentsState(listOf(pending(PendingAttachmentType.IMAGE))).hasAudio).isFalse()
        assertThat(PendingAttachmentsState().hasAudio).isFalse()
    }
}
