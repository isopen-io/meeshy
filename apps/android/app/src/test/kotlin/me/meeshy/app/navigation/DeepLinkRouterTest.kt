package me.meeshy.app.navigation

import com.google.common.truth.Truth.assertThat
import me.meeshy.app.navigation.graph.CommunityRoutes
import me.meeshy.app.navigation.graph.GameRoutes
import me.meeshy.app.navigation.graph.LinksRoutes
import me.meeshy.sdk.model.deeplink.DeepLinkDestination as D
import me.meeshy.sdk.model.deeplink.GameLink
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** La table destination -> action : AUCUNE destination du parseur ne reste muette. */
@RunWith(RobolectricTestRunner::class)
class DeepLinkRouterTest {

    private fun navigate(route: String) = DeepLinkAction.Navigate(route)

    private val table: List<Pair<D, DeepLinkAction>> = listOf(
        D.OwnProfile to navigate(ProfileRoutes.OWN),
        D.UserProfile("bob") to navigate("profile/bob"),
        D.Conversation("c1") to DeepLinkAction.OpenConversation("c1"),
        D.Conversation("c1", "salut") to DeepLinkAction.OpenDraft("c1", "salut"),
        D.JoinLink("abc") to navigate("join/abc"),
        D.ChatLink("abc") to navigate("join/abc"),
        D.TrackedLink("AbC123") to DeepLinkAction.ResolveTrackedLink("AbC123"),
        D.Post("p1") to navigate(Routes.postDetail("p1")),
        D.PostDetail("p1") to navigate(Routes.postDetail("p1")),
        D.StoryDetail("s1") to navigate(Routes.postDetail("s1")),
        D.Reel("r1") to navigate("reels?seed=r1"),
        D.Community("k1") to navigate(CommunityRoutes.detail("k1")),
        D.RecentConversation to DeepLinkAction.OpenRecentConversation,
        D.UnreadConversations to DeepLinkAction.OpenUnreadConversations,
        D.Hashtag("paris") to navigate("hashtag/paris"),
        D.Referral("CODE") to DeepLinkAction.RememberReferral("CODE"),
        D.UserLinks to navigate(LinksRoutes.HUB),
        D.Game(GameLink.Season(3)) to navigate(GameRoutes.PROGRESSION),
        D.Game(GameLink.LeagueWeek(null)) to navigate(GameRoutes.PROGRESSION),
        D.PackShop("sticker", "pack-1") to navigate(Routes.packShop("sticker", "pack-1")),
        D.Share("hi", null) to navigate(Routes.CONVERSATIONS),
        D.Call("c1", isVideo = true) to DeepLinkAction.HandledAtLaunch,
        D.MagicLink("t") to DeepLinkAction.HandledAtLaunch,
        D.EmailVerificationLink("t", "a@b.c") to DeepLinkAction.HandledAtLaunch,
        D.PasswordResetLink("t") to DeepLinkAction.HandledAtLaunch,
        D.External("https://example.org") to DeepLinkAction.OpenInBrowser("https://example.org"),
    )

    @Test
    fun `every destination has a treatment`() {
        table.forEach { (destination, expected) -> assertThat(DeepLinkRouter.action(destination)).isEqualTo(expected) }
    }

    @Test
    fun `links the graph does not read belong to the root`() {
        listOf(
            "https://meeshy.me/hashtag/paris", "https://meeshy.me/community/k1", "https://meeshy.me/c/abc",
            "https://meeshy.me/conversation/abc", "https://meeshy.me/l/AbC123", "https://meeshy.me/p/p1",
            "https://meeshy.me/s/s1", "https://meeshy.me/users/bob", "https://meeshy.me/me", "https://meeshy.me/reels?seed=r1",
            "meeshy://conversations/recent", "meeshy://conversations/unread", "meeshy://quickreply/c1?text=hi",
            "meeshy://send?contactId=c1&message=hi", "meeshy://contact/c1", "https://meeshy.me/signup?ref=CODE",
        ).forEach { assertThat(DeepLinkRouter.ownsLink(it)).isTrue() }
    }

    @Test
    fun `links the graph reads, e-mail links, calls and foreign links stay out of the root`() {
        listOf(
            "meeshy://conversation/abc", "https://meeshy.me/u/bob", "https://meeshy.me/feeds/post/p1",
            "https://meeshy.me/story/s1", "https://meeshy.me/reel/r1", "https://meeshy.me/links", "https://meeshy.me/join/abc",
            "https://meeshy.me/chat/abc", "meeshy://settings/packs?domaine=sticker",
            "https://meeshy.me/auth/magic-link?token=abc", "meeshy://call?contactId=c1&type=video", "https://example.org/x",
        ).forEach { assertThat(DeepLinkRouter.ownsLink(it)).isFalse() }
    }
}
