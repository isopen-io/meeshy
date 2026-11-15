package me.meeshy.sdk.translation.device

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.translation.DeviceTranslationPair
import org.junit.Test

class DownloadConsentPolicyTest {

    private val frEn = DeviceTranslationPair("fr", "en")
    private val frEs = DeviceTranslationPair("fr", "es")

    @Test
    fun `a pair is asked once per session`() {
        val policy = DownloadConsentPolicy()
        assertThat(policy.shouldAsk(frEn)).isTrue()
        assertThat(policy.shouldAsk(frEn)).isFalse()
    }

    @Test
    fun `each pair has its own single ask`() {
        val policy = DownloadConsentPolicy()
        policy.shouldAsk(frEn)
        assertThat(policy.shouldAsk(frEs)).isTrue()
    }

    @Test
    fun `a remembered refusal makes the pair unsupported and never asks again`() {
        val policy = DownloadConsentPolicy()
        policy.shouldAsk(frEn)
        policy.remember(frEn)
        assertThat(policy.isBlocked(frEn)).isTrue()
        assertThat(policy.shouldAsk(frEn)).isFalse()
        assertThat(policy.isBlocked(frEs)).isFalse()
    }

    @Test
    fun `a failure remembered before any ask also blocks the pair`() {
        val policy = DownloadConsentPolicy()
        policy.remember(frEn)
        assertThat(policy.shouldAsk(frEn)).isFalse()
    }
}
