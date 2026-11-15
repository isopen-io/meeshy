package me.meeshy.app.navigation

import com.google.common.truth.Truth.assertThat
import me.meeshy.app.R
import me.meeshy.app.navigation.graph.CommunityRoutes
import org.junit.Test

class RouteTitlesTest {
    @Test
    fun `chaque route a son titre localise`() {
        assertThat(RouteTitles.titleRes(Routes.SETTINGS)).isEqualTo(R.string.route_title_settings)
        assertThat(RouteTitles.titleRes(CommunityRoutes.LIST)).isEqualTo(R.string.route_title_communities)
        assertThat(RouteTitles.titleRes(Routes.POST_DETAIL)).isEqualTo(R.string.route_title_post)
    }

    @Test
    fun `la requete d'une route ne change pas son titre`() {
        assertThat(RouteTitles.titleRes("feed/post/{postId}?commentId={commentId}")).isEqualTo(R.string.route_title_post)
    }

    @Test
    fun `une route sans titre propre retombe sur Conversations`() {
        assertThat(RouteTitles.titleRes(Routes.CHAT)).isNull()
        assertThat(RouteTitles.sceneTitleRes(Routes.CHAT)).isEqualTo(R.string.route_title_conversations)
        assertThat(RouteTitles.sceneTitleRes(null)).isEqualTo(R.string.route_title_conversations)
    }
}
