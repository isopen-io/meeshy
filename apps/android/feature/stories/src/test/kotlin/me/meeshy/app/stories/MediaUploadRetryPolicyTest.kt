package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.net.ApiError
import org.junit.Test

class MediaUploadRetryPolicyTest {

    private fun error(status: Int?) = ApiError(message = "boom", httpStatus = status)

    @Test
    fun `no http status is queueable (offline or timed-out before any response)`() {
        assertThat(MediaUploadRetryPolicy.isQueueable(error(status = null))).isTrue()
    }

    @Test
    fun `a 429 throttle is queueable (the server will accept it later)`() {
        assertThat(MediaUploadRetryPolicy.isQueueable(error(status = 429))).isTrue()
    }

    @Test
    fun `a 500 server error is queueable`() {
        assertThat(MediaUploadRetryPolicy.isQueueable(error(status = 500))).isTrue()
    }

    @Test
    fun `a 599 server error is queueable (upper boundary of the 5xx range)`() {
        assertThat(MediaUploadRetryPolicy.isQueueable(error(status = 599))).isTrue()
    }

    @Test
    fun `a 413 payload-too-large is not queueable (a retry uploads the same bytes)`() {
        assertThat(MediaUploadRetryPolicy.isQueueable(error(status = 413))).isFalse()
    }

    @Test
    fun `a 400 bad request is not queueable`() {
        assertThat(MediaUploadRetryPolicy.isQueueable(error(status = 400))).isFalse()
    }

    @Test
    fun `a 401 unauthorized is not queueable`() {
        assertThat(MediaUploadRetryPolicy.isQueueable(error(status = 401))).isFalse()
    }

    @Test
    fun `a 499 just below the server range is not queueable`() {
        assertThat(MediaUploadRetryPolicy.isQueueable(error(status = 499))).isFalse()
    }
}
