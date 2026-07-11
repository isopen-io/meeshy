package me.meeshy.app.profile

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.MeeshyUser
import org.junit.Test

/**
 * The profile-share presentation SSOT — projects a [MeeshyUser] into the exact
 * fields the share sheet renders (display name, `@handle`, web + app links). The
 * links delegate to [me.meeshy.sdk.model.ProfileShareLink] so QR/copy/share can
 * never diverge from the deep-link contract. Every branch through the public API.
 */
class ProfileShareBuilderTest {

    private fun user(
        username: String = "alice",
        firstName: String? = null,
        lastName: String? = null,
        displayName: String? = null,
    ): MeeshyUser = MeeshyUser(
        id = "u1",
        username = username,
        firstName = firstName,
        lastName = lastName,
        displayName = displayName,
    )

    @Test
    fun build_projects_all_four_fields_for_a_plain_user() {
        val share = ProfileShareBuilder.build(user(username = "bob", displayName = "Bob Marley"))

        assertThat(share).isNotNull()
        assertThat(share!!.displayName).isEqualTo("Bob Marley")
        assertThat(share.handle).isEqualTo("@bob")
        assertThat(share.webLink).isEqualTo("https://meeshy.me/u/bob")
        assertThat(share.appLink).isEqualTo("meeshy://u/bob")
    }

    @Test
    fun build_uses_the_effective_display_name_ladder_when_no_display_name() {
        val share = ProfileShareBuilder.build(user(username = "bob", firstName = "Bob", lastName = "M"))

        assertThat(share).isNotNull()
        assertThat(share!!.displayName).isEqualTo("Bob M")
    }

    @Test
    fun build_falls_back_to_the_username_for_the_display_name() {
        val share = ProfileShareBuilder.build(user(username = "bob"))

        assertThat(share).isNotNull()
        assertThat(share!!.displayName).isEqualTo("bob")
    }

    @Test
    fun build_handle_reflects_the_canonical_username() {
        val share = ProfileShareBuilder.build(user(username = "  @Bob "))

        assertThat(share).isNotNull()
        assertThat(share!!.handle).isEqualTo("@Bob")
        assertThat(share.webLink).isEqualTo("https://meeshy.me/u/Bob")
    }

    @Test
    fun build_encodes_a_non_ascii_username_in_the_links() {
        val share = ProfileShareBuilder.build(user(username = "josé"))

        assertThat(share).isNotNull()
        assertThat(share!!.handle).isEqualTo("@josé")
        assertThat(share.webLink).isEqualTo("https://meeshy.me/u/jos%C3%A9")
        assertThat(share.appLink).isEqualTo("meeshy://u/jos%C3%A9")
    }

    @Test
    fun build_returns_null_when_the_username_yields_no_shareable_handle() {
        assertThat(ProfileShareBuilder.build(user(username = "   "))).isNull()
        assertThat(ProfileShareBuilder.build(user(username = "@"))).isNull()
    }
}
