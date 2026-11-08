package me.meeshy.sdk.model.story

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryEffects
import org.junit.Test

class StorySentinelPolicyTest {
    @Test
    fun `un kind reserve rend la story impeignable`() {
        assertThat(StorySentinelPolicy.currentStoryIsUnpaintable(StoryEffects(unpaintableKinds = listOf("poll")))).isTrue()
    }

    @Test
    fun `une scene ordinaire ou absente se peint`() {
        assertThat(StorySentinelPolicy.currentStoryIsUnpaintable(StoryEffects())).isFalse()
        assertThat(StorySentinelPolicy.currentStoryIsUnpaintable(null)).isFalse()
    }

    @Test
    fun `mettre a jour ouvre la fiche Play Store de la porte de mise a jour`() {
        assertThat(StorySentinelPolicy.STORE_URL).startsWith("https://play.google.com/store/apps/details?id=")
    }
}
