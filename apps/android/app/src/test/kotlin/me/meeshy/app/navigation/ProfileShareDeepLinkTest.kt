package me.meeshy.app.navigation

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ProfileShareLink
import org.junit.Test

/**
 * `ProfileShareLink` generates `meeshy://u/{username}` and
 * `https://meeshy.me/u/{username}` links for "share profile" / the profile QR
 * code. `Routes.PROFILE_SHARE_APP_DEEP_LINK` / `PROFILE_SHARE_WEB_DEEP_LINK` are
 * the receiving half — the `navDeepLink` patterns registered on `PROFILE_USER`.
 * Before this pair existed, neither shape had a matching intent-filter/navDeepLink
 * at all: a shared or scanned profile link opened nothing on Android.
 *
 * These assert the generator and receiver stay in agreement rather than
 * exercising Compose Navigation's own URI-matching machinery (untested
 * elsewhere in this module — `navDeepLink`'s internals are Compose
 * Navigation's job, not ours to re-verify).
 */
class ProfileShareDeepLinkTest {

    @Test
    fun `the app-scheme nav pattern matches what ProfileShareLink generates`() {
        val generated = ProfileShareLink.appLink("bob")

        assertThat(Routes.PROFILE_SHARE_APP_DEEP_LINK.replace("{userId}", "bob"))
            .isEqualTo(generated)
    }

    @Test
    fun `the web nav pattern matches what ProfileShareLink generates`() {
        val generated = ProfileShareLink.webLink("bob")

        assertThat(Routes.PROFILE_SHARE_WEB_DEEP_LINK.replace("{userId}", "bob"))
            .isEqualTo(generated)
    }

    @Test
    fun `both nav patterns are rooted in the scheme, host and segment ProfileShareLink owns`() {
        assertThat(Routes.PROFILE_SHARE_APP_DEEP_LINK)
            .isEqualTo("${ProfileShareLink.APP_SCHEME}://${ProfileShareLink.USER_SEGMENT}/{userId}")
        assertThat(Routes.PROFILE_SHARE_WEB_DEEP_LINK)
            .isEqualTo("https://${ProfileShareLink.WEB_HOST}/${ProfileShareLink.USER_SEGMENT}/{userId}")
    }
}
