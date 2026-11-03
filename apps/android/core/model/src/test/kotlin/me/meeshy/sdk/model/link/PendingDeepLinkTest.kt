package me.meeshy.sdk.model.link

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.deeplink.DeepLinkDestination as D
import me.meeshy.sdk.model.deeplink.DeepLinkParser
import org.junit.Test

class PendingDeepLinkTest {
    private fun opens(raw: String) = PendingDeepLink.opensAfterSignIn(DeepLinkParser.parse(raw, "https://meeshy.me"))

    @Test
    fun `content links wait for the sign in`() {
        listOf(
            "https://meeshy.me/me", "https://meeshy.me/u/bob", "https://meeshy.me/c/abc", "https://meeshy.me/l/AbC123",
            "https://meeshy.me/feeds/post/p1", "https://meeshy.me/story/s1", "https://meeshy.me/reel/r1",
            "https://meeshy.me/community/k1", "https://meeshy.me/hashtag/paris", "https://meeshy.me/links",
            "meeshy://conversations/recent", "meeshy://conversations/unread", "meeshy://settings/packs",
        ).forEach { assertThat(opens(it)).isTrue() }
    }

    @Test
    fun `invitations, e-mail links, calls and foreign links do not wait`() {
        listOf(
            "https://meeshy.me/join/abc", "https://meeshy.me/chat/abc", "meeshy://call?contactId=c1&type=video",
            "https://meeshy.me/signup?ref=ABC", "https://meeshy.me/share?text=hi", "https://example.org/x",
        ).forEach { assertThat(opens(it)).isFalse() }
        assertThat(PendingDeepLink.opensAfterSignIn(D.MagicLink("t"))).isFalse()
        assertThat(PendingDeepLink.opensAfterSignIn(D.EmailVerificationLink("t", "a@b.c"))).isFalse()
        assertThat(PendingDeepLink.opensAfterSignIn(D.PasswordResetLink("t"))).isFalse()
    }
}
