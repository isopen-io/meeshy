package me.meeshy.sdk.translation

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.TranslationJob
import me.meeshy.sdk.net.api.TranslationApi
import org.junit.Test

class AsyncTranslationJobRepositoryTest {
    private val api = mockk<TranslationApi>()
    private val repo = AsyncTranslationJobRepository(api)

    private fun job(status: String) = ApiResponse(success = true, data = TranslationJob(jobId = "j", status = status))

    @Test
    fun `attend la fin du job en temps virtuel`() = runTest {
        coEvery { api.job("j") } returnsMany listOf(job("pending"), job("processing"), job("completed"))
        val out = repo.await("j", intervalMs = 1_000, maxAttempts = 5)
        assertThat(out).isInstanceOf(TranslationJobOutcome.Completed::class.java)
        assertThat(testScheduler.currentTime).isEqualTo(2_000)
    }

    @Test
    fun `un job echoue est rapporte`() = runTest {
        coEvery { api.job("j") } returns job("failed")
        assertThat(repo.await("j")).isInstanceOf(TranslationJobOutcome.Failed::class.java)
    }

    @Test
    fun `un job annule est rapporte`() = runTest {
        coEvery { api.job("j") } returns job("cancelled")
        assertThat(repo.await("j")).isEqualTo(TranslationJobOutcome.Cancelled)
    }

    @Test
    fun `la relance est bornee`() = runTest {
        coEvery { api.job("j") } returns job("processing")
        assertThat(repo.await("j", intervalMs = 10, maxAttempts = 3)).isEqualTo(TranslationJobOutcome.TimedOut)
        coVerify(exactly = 3) { api.job("j") }
    }

    @Test
    fun `annuler appelle la route de suppression`() = runTest {
        coEvery { api.cancelJob("j") } returns ApiResponse<kotlinx.serialization.json.JsonElement>(success = true, data = kotlinx.serialization.json.JsonPrimitive("x"))
        assertThat(repo.cancel("j").isSuccess).isTrue()
    }
}
