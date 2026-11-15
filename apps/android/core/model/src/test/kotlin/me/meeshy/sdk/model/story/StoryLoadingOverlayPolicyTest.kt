package me.meeshy.sdk.model.story

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class StoryLoadingOverlayPolicyTest {
    @Test
    fun `le spinner arme apres 200 ms sous 0,20 de progression seulement`() {
        assertThat(StoryLoadingOverlayPolicy.SPINNER_GRACE_MS).isEqualTo(200L)
        assertThat(StoryLoadingOverlayPolicy.armsSpinner(0.19)).isTrue()
        assertThat(StoryLoadingOverlayPolicy.armsSpinner(0.20)).isFalse()
    }

    @Test
    fun `l'overlay est retire a 0,95`() {
        assertThat(StoryLoadingOverlayPolicy.isMounted(0.94)).isTrue()
        assertThat(StoryLoadingOverlayPolicy.isMounted(0.95)).isFalse()
    }

    @Test
    fun `pas de spinner quand le cache a l'image`() {
        assertThat(StoryLoadingOverlayPolicy.showsSpinner(armed = false, progress = 0.0)).isFalse()
        assertThat(StoryLoadingOverlayPolicy.showsSpinner(armed = true, progress = 0.97)).isFalse()
        assertThat(StoryLoadingOverlayPolicy.showsSpinner(armed = true, progress = 0.1)).isTrue()
    }
}
