package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import java.time.Instant
import org.junit.Test

/**
 * Behavioural spec for the pure [MyShareLink] presentation helpers — the
 * displayName fallback chain, the join-URL builder, and the expiry predicate.
 */
class MyShareLinkPresentationTest {

    private val now = Instant.parse("2026-07-25T12:00:00Z").toEpochMilli()

    private fun link(
        linkId: String = "link-1",
        identifier: String? = null,
        name: String? = null,
        expiresAt: String? = null,
    ) = MyShareLink(
        id = "id-1",
        linkId = linkId,
        identifier = identifier,
        name = name,
        expiresAt = expiresAt,
    )

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

    @Test
    fun isExpired_isFalseWhenExpiryAbsent() {
        assertThat(link(expiresAt = null).isExpired(now)).isFalse()
    }

    @Test
    fun isExpired_isFalseWhenExpiryBlank() {
        assertThat(link(expiresAt = "   ").isExpired(now)).isFalse()
    }

    @Test
    fun isExpired_isFalseForAFutureExpiry() {
        assertThat(link(expiresAt = "2026-07-26T12:00:00Z").isExpired(now)).isFalse()
    }

    @Test
    fun isExpired_isTrueForAPastExpiry() {
        assertThat(link(expiresAt = "2026-07-24T12:00:00Z").isExpired(now)).isTrue()
    }

    @Test
    fun isExpired_isFalseExactlyAtTheExpiryInstant() {
        assertThat(link(expiresAt = "2026-07-25T12:00:00Z").isExpired(now)).isFalse()
    }

    @Test
    fun isExpired_isFalseForAnUnparseableExpiry() {
        assertThat(link(expiresAt = "not-a-date").isExpired(now)).isFalse()
    }
}
