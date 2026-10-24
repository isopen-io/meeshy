package me.meeshy.sdk.model.deeplink

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.deeplink.DeepLinkDestination as D
import org.junit.Test

class DeepLinkParserTest {

    private fun parse(raw: String) = DeepLinkParser.parse(raw, "https://meeshy.me")

    private fun assertExternal(raw: String) = assertThat(parse(raw)).isEqualTo(D.External(raw))

    @Test
    fun `own profile and links hub read the same on the web and the custom scheme`() {
        assertThat(parse("https://meeshy.me/me")).isEqualTo(D.OwnProfile)
        assertThat(parse("meeshy://me")).isEqualTo(D.OwnProfile)
        assertThat(parse("https://meeshy.me/links")).isEqualTo(D.UserLinks)
        assertThat(parse("meeshy://links")).isEqualTo(D.UserLinks)
    }

    @Test
    fun `user profile accepts u and users and decodes the handle`() {
        assertThat(parse("https://meeshy.me/u/testuser123")).isEqualTo(D.UserProfile("testuser123"))
        assertThat(parse("https://meeshy.me/users/bob")).isEqualTo(D.UserProfile("bob"))
        assertThat(parse("meeshy://u/user%20name%40test")).isEqualTo(D.UserProfile("user name@test"))
        assertExternal("meeshy://u/")
        assertExternal("https://meeshy.me/u")
    }

    @Test
    fun `conversation aliases agree on both schemes`() {
        listOf("c", "conversation").forEach { alias ->
            assertThat(parse("meeshy://$alias/conv_$alias")).isEqualTo(D.Conversation("conv_$alias"))
            assertThat(parse("https://meeshy.me/$alias/conv_$alias")).isEqualTo(D.Conversation("conv_$alias"))
        }
        assertExternal("meeshy://c/")
        assertExternal("https://meeshy.me/c/%20")
    }

    @Test
    fun `join chat and tracked links are three distinct destinations`() {
        assertThat(parse("https://meeshy.me/join/inv1")).isEqualTo(D.JoinLink("inv1"))
        assertThat(parse("meeshy://Join/inv3")).isEqualTo(D.JoinLink("inv3"))
        assertThat(parse("https://meeshy.me/chat/chat1")).isEqualTo(D.ChatLink("chat1"))
        assertThat(parse("meeshy://chat/chat2")).isEqualTo(D.ChatLink("chat2"))
        assertThat(parse("https://meeshy.me/l/abc123")).isEqualTo(D.TrackedLink("abc123"))
        assertExternal("https://meeshy.me/join/%20")
        assertExternal("https://meeshy.me/join/")
    }

    @Test
    fun `posts stories and reels accept their aliases`() {
        assertThat(parse("https://meeshy.me/feeds/post/p1")).isEqualTo(D.PostDetail("p1"))
        assertThat(parse("https://meeshy.me/feeds/p/p2")).isEqualTo(D.PostDetail("p2"))
        assertThat(parse("meeshy://post/p3")).isEqualTo(D.PostDetail("p3"))
        assertThat(parse("meeshy://p/p4")).isEqualTo(D.PostDetail("p4"))
        assertThat(parse("meeshy://feeds/p/p5")).isEqualTo(D.PostDetail("p5"))
        listOf("story", "stories", "s").forEach {
            assertThat(parse("https://meeshy.me/$it/s1")).isEqualTo(D.StoryDetail("s1"))
            assertThat(parse("meeshy://$it/s2")).isEqualTo(D.StoryDetail("s2"))
        }
        assertThat(parse("https://meeshy.me/reel/r1")).isEqualTo(D.Reel("r1"))
        assertThat(parse("https://meeshy.me/reel/r3?seed=autre")).isEqualTo(D.Reel("r3"))
        assertThat(parse("https://meeshy.me/reels?seed=r4")).isEqualTo(D.Reel("r4"))
        assertThat(parse("meeshy://reel/r5")).isEqualTo(D.Reel("r5"))
        assertExternal("https://meeshy.me/reels")
        assertExternal("https://meeshy.me/feeds")
        assertExternal("https://meeshy.me/feeds/list/x")
        assertExternal("meeshy://p/%20")
    }

    @Test
    fun `communities hashtags and conversation lists`() {
        assertThat(parse("https://meeshy.me/communities/cm1")).isEqualTo(D.Community("cm1"))
        assertThat(parse("meeshy://community/cm2")).isEqualTo(D.Community("cm2"))
        assertExternal("https://meeshy.me/communities/new")
        assertThat(parse("https://meeshy.me/hashtag/paris")).isEqualTo(D.Hashtag("paris"))
        assertThat(parse("meeshy://hashtag/soleil")).isEqualTo(D.Hashtag("soleil"))
        assertExternal("https://meeshy.me/hashtag/")
        assertThat(parse("meeshy://conversations/recent")).isEqualTo(D.RecentConversation)
        assertThat(parse("meeshy://conversations/unread")).isEqualTo(D.UnreadConversations)
        assertExternal("meeshy://conversations/other")
        assertExternal("https://meeshy.me/conversations/unread")
    }

    @Test
    fun `share reads text and url from the query`() {
        assertThat(parse("meeshy://share?text=Hello%20World&url=https://example.com"))
            .isEqualTo(D.Share("Hello World", "https://example.com"))
        assertThat(parse("meeshy://share?text=OnlyText")).isEqualTo(D.Share("OnlyText", null))
        assertThat(parse("https://meeshy.me/share?url=https://example.com/page")).isEqualTo(D.Share(null, "https://example.com/page"))
        assertThat(parse("meeshy://share")).isEqualTo(D.Share(null, null))
    }

    @Test
    fun `widget and shortcut surfaces read only under the custom scheme`() {
        assertThat(parse("meeshy://contact/c1")).isEqualTo(D.Conversation("c1"))
        assertThat(parse("meeshy://quickreply/c1?text=salut")).isEqualTo(D.Conversation("c1", "salut"))
        assertThat(parse("meeshy://send?contactId=c1&message=salut")).isEqualTo(D.Conversation("c1", "salut"))
        assertThat(parse("meeshy://send?contactId=c1")).isEqualTo(D.Conversation("c1", null))
        assertExternal("https://meeshy.me/contact/c1")
        assertExternal("https://meeshy.me/quickreply/c1")
        assertExternal("https://meeshy.me/send?contactId=c1")
    }

    @Test
    fun `call shortcut is read from the custom scheme only`() {
        assertThat(parse("meeshy://call?contactId=conv1&type=video")).isEqualTo(D.Call("conv1", true))
        assertThat(parse("meeshy://call?contactId=conv1&type=audio")).isEqualTo(D.Call("conv1", false))
        listOf("meeshy://call", "meeshy://call?contactId=%20", "meeshy://call/end", "meeshy://call/mute")
            .forEach { assertExternal(it) }
        assertExternal("https://meeshy.me/call?contactId=conv1&type=video")
    }

    @Test
    fun `referral links read the path code then the query keys in web order`() {
        listOf(
            "https://meeshy.me/signup/affiliate/aff_1234567890_abc",
            "https://app.meeshy.me/signup/affiliate/aff_1234567890_abc",
            "https://www.meeshy.me/signup/affiliate/aff_1234567890_abc/",
        ).forEach { assertThat(parse(it)).isEqualTo(D.Referral("aff_1234567890_abc")) }
        assertThat(parse("meeshy://signup/affiliate/ref_XyZ")).isEqualTo(D.Referral("ref_XyZ"))
        assertThat(parse("https://meeshy.me/signup?ref=aff_1")).isEqualTo(D.Referral("aff_1"))
        assertThat(parse("https://meeshy.me/signup?parrain=aff_2")).isEqualTo(D.Referral("aff_2"))
        assertThat(parse("meeshy://signup?affiliate=aff_3")).isEqualTo(D.Referral("aff_3"))
        assertThat(parse("https://meeshy.me/signup?affiliate=aff_3&ref=aff_1")).isEqualTo(D.Referral("aff_1"))
        listOf(
            "https://meeshy.me/signup", "https://meeshy.me/signup/affiliate/%20",
            "https://meeshy.me/signup?ref=deux%20mots", "https://meeshy.me/signup/other/aff_1",
        ).forEach { assertExternal(it) }
    }

    @Test
    fun `pack shop reads a known domain and a normalized pack slug`() {
        assertThat(parse("meeshy://settings/packs?domaine=wallpaper")).isEqualTo(D.PackShop("wallpaper"))
        assertThat(parse("meeshy://settings/packs?domaine=avatar-ring")).isEqualTo(D.PackShop("avatar-ring"))
        assertThat(parse("meeshy://settings/packs")).isEqualTo(D.PackShop(null))
        assertThat(parse("meeshy://settings/packs?domaine=hologramme")).isEqualTo(D.PackShop(null))
        assertThat(parse("meeshy://settings/packs?domaine=sticker&pack=chats-de-paris")).isEqualTo(D.PackShop("sticker", "chats-de-paris"))
        assertThat(parse("meeshy://settings/packs?pack=Chats-De-Paris")).isEqualTo(D.PackShop(null, "chats-de-paris"))
        assertThat(parse("meeshy://settings/packs?pack=../etc")).isEqualTo(D.PackShop(null, null))
        assertThat(parse("meeshy://settings/packs?pack=")).isEqualTo(D.PackShop(null, null))
        assertExternal("meeshy://settings/autre")
        assertExternal("https://meeshy.me/settings/packs")
    }

    @Test
    fun `the custom scheme never reads a link that connects`() {
        assertExternal("meeshy://auth/magic-link?token=abc123xyz")
        assertExternal("meeshy://auth/magic-link?token=")
        assertExternal("meeshy://auth/magic-link")
        assertExternal("meeshy://reset-password#token=r")
    }

    @Test
    fun `unknown paths foreign hosts and malformed input are external and never throw`() {
        listOf(
            "meeshy://unknown/path", "meeshy://", "https://meeshy.me/", "https://meeshy.me/unknown/deep/path",
            "https://example.com/c/abc", "ftp://meeshy.me/c/abc", "mailto:a@b.co", "", "   ", "not a url",
            "https://", "http://:80/c/x", "https://meeshy.me:abc/c/x", "://x", "%%%",
        ).forEach { assertThat(parse(it)).isInstanceOf(D.External::class.java) }
    }

    @Test
    fun `every link produces exactly the same destination on both schemes for the shared forms`() {
        val shared = listOf("me", "links", "u/a", "c/b", "join/c", "chat/d", "post/e", "story/f", "reel/g", "hashtag/h")
        shared.forEach { assertThat(parse("meeshy://$it")).isEqualTo(parse("https://meeshy.me/$it")) }
    }

    @Test
    fun `isMeeshyDeepLink claims routes and leaves external urls to the browser`() {
        assertThat(DeepLinkParser.isMeeshyDeepLink("https://meeshy.me/reel/r6", "https://meeshy.me")).isTrue()
        assertThat(DeepLinkParser.isMeeshyDeepLink("https://meeshy.me/me/progression/saison/4", "https://meeshy.me")).isTrue()
        assertThat(DeepLinkParser.isMeeshyDeepLink("https://example.com/c/1", "https://meeshy.me")).isFalse()
    }

    @Test
    fun `segment aliases are the single source`() {
        assertThat(listOf("post", "p").all(DeepLinkParser::isPostSegment)).isTrue()
        assertThat(DeepLinkParser.isPostSegment("posts")).isFalse()
        assertThat(listOf("story", "stories", "s").all(DeepLinkParser::isStorySegment)).isTrue()
        assertThat(listOf("u", "users").all(DeepLinkParser::isUserSegment)).isTrue()
    }
}
