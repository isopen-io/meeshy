package me.meeshy.sdk.model.licenses

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * [OpenSourceLicenseResolver] is the Android port of the iOS `LicensesView`'s `if let URL(string:)`
 * card guard: a license only renders as a tappable repository card when its URL is a launchable
 * `http(s)://` link. Unlike Help & Support (which also opens `mailto:` compose links), the licenses
 * screen only ever opens repository web pages, so `mailto:`/other schemes are dropped. These tests
 * pin the kept schemes, the drop branches (blank, wrong scheme, schemeless), the trim/case-fold, and
 * the order-preserving keep path.
 */
class OpenSourceLicenseResolverTest {

    private fun license(url: String, name: String = "Lib") =
        OpenSourceLicense(name = name, author = "Author", type = OpenSourceLicenseType.MIT, url = url)

    @Test
    fun resolvable_emptyList_isEmpty() {
        assertThat(OpenSourceLicenseResolver.resolvable(emptyList())).isEmpty()
    }

    @Test
    fun resolvable_httpsUrl_isKept() {
        val kept = license("https://github.com/coil-kt/coil")
        assertThat(OpenSourceLicenseResolver.resolvable(listOf(kept))).containsExactly(kept)
    }

    @Test
    fun resolvable_httpUrl_isKept() {
        val kept = license("http://webrtc.org")
        assertThat(OpenSourceLicenseResolver.resolvable(listOf(kept))).containsExactly(kept)
    }

    @Test
    fun resolvable_uppercaseScheme_isKept() {
        val kept = license("HTTPS://github.com/square/okhttp")
        assertThat(OpenSourceLicenseResolver.resolvable(listOf(kept))).containsExactly(kept)
    }

    @Test
    fun resolvable_paddedUrl_isKept() {
        val kept = license("  https://dagger.dev/hilt  ")
        assertThat(OpenSourceLicenseResolver.resolvable(listOf(kept))).containsExactly(kept)
    }

    @Test
    fun resolvable_blankUrl_isDropped() {
        assertThat(OpenSourceLicenseResolver.resolvable(listOf(license("   ")))).isEmpty()
    }

    @Test
    fun resolvable_mailtoScheme_isDropped() {
        assertThat(OpenSourceLicenseResolver.resolvable(listOf(license("mailto:legal@meeshy.me"))))
            .isEmpty()
    }

    @Test
    fun resolvable_schemelessString_isDropped() {
        assertThat(OpenSourceLicenseResolver.resolvable(listOf(license("github.com/square/retrofit"))))
            .isEmpty()
    }

    @Test
    fun resolvable_mixedList_keepsOnlyLaunchableInOrder() {
        val coil = license("https://github.com/coil-kt/coil", "Coil")
        val bad = license("javascript:alert(1)", "Bad")
        val okhttp = license("https://github.com/square/okhttp", "OkHttp")

        assertThat(OpenSourceLicenseResolver.resolvable(listOf(coil, bad, okhttp)))
            .containsExactly(coil, okhttp)
            .inOrder()
    }
}
