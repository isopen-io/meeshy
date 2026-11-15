package me.meeshy.sdk.voice

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.voice.VoiceJob
import me.meeshy.sdk.model.voice.VoiceJobAccepted
import me.meeshy.sdk.model.voice.VoiceJobPollPlan
import me.meeshy.sdk.model.voice.VoiceJobStatus
import me.meeshy.sdk.model.voice.VoiceTranslateAsyncRequest
import me.meeshy.sdk.model.voice.VoiceTranslationState
import me.meeshy.sdk.net.api.VoiceApi
import org.junit.Test

class VoiceTranslationJobRepositoryTest {
    private val request = VoiceTranslateAsyncRequest("att1", listOf("en"))
    private val plan = VoiceJobPollPlan(maxAttempts = 3, firstDelayMs = 1_000, maxDelayMs = 1_000)

    private fun accepted() = ApiResponse(success = true, data = VoiceJobAccepted("j1", "j1", "processing"))
    private fun job(status: VoiceJobStatus, progress: Double = 0.0, error: String? = null) =
        ApiResponse(success = true, data = VoiceJob("j1", status, progress, error = error))

    @Test
    fun `a job is followed until it completes, on virtual time`() = runTest {
        val api = mockk<VoiceApi>()
        coEvery { api.translateAsync(request) } returns accepted()
        coEvery { api.job("j1") } returnsMany listOf(job(VoiceJobStatus.PROCESSING, 0.5), job(VoiceJobStatus.COMPLETED, 1.0))

        VoiceTranslationJobRepository(api).track(request, plan).test {
            assertThat(awaitItem()).isEqualTo(VoiceTranslationState.Idle)
            assertThat(awaitItem()).isEqualTo(VoiceTranslationState.Running("j1", 0.0, 0))
            assertThat(awaitItem()).isEqualTo(VoiceTranslationState.Running("j1", 0.5, 1))
            assertThat(awaitItem()).isInstanceOf(VoiceTranslationState.Done::class.java)
            awaitComplete()
        }
    }

    @Test
    fun `the follow-up is bounded and ends as impossible, never as another language`() = runTest {
        val api = mockk<VoiceApi>()
        coEvery { api.translateAsync(request) } returns accepted()
        coEvery { api.job("j1") } returns job(VoiceJobStatus.PROCESSING)

        VoiceTranslationJobRepository(api).track(request, plan).test {
            skipItems(2)
            skipItems(2)
            assertThat(awaitItem()).isEqualTo(VoiceTranslationState.Failed("j1", "timeout"))
            awaitComplete()
        }
        coVerify(exactly = 3) { api.job("j1") }
    }

    @Test
    fun `a failed job exposes the reason so the screen can offer a retry`() = runTest {
        val api = mockk<VoiceApi>()
        coEvery { api.translateAsync(request) } returns accepted()
        coEvery { api.job("j1") } returns job(VoiceJobStatus.FAILED, error = "TTS_DOWN")

        VoiceTranslationJobRepository(api).track(request, plan).test {
            skipItems(2)
            assertThat(awaitItem()).isEqualTo(VoiceTranslationState.Failed("j1", "TTS_DOWN"))
            awaitComplete()
        }
    }

    @Test
    fun `a refused start fails at once with no job to poll`() = runTest {
        val api = mockk<VoiceApi>()
        coEvery { api.translateAsync(request) } returns ApiResponse(success = false, error = "no", code = "FORBIDDEN")

        VoiceTranslationJobRepository(api).track(request, plan).test {
            assertThat(awaitItem()).isEqualTo(VoiceTranslationState.Idle)
            assertThat(awaitItem()).isInstanceOf(VoiceTranslationState.Failed::class.java)
            awaitComplete()
        }
        coVerify(exactly = 0) { api.job(any()) }
    }

    @Test
    fun `a transient poll error is retried within the bound`() = runTest {
        val api = mockk<VoiceApi>()
        coEvery { api.translateAsync(request) } returns accepted()
        coEvery { api.job("j1") } throws java.io.IOException("blip") andThen job(VoiceJobStatus.COMPLETED, 1.0)

        VoiceTranslationJobRepository(api).track(request, plan).test {
            skipItems(2)
            assertThat(awaitItem()).isEqualTo(VoiceTranslationState.Running("j1", 0.0, 1))
            assertThat(awaitItem()).isInstanceOf(VoiceTranslationState.Done::class.java)
            awaitComplete()
        }
    }
}
