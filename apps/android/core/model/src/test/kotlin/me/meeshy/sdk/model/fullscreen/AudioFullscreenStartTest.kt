package me.meeshy.sdk.model.fullscreen

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.fullscreen.AudioFullscreenStart.Step
import org.junit.Test

class AudioFullscreenStartTest {

    @Test
    fun `la page deja jouee ne relance rien, seule sa suite change`() {
        val step = AudioFullscreenStart.step(pageAttachmentId = "a", activeAttachmentId = "a", activeConversationId = "c", pageConversationId = "c")

        assertThat(step).isEqualTo(Step.ALREADY_ACTIVE)
    }

    @Test
    fun `une autre page de la conversation jouee garde la session`() {
        val step = AudioFullscreenStart.step(pageAttachmentId = "b", activeAttachmentId = "a", activeConversationId = "c", pageConversationId = "c")

        assertThat(step).isEqualTo(Step.KEEP_SESSION)
    }

    @Test
    fun `une page d une autre conversation ouvre une nouvelle session`() {
        val step = AudioFullscreenStart.step(pageAttachmentId = "b", activeAttachmentId = "a", activeConversationId = "c", pageConversationId = "d")

        assertThat(step).isEqualTo(Step.NEW_SESSION)
    }

    @Test
    fun `sans session ou sans conversation connue, la session est neuve`() {
        assertThat(AudioFullscreenStart.step("b", activeAttachmentId = null, activeConversationId = null, pageConversationId = "c"))
            .isEqualTo(Step.NEW_SESSION)
        assertThat(AudioFullscreenStart.step("b", activeAttachmentId = "a", activeConversationId = "c", pageConversationId = ""))
            .isEqualTo(Step.NEW_SESSION)
        assertThat(AudioFullscreenStart.step("b", activeAttachmentId = "a", activeConversationId = "c", pageConversationId = null))
            .isEqualTo(Step.NEW_SESSION)
    }
}
