package me.meeshy.sdk.model.push

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class PushReceiptRetryPolicyTest {
    @Test
    fun `forbidden is permanent`() {
        assertThat(PushReceiptRetryPolicy.shouldRetry(403)).isFalse()
    }

    @Test
    fun `a permanent client error is not retried`() {
        listOf(400, 404, 409, 410, 422).forEach { assertThat(PushReceiptRetryPolicy.shouldRetry(it)).isFalse() }
    }

    @Test
    fun `unauthorized timeout and throttling are retried`() {
        listOf(401, 408, 429).forEach { assertThat(PushReceiptRetryPolicy.shouldRetry(it)).isTrue() }
    }

    @Test
    fun `network failures and server errors are retried`() {
        assertThat(PushReceiptRetryPolicy.shouldRetry(null)).isTrue()
        listOf(500, 502, 503, 599).forEach { assertThat(PushReceiptRetryPolicy.shouldRetry(it)).isTrue() }
    }
}
