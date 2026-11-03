package me.meeshy.sdk.model.media

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class UploadLeasePlanTest {

    private fun held() = UploadLeasePlan.idle().begin()

    @Test
    fun `a lease that was never taken does not release anything`() {
        val transition = UploadLeasePlan.idle().end(UploadLeaseEnd.SUCCEEDED)

        assertThat(transition.releases).isFalse()
    }

    @Test
    fun `each way to finish releases a held lease once`() {
        UploadLeaseEnd.entries.forEach { reason ->
            val transition = held().end(reason)

            assertThat(transition.releases).isTrue()
            assertThat(transition.plan.ended).isEqualTo(reason)
            assertThat(transition.plan.held).isFalse()
        }
    }

    @Test
    fun `a second end never releases again and keeps the first reason`() {
        val first = held().end(UploadLeaseEnd.EXPIRED).plan

        val second = first.end(UploadLeaseEnd.CANCELLED)

        assertThat(second.releases).isFalse()
        assertThat(second.plan.ended).isEqualTo(UploadLeaseEnd.EXPIRED)
        assertThat(second.plan.expired).isTrue()
    }

    @Test
    fun `a lease ended before it was taken stays ended and cannot be taken`() {
        val ended = UploadLeasePlan.idle().end(UploadLeaseEnd.EXPIRED).plan

        assertThat(ended.begin().held).isFalse()
    }

    @Test
    fun `taking a held lease again changes nothing`() {
        assertThat(held().begin()).isEqualTo(held())
    }
}
