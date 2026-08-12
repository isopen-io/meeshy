package me.meeshy.sdk.model.support

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * [SupportLinkResolver] mirrors the iOS `supportLink`'s `if let URL(string:)` guard, widened to the
 * Help & Support surface which mixes web pages and `mailto:` compose links. These tests pin the
 * launchable schemes (http/https/mailto), the drop branches (blank, wrong scheme), and the
 * order-preserving keep path.
 */
class SupportLinkResolverTest {

    private fun link(url: String, kind: SupportLinkKind = SupportLinkKind.HELP_CENTER) =
        SupportLink(kind, url)

    @Test
    fun resolvable_emptyList_isEmpty() {
        assertThat(SupportLinkResolver.resolvable(emptyList())).isEmpty()
    }

    @Test
    fun resolvable_httpsUrl_isKept() {
        val kept = link("https://meeshy.me/help")
        assertThat(SupportLinkResolver.resolvable(listOf(kept))).containsExactly(kept)
    }

    @Test
    fun resolvable_httpUrl_isKept() {
        val kept = link("http://meeshy.me/help")
        assertThat(SupportLinkResolver.resolvable(listOf(kept))).containsExactly(kept)
    }

    @Test
    fun resolvable_mailtoUrl_isKept() {
        val kept = link("mailto:support@meeshy.me", SupportLinkKind.EMAIL)
        assertThat(SupportLinkResolver.resolvable(listOf(kept))).containsExactly(kept)
    }

    @Test
    fun resolvable_mailtoWithSubject_isKept() {
        val kept = link("mailto:bugs@meeshy.me?subject=Bug", SupportLinkKind.BUG_REPORT)
        assertThat(SupportLinkResolver.resolvable(listOf(kept))).containsExactly(kept)
    }

    @Test
    fun resolvable_uppercaseScheme_isKept() {
        val kept = link("MAILTO:support@meeshy.me", SupportLinkKind.EMAIL)
        assertThat(SupportLinkResolver.resolvable(listOf(kept))).containsExactly(kept)
    }

    @Test
    fun resolvable_paddedUrl_isKept() {
        val kept = link("  https://meeshy.me/faq  ", SupportLinkKind.FAQ)
        assertThat(SupportLinkResolver.resolvable(listOf(kept))).containsExactly(kept)
    }

    @Test
    fun resolvable_blankUrl_isDropped() {
        assertThat(SupportLinkResolver.resolvable(listOf(link("   ")))).isEmpty()
    }

    @Test
    fun resolvable_nonLaunchableScheme_isDropped() {
        assertThat(SupportLinkResolver.resolvable(listOf(link("tel:+15551234567")))).isEmpty()
    }

    @Test
    fun resolvable_schemelessString_isDropped() {
        assertThat(SupportLinkResolver.resolvable(listOf(link("support@meeshy.me")))).isEmpty()
    }

    @Test
    fun resolvable_mixedList_keepsOnlyLaunchableInOrder() {
        val help = link("https://meeshy.me/help", SupportLinkKind.HELP_CENTER)
        val bad = link("javascript:alert(1)", SupportLinkKind.FAQ)
        val email = link("mailto:support@meeshy.me", SupportLinkKind.EMAIL)

        assertThat(SupportLinkResolver.resolvable(listOf(help, bad, email)))
            .containsExactly(help, email)
            .inOrder()
    }
}
