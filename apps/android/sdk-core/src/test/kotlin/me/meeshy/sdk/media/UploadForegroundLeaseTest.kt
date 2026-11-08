package me.meeshy.sdk.media

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.runTest
import org.junit.Test

class UploadForegroundLeaseTest {

    @Test
    fun `a finished upload takes the lease before the work and ends it once`() = runTest {
        val provider = FakeUploadLeaseProvider()
        var beginsWhenWorkStarted = -1

        val outcome = UploadForegroundLease(provider).run("u") {
            beginsWhenWorkStarted = provider.begins
            "done"
        }

        assertThat(outcome).isEqualTo(LeasedOutcome.Completed("done"))
        assertThat(beginsWhenWorkStarted).isEqualTo(1)
        assertThat(provider.ends).isEqualTo(1)
    }

    @Test
    fun `a failing result ends the lease once and is still returned`() = runTest {
        val provider = FakeUploadLeaseProvider()

        val outcome = UploadForegroundLease(provider).run("u", isFailure = { it == "boom" }) { "boom" }

        assertThat(outcome).isEqualTo(LeasedOutcome.Completed("boom"))
        assertThat(provider.ends).isEqualTo(1)
    }

    @Test
    fun `a thrown failure ends the lease once and propagates`() = runTest {
        val provider = FakeUploadLeaseProvider()

        val failure = runCatching { UploadForegroundLease(provider).run<String>("u") { error("disk") } }.exceptionOrNull()

        assertThat(failure).isInstanceOf(IllegalStateException::class.java)

        assertThat(provider.ends).isEqualTo(1)
    }

    @Test
    fun `the system expiring the lease cancels the work and ends the lease once`() = runTest {
        val provider = FakeUploadLeaseProvider()
        var workFinished = false

        val outcome = UploadForegroundLease(provider).run("u") {
            provider.expire()
            delay(60_000)
            workFinished = true
            "late"
        }

        assertThat(outcome).isEqualTo(LeasedOutcome.Expired)
        assertThat(workFinished).isFalse()
        assertThat(provider.ends).isEqualTo(1)
    }

    @Test
    fun `expiring twice still ends the lease once`() = runTest {
        val provider = FakeUploadLeaseProvider()

        UploadForegroundLease(provider).run("u") {
            provider.expire()
            provider.expire()
            delay(60_000)
        }

        assertThat(provider.ends).isEqualTo(1)
    }

    @Test
    fun `cancelling the caller ends the lease once and keeps the cancellation`() = runTest {
        val provider = FakeUploadLeaseProvider()
        var cancelled: CancellationException? = null

        val job = launch {
            try {
                UploadForegroundLease(provider).run("u") { delay(60_000) }
            } catch (c: CancellationException) {
                cancelled = c
                throw c
            }
        }
        testScheduler.runCurrent()
        job.cancel()
        job.join()

        assertThat(cancelled).isNotNull()
        assertThat(provider.ends).isEqualTo(1)
    }
}
