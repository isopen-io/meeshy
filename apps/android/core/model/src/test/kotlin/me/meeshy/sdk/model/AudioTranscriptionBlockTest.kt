package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.AudioTranscriptionBlock.Kind
import me.meeshy.sdk.model.MessageTranscriptionFiche.Request
import org.junit.Test

class AudioTranscriptionBlockTest {

    private fun block(
        hasTranscription: Boolean = false,
        reservedPassively: Boolean = false,
        request: Request = Request.IDLE,
        canRequest: Boolean = true,
    ) = AudioTranscriptionBlock.of(hasTranscription, reservedPassively, request, canRequest)

    @Test
    fun `the text wins over everything the moment it exists`() {
        assertThat(block(hasTranscription = true, reservedPassively = true, request = Request.IN_FLIGHT)).isEqualTo(Kind.TRANSCRIPT)
    }

    @Test
    fun `a request in flight shows the skeleton, not the button`() {
        assertThat(block(request = Request.IN_FLIGHT)).isEqualTo(Kind.SKELETON)
    }

    @Test
    fun `a transcription expected on its own keeps its height with the skeleton`() {
        assertThat(block(reservedPassively = true)).isEqualTo(Kind.SKELETON)
    }

    @Test
    fun `nothing coming and nothing asked offers the button`() {
        assertThat(block()).isEqualTo(Kind.REQUEST)
    }

    @Test
    fun `a failure received offers the button again`() {
        assertThat(block(request = Request.FAILED)).isEqualTo(Kind.REQUEST)
    }

    @Test
    fun `without the right to ask nothing is offered`() {
        assertThat(block(canRequest = false)).isEqualTo(Kind.NONE)
    }

    @Test
    fun `a protected or unsent voice still reserves its height when a transcription is expected`() {
        assertThat(block(reservedPassively = true, canRequest = false)).isEqualTo(Kind.SKELETON)
    }
}
