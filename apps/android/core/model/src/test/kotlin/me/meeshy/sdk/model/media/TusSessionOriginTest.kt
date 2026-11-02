package me.meeshy.sdk.model.media

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class TusSessionOriginTest {

    private val api = "https://gate.meeshy.me/api/v1/"

    @Test
    fun `an absolute address on the API host is ours`() {
        assertThat(TusSessionOrigin.isSameOrigin("https://gate.meeshy.me/api/v1/uploads/abc", api)).isTrue()
        assertThat(TusSessionOrigin.isSameOrigin("HTTPS://Gate.Meeshy.me:443/api/v1/uploads/abc", api)).isTrue()
    }

    @Test
    fun `a relative address resolves against the API and is ours`() {
        assertThat(TusSessionOrigin.isSameOrigin("/api/v1/uploads/abc", api)).isTrue()
    }

    @Test
    fun `another host, scheme or port never receives the credential`() {
        assertThat(TusSessionOrigin.isSameOrigin("https://evil.example/api/v1/uploads/abc", api)).isFalse()
        assertThat(TusSessionOrigin.isSameOrigin("https://staging.meeshy.me/api/v1/uploads/abc", api)).isFalse()
        assertThat(TusSessionOrigin.isSameOrigin("http://gate.meeshy.me/api/v1/uploads/abc", api)).isFalse()
        assertThat(TusSessionOrigin.isSameOrigin("https://gate.meeshy.me:8443/api/v1/uploads/abc", api)).isFalse()
        assertThat(TusSessionOrigin.isSameOrigin("//evil.example/api/v1/uploads/abc", api)).isFalse()
        assertThat(TusSessionOrigin.isSameOrigin("https://gate.meeshy.me.evil.example/u", api)).isFalse()
    }

    @Test
    fun `an unreadable address is never contacted`() {
        assertThat(TusSessionOrigin.isSameOrigin("https://gate meeshy/u", api)).isFalse()
        assertThat(TusSessionOrigin.isSameOrigin("", api)).isFalse()
    }
}
