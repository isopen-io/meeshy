package me.meeshy.sdk.model.about

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * [AboutLinkResolver] mirrors the iOS `linkRow`'s `if let URL(string:)` guard: only links whose URL
 * is a non-blank http(s) target survive, so an `Intent.ACTION_VIEW` always has something launchable.
 * These tests pin the drop branches (blank, wrong scheme) and the order-preserving keep path.
 */
class AboutLinkResolverTest {

    private fun link(url: String, kind: AboutLinkKind = AboutLinkKind.WEBSITE) = AboutLink(kind, url)

    @Test
    fun resolvable_emptyList_isEmpty() {
        assertThat(AboutLinkResolver.resolvable(emptyList())).isEmpty()
    }

    @Test
    fun resolvable_httpsUrl_isKept() {
        val kept = link("https://meeshy.me")
        assertThat(AboutLinkResolver.resolvable(listOf(kept))).containsExactly(kept)
    }

    @Test
    fun resolvable_httpUrl_isKept() {
        val kept = link("http://meeshy.me")
        assertThat(AboutLinkResolver.resolvable(listOf(kept))).containsExactly(kept)
    }

    @Test
    fun resolvable_uppercaseScheme_isKept() {
        val kept = link("HTTPS://meeshy.me")
        assertThat(AboutLinkResolver.resolvable(listOf(kept))).containsExactly(kept)
    }

    @Test
    fun resolvable_paddedHttpsUrl_isKept() {
        val kept = link("  https://meeshy.me  ")
        assertThat(AboutLinkResolver.resolvable(listOf(kept))).containsExactly(kept)
    }

    @Test
    fun resolvable_blankUrl_isDropped() {
        assertThat(AboutLinkResolver.resolvable(listOf(link("   ")))).isEmpty()
    }

    @Test
    fun resolvable_nonHttpScheme_isDropped() {
        assertThat(AboutLinkResolver.resolvable(listOf(link("ftp://meeshy.me")))).isEmpty()
    }

    @Test
    fun resolvable_schemelessString_isDropped() {
        assertThat(AboutLinkResolver.resolvable(listOf(link("meeshy.me")))).isEmpty()
    }

    @Test
    fun resolvable_mixedList_keepsOnlyLaunchableInOrder() {
        val web = link("https://meeshy.me", AboutLinkKind.WEBSITE)
        val bad = link("javascript:alert(1)", AboutLinkKind.TWITTER)
        val gh = link("http://github.com/meeshy", AboutLinkKind.GITHUB)

        assertThat(AboutLinkResolver.resolvable(listOf(web, bad, gh)))
            .containsExactly(web, gh)
            .inOrder()
    }
}
