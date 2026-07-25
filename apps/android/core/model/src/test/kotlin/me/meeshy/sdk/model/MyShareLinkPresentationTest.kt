package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural spec for the pure [MyShareLink] presentation helpers — the
 * displayName fallback chain and the join-URL builder.
 */
class MyShareLinkPresentationTest {

    private fun link(
        linkId: String = "link-1",
        identifier: String? = null,
        name: String? = null,
    ) = MyShareLink(id = "id-1", linkId = linkId, identifier = identifier, name = name)

    @Test
    fun displayName_prefersTheName() {
        assertThat(link(name = "Launch party", identifier = "party").displayName)
            .isEqualTo("Launch party")
    }

    @Test
    fun displayName_fallsBackToIdentifierWhenNameAbsent() {
        assertThat(link(name = null, identifier = "party").displayName).isEqualTo("party")
    }

    @Test
    fun displayName_fallsBackToLinkIdWhenNameAndIdentifierAbsent() {
        assertThat(link(name = null, identifier = null, linkId = "link-9").displayName)
            .isEqualTo("link-9")
    }

    @Test
    fun displayName_treatsBlankNameAndIdentifierAsAbsent() {
        assertThat(link(name = "   ", identifier = "", linkId = "link-9").displayName)
            .isEqualTo("link-9")
    }

    @Test
    fun joinUrl_usesTheIdentifierWhenPresent() {
        assertThat(link(identifier = "party", linkId = "link-1").joinUrl("https://meeshy.me"))
            .isEqualTo("https://meeshy.me/join/party")
    }

    @Test
    fun joinUrl_fallsBackToLinkIdWhenIdentifierBlank() {
        assertThat(link(identifier = "  ", linkId = "link-1").joinUrl("https://meeshy.me"))
            .isEqualTo("https://meeshy.me/join/link-1")
    }

    @Test
    fun joinUrl_dropsATrailingSlashOnTheWebOrigin() {
        assertThat(link(identifier = "party").joinUrl("https://meeshy.me/"))
            .isEqualTo("https://meeshy.me/join/party")
    }
}
