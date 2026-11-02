package me.meeshy.sdk.onboarding

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import io.mockk.slot
import java.io.IOException
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.onboarding.OnboardingFinishUpdate
import me.meeshy.sdk.model.onboarding.OnboardingStepId
import me.meeshy.sdk.model.onboarding.OnboardingStepOutcome
import me.meeshy.sdk.model.onboarding.OnboardingStepUpdate
import me.meeshy.sdk.net.api.OnboardingApi
import org.junit.Test

class OnboardingRepositoryTest {

    private val served = ApiResponse(
        success = true,
        data = Json.parseToJsonElement("""{"eligible":true,"seenSteps":["languages"],"emailVerified":false}"""),
    )

    @Test
    fun `the served state is read tolerantly`() = runTest {
        val api = mockk<OnboardingApi>()
        coEvery { api.state() } returns served

        val state = OnboardingRepository(api).fetchState()!!

        assertThat(state.eligible).isTrue()
        assertThat(state.seenSteps).containsExactly(OnboardingStepId.LANGUAGES)
        assertThat(state.emailVerified).isFalse()
    }

    @Test
    fun `a network failure reads as no state, the read will be retried`() = runTest {
        val api = mockk<OnboardingApi>()
        coEvery { api.state() } throws IOException("offline")

        assertThat(OnboardingRepository(api).fetchState()).isNull()
    }

    @Test
    fun `recording a card sends the step and its outcome`() = runTest {
        val api = mockk<OnboardingApi>()
        val sent = slot<OnboardingStepUpdate>()
        coEvery { api.record(capture(sent)) } returns served

        val acknowledged = OnboardingRepository(api).record(OnboardingStepId.AGE, OnboardingStepOutcome.DONE)

        assertThat(acknowledged).isTrue()
        assertThat(sent.captured).isEqualTo(OnboardingStepUpdate("age", "done"))
    }

    @Test
    fun `a failed write is reported not thrown`() = runTest {
        val api = mockk<OnboardingApi>()
        coEvery { api.finish(any()) } throws IOException("offline")

        assertThat(OnboardingRepository(api).finish()).isFalse()
        coVerify(exactly = 1) { api.finish(OnboardingFinishUpdate.closing) }
    }
}
