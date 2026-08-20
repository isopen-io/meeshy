package me.meeshy.app.navigation

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.CreatedShareLink
import me.meeshy.sdk.model.joinUrl
import org.junit.Test

/**
 * `CreatedShareLink.joinUrl(webOrigin)` / `MyShareLink.joinUrl(webOrigin)`
 * (`core:model`) build `{webOrigin}/chat/{identifier}` — the canonical share
 * page — `https://meeshy.me/chat/{identifier}` in production.
 * `Routes.GUEST_JOIN_CHAT_WEB_DEEP_LINK` is the receiving half — the
 * `navDeepLink` pattern registered alongside `meeshy://join/{identifier}` and
 * the legacy `https://meeshy.me/join/{identifier}` (kept for links already in
 * the wild; the web 308s them to `/chat`). Without the receiving half, an
 * invite link shared as the plain web URL these helpers produce would open a
 * browser instead of the app.
 */
class GuestJoinShareDeepLinkTest {

    @Test
    fun `the canonical chat nav pattern matches what CreatedShareLink joinUrl generates`() {
        val link = CreatedShareLink(
            id = "id-1",
            linkId = "abc123",
            conversationId = "conv-1",
            name = null,
            isActive = true,
        )
        val generated = link.joinUrl("https://meeshy.me")

        assertThat(Routes.GUEST_JOIN_CHAT_WEB_DEEP_LINK.replace("{identifier}", "abc123"))
            .isEqualTo(generated)
    }

    @Test
    fun `the canonical chat nav pattern is rooted at the production web origin`() {
        assertThat(Routes.GUEST_JOIN_CHAT_WEB_DEEP_LINK)
            .isEqualTo("https://meeshy.me/chat/{identifier}")
    }

    @Test
    fun `the legacy join nav pattern survives for links already in the wild`() {
        assertThat(Routes.GUEST_JOIN_WEB_DEEP_LINK).isEqualTo("https://meeshy.me/join/{identifier}")
    }
}
