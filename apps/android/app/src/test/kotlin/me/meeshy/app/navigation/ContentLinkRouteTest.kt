package me.meeshy.app.navigation

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.PostType
import me.meeshy.sdk.model.contentcard.ContentCardProjection
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * Le toucher d'une carte de contenu (#19331) ouvre le contenu DANS l'app, à sa place, par la table du routeur de
 * liens : un post, une story et une humeur au détail du post, un réel au lecteur de réels.
 */
@RunWith(RobolectricTestRunner::class)
class ContentLinkRouteTest {

    private val id = "66f0c0ffee0000000000c0de"

    private fun routeOf(type: String) =
        ContentLinkRoute.of(ContentCardProjection.of(ApiPost(id = id, type = type), prefs = null, linkType = null))

    @Test
    fun `each genre opens where the deep-link router sends its address`() {
        assertThat(routeOf("POST")).isEqualTo(Routes.postDetail(id))
        assertThat(routeOf("STORY")).isEqualTo(Routes.postDetail(id))
        assertThat(routeOf("STATUS")).isEqualTo(Routes.postDetail(id))
        assertThat(routeOf("REEL")).isEqualTo(Routes.reels(id))
    }

    @Test
    fun `every genre has a route, none falls to the browser`() {
        PostType.entries.forEach { type -> assertThat(routeOf(type.name)).isNotNull() }
    }
}
