package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural spec for the pure [CreatedShareLink] presentation helpers — the label
 * fallback chain and the join-URL builder surfaced on the creation-success sheet.
 */
class CreatedShareLinkPresentationTest {

    private fun created(
        linkId: String = "link-1",
        name: String? = null,
    ) = CreatedShareLink(
        id = "id-1",
        linkId = linkId,
        conversationId = "conv-1",
        name = name,
        isActive = true,
    )

    @Test
    fun displayName_prefersTheName() {
        assertThat(created(name = "Launch party").displayName).isEqualTo("Launch party")
    }

    @Test
    fun displayName_fallsBackToTheLinkIdWhenNameIsNull() {
        assertThat(created(linkId = "abc123", name = null).displayName).isEqualTo("abc123")
    }

    @Test
    fun displayName_fallsBackToTheLinkIdWhenNameIsBlank() {
        assertThat(created(linkId = "abc123", name = "   ").displayName).isEqualTo("abc123")
    }

    @Test
    fun joinUrl_buildsFromTheWebOriginAndLinkId() {
        assertThat(created(linkId = "abc123").joinUrl("https://meeshy.me"))
            .isEqualTo("https://meeshy.me/join/abc123")
    }

    @Test
    fun joinUrl_dropsATrailingSlashOnTheOriginSoThePathNeverDoubles() {
        assertThat(created(linkId = "abc123").joinUrl("https://meeshy.me/"))
            .isEqualTo("https://meeshy.me/join/abc123")
    }
}
