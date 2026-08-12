package me.meeshy.sdk.link

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class LinkOpenPolicyTest {

    // MARK: - In-app browser (http/https)

    @Test
    fun `https url routes to the in-app browser`() {
        val target = LinkOpenPolicy.targetFor("https://meeshy.me/blog")
        assertThat(target).isEqualTo(LinkOpenTarget.InAppBrowser("https://meeshy.me/blog"))
    }

    @Test
    fun `http url routes to the in-app browser`() {
        val target = LinkOpenPolicy.targetFor("http://example.com")
        assertThat(target).isEqualTo(LinkOpenTarget.InAppBrowser("http://example.com"))
    }

    @Test
    fun `surrounding whitespace is trimmed before routing`() {
        val target = LinkOpenPolicy.targetFor("   https://meeshy.me   ")
        assertThat(target).isEqualTo(LinkOpenTarget.InAppBrowser("https://meeshy.me"))
    }

    @Test
    fun `scheme case is normalised to lowercase but host case is preserved`() {
        val target = LinkOpenPolicy.targetFor("HTTPS://Meeshy.ME/Path")
        assertThat(target).isEqualTo(LinkOpenTarget.InAppBrowser("https://Meeshy.ME/Path"))
    }

    @Test
    fun `https with a port and query still routes to the browser`() {
        val target = LinkOpenPolicy.targetFor("https://host.dev:8443/a?b=c#frag")
        assertThat(target).isEqualTo(LinkOpenTarget.InAppBrowser("https://host.dev:8443/a?b=c#frag"))
    }

    // MARK: - Web scheme with no host → unsupported (never open a hostless browser)

    @Test
    fun `http scheme with no authority is unsupported`() {
        assertThat(LinkOpenPolicy.targetFor("http://")).isEqualTo(LinkOpenTarget.Unsupported)
    }

    @Test
    fun `http scheme without the double slash is unsupported`() {
        assertThat(LinkOpenPolicy.targetFor("http:example.com")).isEqualTo(LinkOpenTarget.Unsupported)
    }

    // MARK: - Dangerous schemes are blocked (surpasses iOS's silent SafariView failure)

    @Test
    fun `javascript scheme is blocked as unsupported`() {
        assertThat(LinkOpenPolicy.targetFor("javascript:alert(1)")).isEqualTo(LinkOpenTarget.Unsupported)
    }

    @Test
    fun `data scheme is blocked as unsupported`() {
        assertThat(LinkOpenPolicy.targetFor("data:text/html,<h1>x</h1>")).isEqualTo(LinkOpenTarget.Unsupported)
    }

    @Test
    fun `file scheme is blocked regardless of case`() {
        assertThat(LinkOpenPolicy.targetFor("FILE:///etc/passwd")).isEqualTo(LinkOpenTarget.Unsupported)
    }

    // MARK: - Well-formed non-web schemes → hand to the OS

    @Test
    fun `mailto routes to the external OS handler`() {
        val target = LinkOpenPolicy.targetFor("mailto:hi@meeshy.me")
        assertThat(target).isEqualTo(LinkOpenTarget.External("mailto:hi@meeshy.me"))
    }

    @Test
    fun `tel routes to the external OS handler`() {
        assertThat(LinkOpenPolicy.targetFor("tel:+33123456789"))
            .isEqualTo(LinkOpenTarget.External("tel:+33123456789"))
    }

    @Test
    fun `a meeshy deep link routes to the external OS handler`() {
        assertThat(LinkOpenPolicy.targetFor("meeshy://story/abc"))
            .isEqualTo(LinkOpenTarget.External("meeshy://story/abc"))
    }

    @Test
    fun `a reverse-dns deep-link scheme routes to the external OS handler`() {
        val url = "com.googleusercontent.apps.123:/oauth"
        assertThat(LinkOpenPolicy.targetFor(url)).isEqualTo(LinkOpenTarget.External(url))
    }

    // MARK: - Bare hosts (no scheme) are promoted to https

    @Test
    fun `a bare host with a dot is promoted to https and opened in-app`() {
        assertThat(LinkOpenPolicy.targetFor("example.com"))
            .isEqualTo(LinkOpenTarget.InAppBrowser("https://example.com"))
    }

    @Test
    fun `a bare www host with a path is promoted to https`() {
        assertThat(LinkOpenPolicy.targetFor("www.meeshy.me/features"))
            .isEqualTo(LinkOpenTarget.InAppBrowser("https://www.meeshy.me/features"))
    }

    @Test
    fun `a scheme-less token with no dot is unsupported`() {
        assertThat(LinkOpenPolicy.targetFor("justtext")).isEqualTo(LinkOpenTarget.Unsupported)
    }

    @Test
    fun `a scheme-less token with whitespace is unsupported`() {
        assertThat(LinkOpenPolicy.targetFor("hello world.com")).isEqualTo(LinkOpenTarget.Unsupported)
    }

    @Test
    fun `a bare host ending in a dot is unsupported`() {
        assertThat(LinkOpenPolicy.targetFor("trailingdot.")).isEqualTo(LinkOpenTarget.Unsupported)
    }

    @Test
    fun `a bare host starting with a dot is unsupported`() {
        assertThat(LinkOpenPolicy.targetFor(".leadingdot.com")).isEqualTo(LinkOpenTarget.Unsupported)
    }

    // MARK: - Empty / blank

    @Test
    fun `an empty string is unsupported`() {
        assertThat(LinkOpenPolicy.targetFor("")).isEqualTo(LinkOpenTarget.Unsupported)
    }

    @Test
    fun `a blank string is unsupported`() {
        assertThat(LinkOpenPolicy.targetFor("    ")).isEqualTo(LinkOpenTarget.Unsupported)
    }

    // MARK: - Image renderability decision (reused by the rich card)

    @Test
    fun `isRenderableWebImage is true for an https image url`() {
        assertThat(LinkOpenPolicy.isRenderableWebImage("https://cdn.meeshy.me/og.png")).isTrue()
    }

    @Test
    fun `isRenderableWebImage is false for a data-uri image`() {
        assertThat(LinkOpenPolicy.isRenderableWebImage("data:image/png;base64,AAAA")).isFalse()
    }

    @Test
    fun `isRenderableWebImage is false for a null image url`() {
        assertThat(LinkOpenPolicy.isRenderableWebImage(null)).isFalse()
    }

    @Test
    fun `isRenderableWebImage is false for a mailto scheme`() {
        assertThat(LinkOpenPolicy.isRenderableWebImage("mailto:x@y.z")).isFalse()
    }
}
