package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class PostMediaPresentationTest {
    @Test
    fun `un reel glisse en diapositives horizontales`() {
        assertThat(PostMediaPresentation.defaultFor(PostType.REEL))
            .isEqualTo(PostMediaPresentation.HORIZONTAL_SLIDES)
    }

    @Test
    fun `les autres types de publication defilent en carrousel`() {
        listOf(PostType.POST, PostType.STORY, PostType.STATUS).forEach {
            assertThat(PostMediaPresentation.defaultFor(it)).isEqualTo(PostMediaPresentation.CAROUSEL)
        }
    }
}
