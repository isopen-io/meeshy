package me.meeshy.sdk.model.story

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class StoryTrayPreloadPlanTest {
    private fun story(url: String, viewed: Boolean = false) =
        StoryPreloadStory(viewed, listOf(StoryPreloadMedia(url, null)))

    @Test
    fun `la premiere passe prend la premiere slide non vue de huit groupes au plus`() {
        val groups = (0 until 10).map { g -> listOf(story("v$g", viewed = true), story("u$g"), story("w$g")) }
        val first = StoryTrayPreloadPlan.firstSlides(groups)
        assertThat(first.map { it.media.first().url }).containsExactly("u0", "u1", "u2", "u3", "u4", "u5", "u6", "u7").inOrder()
    }

    @Test
    fun `un groupe entierement vu retombe sur sa premiere slide`() {
        val groups = listOf(listOf(story("a", true), story("b", true)))
        assertThat(StoryTrayPreloadPlan.firstSlides(groups).single().media.single().url).isEqualTo("a")
    }

    @Test
    fun `la seconde passe prend quatre slides apres la premiere non vue`() {
        val groups = listOf((0 until 7).map { story("s$it", viewed = it < 1) })
        val urls = StoryTrayPreloadPlan.upcomingSlides(groups).map { it.media.single().url }
        assertThat(urls).containsExactly("s2", "s3", "s4", "s5").inOrder()
    }

    @Test
    fun `un groupe sans story non vue saute seulement la premiere`() {
        val groups = listOf((0 until 3).map { story("s$it", viewed = true) })
        assertThat(StoryTrayPreloadPlan.upcomingSlides(groups).map { it.media.single().url }).containsExactly("s1", "s2").inOrder()
    }

    @Test
    fun `les groupes au dela du huitieme ne sont pas prechargés`() {
        val groups = (0 until 9).map { listOf(story("a$it"), story("b$it")) }
        assertThat(StoryTrayPreloadPlan.upcomingSlides(groups)).hasSize(8)
    }
}
