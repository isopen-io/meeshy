package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ContentExitLaw
import me.meeshy.sdk.model.MessageExitOffer
import org.junit.Test

class ChatCaptureShieldTest {

    private fun offer(law: ContentExitLaw, blur: Boolean = false) =
        MessageExitOffer(law, holdsBlur = blur, isEncrypted = false)

    @Test
    fun `un fil ordinaire laisse la capture libre`() {
        assertThat(ChatCaptureShield.shields(listOf(offer(ContentExitLaw.Ordinary), MessageExitOffer.Unrestricted))).isFalse()
    }

    @Test
    fun `un message floute noircit le fil`() {
        assertThat(ChatCaptureShield.shields(listOf(offer(ContentExitLaw.Ordinary), offer(ContentExitLaw.Ordinary, blur = true)))).isTrue()
    }

    @Test
    fun `une flamme noircit le fil`() {
        assertThat(ChatCaptureShield.shields(listOf(offer(ContentExitLaw.AfterReadFlame)))).isTrue()
    }

    @Test
    fun `un fil vide ne protege rien`() {
        assertThat(ChatCaptureShield.shields(emptyList())).isFalse()
    }

    @Test
    fun `le fil qui sort ne retire pas la protection du fil qui entre`() {
        val holds = SecureHolds()
        assertThat(holds.acquire()).isTrue()
        assertThat(holds.acquire()).isFalse()
        assertThat(holds.release()).isFalse()
        assertThat(holds.release()).isTrue()
    }

    @Test
    fun `une liberation de trop ne retire rien`() {
        assertThat(SecureHolds().release()).isFalse()
    }
}
