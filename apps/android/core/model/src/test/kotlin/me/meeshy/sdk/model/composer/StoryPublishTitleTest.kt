package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class StoryPublishTitleTest {

    @Test
    fun `une slide publie la story`() {
        assertThat(StoryPublishTitle.of(slideCount = 1, alsoAsReel = false))
            .isEqualTo(StoryPublishTitle.Single)
    }

    @Test
    fun `plusieurs slides disent combien de stories partent`() {
        assertThat(StoryPublishTitle.of(slideCount = 3, alsoAsReel = false))
            .isEqualTo(StoryPublishTitle.Many(3))
    }

    @Test
    fun `zero slide ne fabrique pas un compte nul`() {
        assertThat(StoryPublishTitle.of(slideCount = 0, alsoAsReel = false))
            .isEqualTo(StoryPublishTitle.Single)
    }

    @Test
    fun `la story et son reel se nomment ensemble`() {
        assertThat(StoryPublishTitle.of(slideCount = 1, alsoAsReel = true))
            .isEqualTo(StoryPublishTitle.StoryAndReel)
    }
}
