package me.meeshy.app.navigation

import com.google.common.truth.Truth.assertThat
import me.meeshy.app.feed.PostDetailViewModel
import me.meeshy.sdk.model.PostShareLink
import org.junit.Test

/**
 * [PostShareLink] generates the link every client shares; [Routes.POST_SHARE_DEEP_LINKS] are
 * the receiving `navDeepLink` patterns on the post-detail route. Before them, a shared post
 * link opened the browser on Android. Same generator-versus-receiver contract as
 * [ProfileShareDeepLinkTest].
 */
class PostShareDeepLinkTest {

    private val argument = "{${PostDetailViewModel.POST_ID_ARG}}"

    @Test
    fun `the canonical pattern matches what PostShareLink generates`() {
        val generated = PostShareLink.webLink("p42")

        assertThat(Routes.POST_SHARE_DEEP_LINKS.map { it.replace(argument, "p42") })
            .contains(generated)
    }

    @Test
    fun `the legacy tracked-link shape and the www host also open the detail`() {
        assertThat(Routes.POST_SHARE_DEEP_LINKS).containsExactly(
            "https://meeshy.me/feeds/post/$argument",
            "https://meeshy.me/post/$argument",
            "https://www.meeshy.me/feeds/post/$argument",
            "https://www.meeshy.me/post/$argument",
        )
    }

    @Test
    fun `the patterns land on the post-detail route argument`() {
        assertThat(Routes.POST_DETAIL).endsWith(argument)
    }
}
