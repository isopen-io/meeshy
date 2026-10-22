package me.meeshy.sdk.model.push

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class PushTrustedOriginTest {

    @Test
    fun `une origine stockee de l allowlist est conservee`() {
        assertThat(PushTrustedOrigin.apiBaseUrl("https://gate.staging.meeshy.me")).isEqualTo("https://gate.staging.meeshy.me")
        assertThat(PushTrustedOrigin.apiBaseUrl("http://localhost:3000")).isEqualTo("http://localhost:3000")
    }

    @Test
    fun `une origine hors allowlist ou absente retombe sur la production`() {
        assertThat(PushTrustedOrigin.apiBaseUrl("https://evil.example")).isEqualTo("https://gate.meeshy.me")
        assertThat(PushTrustedOrigin.apiBaseUrl(null)).isEqualTo("https://gate.meeshy.me")
    }

    @Test
    fun `un media de meeshy me ou d un sous domaine est de confiance`() {
        assertThat(PushTrustedOrigin.isTrustedMediaUrl("https://meeshy.me/u/a.jpg")).isTrue()
        assertThat(PushTrustedOrigin.isTrustedMediaUrl("https://gate.meeshy.me/files/a.m4a")).isTrue()
        assertThat(PushTrustedOrigin.isTrustedMediaUrl("https://GATE.STAGING.MEESHY.ME/x")).isTrue()
    }

    @Test
    fun `un hote voisin est refuse`() {
        assertThat(PushTrustedOrigin.isTrustedMediaUrl("https://meeshy.me.evil.com/a.jpg")).isFalse()
        assertThat(PushTrustedOrigin.isTrustedMediaUrl("https://evilmeeshy.me/a.jpg")).isFalse()
        assertThat(PushTrustedOrigin.isTrustedMediaUrl("https://meeshy.me@evil.com/a.jpg")).isFalse()
        assertThat(PushTrustedOrigin.isTrustedMediaUrl("https://evil.com/?h=meeshy.me")).isFalse()
    }

    @Test
    fun `http n est accepte que pour localhost 3000`() {
        assertThat(PushTrustedOrigin.isTrustedMediaUrl("http://meeshy.me/a.jpg")).isFalse()
        assertThat(PushTrustedOrigin.isTrustedMediaUrl("http://localhost:3000/a.jpg")).isTrue()
        assertThat(PushTrustedOrigin.isTrustedMediaUrl("http://localhost:8080/a.jpg")).isFalse()
    }

    @Test
    fun `une url illisible ou d un autre schema est refusee`() {
        assertThat(PushTrustedOrigin.isTrustedMediaUrl("ftp://meeshy.me/a")).isFalse()
        assertThat(PushTrustedOrigin.isTrustedMediaUrl("not a url")).isFalse()
        assertThat(PushTrustedOrigin.isTrustedMediaUrl("")).isFalse()
        assertThat(PushTrustedOrigin.isTrustedMediaUrl("https://meeshy.me:8443/a")).isFalse()
    }
}
