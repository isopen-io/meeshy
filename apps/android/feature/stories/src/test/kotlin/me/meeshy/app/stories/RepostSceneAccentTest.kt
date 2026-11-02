package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.flow.MutableStateFlow
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.story.toStoryGroups
import me.meeshy.sdk.story.toStoryItem
import org.junit.Test

/**
 * #14250 — une story reposté, incrustée dans une carte du fil, se lit sur le MÊME fond que dans le lecteur de stories : une
 * story publiée sans fond prend le dégradé que la barre des stories donne à son auteur, jamais un indigo constant.
 */
class RepostSceneAccentTest {
    private val session: SessionRepository = mockk(relaxed = true) { every { currentUser } returns MutableStateFlow(null) }
    private val viewModel = RepostSceneViewModel(session, MeeshyConfig(apiBaseUrl = "https://staging.meeshy.me/api/v1/"))
    private val projector = StorySlideProjector("https://staging.meeshy.me/api/v1/")

    private fun story(id: String, author: String): ApiPost =
        MeeshyApi.json.decodeFromString(ApiPost.serializer(), """{ "id": "$id", "type": "STORY", "author": $author }""")

    private fun fill(slide: StorySlideView): StorySceneFill = StorySceneFill.resolve(slide.background, slide.accentHex)

    @Test
    fun `a reposted story without a background reads on the gradient the story tray gives its author`() {
        listOf(
            story("s1", """{ "id": "u1", "username": "belva", "displayName": "Belva Nkoa" }""") to "Belva Nkoa",
            story("s2", """{ "id": "u2", "username": "recmod_m" }""") to "recmod_m",
        ).forEach { (post, label) ->
            val group = listOf(post).toStoryGroups().single()
            val viewer = projector.project(group.stories.single(), group.avatarColor, NoContentPreferences)

            val embedded = viewModel.repostSlideOf(post.toStoryItem(), authorName = label)

            assertThat(embedded.accentHex).isEqualTo(group.avatarColor)
            assertThat(fill(embedded)).isEqualTo(fill(viewer))
        }
    }

    @Test
    fun `two authors read on two gradients, and an unknown author on the one the tray gives a nameless story`() {
        val first = viewModel.repostSlideOf(story("s1", "null").toStoryItem(), authorName = "Belva Nkoa")
        val second = viewModel.repostSlideOf(story("s2", "null").toStoryItem(), authorName = "recmod_m")
        val nameless = viewModel.repostSlideOf(story("s3", "null").toStoryItem(), authorName = null)

        assertThat(first.accentHex).isNotEqualTo(second.accentHex)
        assertThat(nameless.accentHex).isEqualTo(listOf(story("s4", """{ "id": "u4", "username": "" }""")).toStoryGroups().single().avatarColor)
    }
}
