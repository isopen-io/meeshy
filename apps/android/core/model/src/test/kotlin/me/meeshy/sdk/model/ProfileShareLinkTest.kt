package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * The pure profile-share-link SSOT — builds the canonical cross-platform links
 * (web Universal Link + `meeshy://` custom scheme) that back "share profile" and
 * the profile QR code. The link shape mirrors the iOS `DeepLinkParser` contract
 * (`/u/{username}` and `meeshy://u/{username}`) so a QR/link produced on Android
 * resolves in every Meeshy client. Every branch is exercised through the public
 * API; percent-encoding is asserted via the emitted URLs, not a private helper.
 */
class ProfileShareLinkTest {

    private val L = ProfileShareLink

    // ----- canonicalUsername -----

    @Test
    fun canonical_username_passes_through_a_plain_handle() {
        assertThat(L.canonicalUsername("bob")).isEqualTo("bob")
    }

    @Test
    fun canonical_username_trims_surrounding_whitespace() {
        assertThat(L.canonicalUsername("  bob  ")).isEqualTo("bob")
    }

    @Test
    fun canonical_username_strips_a_leading_at_sign() {
        assertThat(L.canonicalUsername("@bob")).isEqualTo("bob")
    }

    @Test
    fun canonical_username_strips_at_sign_after_trimming() {
        assertThat(L.canonicalUsername("  @bob ")).isEqualTo("bob")
    }

    @Test
    fun canonical_username_of_blank_is_null() {
        assertThat(L.canonicalUsername("   ")).isNull()
    }

    @Test
    fun canonical_username_of_lone_at_sign_is_null() {
        assertThat(L.canonicalUsername("@")).isNull()
    }

    // ----- webLink -----

    @Test
    fun web_link_wraps_the_username_in_the_universal_link_path() {
        assertThat(L.webLink("bob")).isEqualTo("https://meeshy.me/u/bob")
    }

    @Test
    fun web_link_uses_the_canonical_username() {
        assertThat(L.webLink("  @Bob ")).isEqualTo("https://meeshy.me/u/Bob")
    }

    @Test
    fun web_link_of_blank_username_is_null() {
        assertThat(L.webLink("  ")).isNull()
    }

    @Test
    fun web_link_leaves_rfc3986_unreserved_characters_untouched() {
        assertThat(L.webLink("a.b-c_d~e")).isEqualTo("https://meeshy.me/u/a.b-c_d~e")
    }

    @Test
    fun web_link_percent_encodes_a_space() {
        assertThat(L.webLink("bo b")).isEqualTo("https://meeshy.me/u/bo%20b")
    }

    @Test
    fun web_link_percent_encodes_non_ascii_as_uppercase_utf8_bytes() {
        // 'é' is U+00E9 → UTF-8 0xC3 0xA9.
        assertThat(L.webLink("josé")).isEqualTo("https://meeshy.me/u/jos%C3%A9")
    }

    @Test
    fun web_link_percent_encodes_reserved_delimiters() {
        assertThat(L.webLink("a/b?c")).isEqualTo("https://meeshy.me/u/a%2Fb%3Fc")
    }

    // ----- appLink -----

    @Test
    fun app_link_wraps_the_username_in_the_custom_scheme_path() {
        assertThat(L.appLink("bob")).isEqualTo("meeshy://u/bob")
    }

    @Test
    fun app_link_uses_the_canonical_username_and_encodes_it() {
        assertThat(L.appLink(" @jo sé ")).isEqualTo("meeshy://u/jo%20s%C3%A9")
    }

    @Test
    fun app_link_of_blank_username_is_null() {
        assertThat(L.appLink("@")).isNull()
    }
}
