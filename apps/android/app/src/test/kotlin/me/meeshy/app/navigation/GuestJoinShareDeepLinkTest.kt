package me.meeshy.app.navigation

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.CreatedShareLink
import me.meeshy.sdk.model.joinUrl
import org.junit.Test

/**
 * `CreatedShareLink.joinUrl(webOrigin)` / `MyShareLink.joinUrl(webOrigin)`
 * (`core:model`) build `{webOrigin}/join/{identifier}` — `https://meeshy.me/join/
 * {identifier}` in production. `Routes.GUEST_JOIN_WEB_DEEP_LINK` is the receiving
 * half — the `navDeepLink` pattern registered alongside the pre-existing
 * `meeshy://join/{identifier}` on `GUEST_JOIN`. Before it existed, a conversation
 * invite link shared as the plain web URL these helpers produce opened a browser
 * instead of the app.
 */
class GuestJoinShareDeepLinkTest {

    @Test
    fun `the web nav pattern matches what CreatedShareLink joinUrl generates`() {
        val link = CreatedShareLink(
            id = "id-1",
            linkId = "abc123",
            conversationId = "conv-1",
            name = null,
            isActive = true,
        )
        val generated = link.joinUrl("https://meeshy.me")

        assertThat(Routes.GUEST_JOIN_WEB_DEEP_LINK.replace("{identifier}", "abc123"))
            .isEqualTo(generated)
    }

    @Test
    fun `the web nav pattern is rooted at the production web origin and the join segment`() {
        assertThat(Routes.GUEST_JOIN_WEB_DEEP_LINK).isEqualTo("https://meeshy.me/join/{identifier}")
    }
}
