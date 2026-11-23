package me.meeshy.app.navigation

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiAuthor
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.PostType
import me.meeshy.sdk.model.contentcard.ContentCardProjection
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * Le toucher d'une carte de contenu (#19331, #20233) ouvre le contenu DANS l'app, là où il vit : le post dans sa vue, la
 * story dans la visionneuse de son auteur, l'humeur en plein écran, le réel dans la vue des réels.
 */
@RunWith(RobolectricTestRunner::class)
class ContentLinkRouteTest {

    private val id = "66f0c0ffee0000000000c0de"

    private val authorId = "6ada27bf28983c39d9838be9"

    private fun routeOf(type: String, author: ApiAuthor? = ApiAuthor(id = authorId, username = "amani")) =
        ContentLinkRoute.of(ContentCardProjection.of(ApiPost(id = id, type = type, author = author), prefs = null, linkType = null))

    @Test
    fun `each genre opens where it lives`() {
        assertThat(routeOf("POST")).isEqualTo(Routes.postDetail(id))
        assertThat(routeOf("STORY")).isEqualTo(Routes.story(authorId, id))
        assertThat(routeOf("STATUS")).isEqualTo(Routes.moodSpotlight(id))
        assertThat(routeOf("REEL")).isEqualTo(Routes.reels(id))
    }

    @Test
    fun `a story whose author is not served opens at its post, never nowhere`() {
        assertThat(routeOf("STORY", author = null)).isEqualTo(Routes.postDetail(id))
    }

    @Test
    fun `every genre has a route, none falls to the browser`() {
        PostType.entries.forEach { type -> assertThat(routeOf(type.name)).isNotNull() }
    }
}
