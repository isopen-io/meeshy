package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class PublicationTargetRuleTest {
    @Test
    fun `an image defaults to post and video or audio to reel`() {
        assertThat(PublicationTargetRule.defaultTarget("image/jpeg")).isEqualTo(PublicationTarget.POST)
        assertThat(PublicationTargetRule.defaultTarget("VIDEO/mp4")).isEqualTo(PublicationTarget.REEL)
        assertThat(PublicationTargetRule.defaultTarget("audio/aac")).isEqualTo(PublicationTarget.REEL)
    }

    @Test
    fun `a document or unknown mime has no target`() {
        assertThat(PublicationTargetRule.defaultTarget("application/pdf")).isNull()
        assertThat(PublicationTargetRule.defaultTarget(null)).isNull()
        assertThat(PublicationTargetRule.targets("application/pdf")).isEmpty()
    }

    @Test
    fun `targets offer the default then story`() {
        assertThat(PublicationTargetRule.targets("image/png"))
            .containsExactly(PublicationTarget.POST, PublicationTarget.STORY).inOrder()
    }

    @Test
    fun `an in-app capture needs confirmation for every target and an import does not`() {
        PublicationTarget.entries.forEach {
            assertThat(PublicationTargetRule.needsCaptureConfirmation(true, it)).isTrue()
            assertThat(PublicationTargetRule.needsCaptureConfirmation(false, it)).isFalse()
        }
    }
}
