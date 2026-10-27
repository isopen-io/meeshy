package me.meeshy.sdk.net.api

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.onboarding.OnboardingFinishUpdate
import me.meeshy.sdk.model.onboarding.OnboardingStateParser
import me.meeshy.sdk.model.onboarding.OnboardingStepId
import me.meeshy.sdk.model.onboarding.OnboardingStepOutcome
import me.meeshy.sdk.model.onboarding.OnboardingStepUpdate
import org.junit.Test

/** Les trois appels du parcours d'accueil, tels qu'ils partent — requête capturée derrière le vrai Retrofit. */
class OnboardingApiRoutesTest {

    private fun onboarding(http: RecordingHttp) = http.serve(OnboardingApi::class.java)

    @Test
    fun `lire l etat appelle me onboarding et rend une charge lisible`() = runTest {
        val http = RecordingHttp(
            responseBody = """{"success":true,"data":{"eligible":true,"seenSteps":["languages","futur"],"viewerWriteRestriction":null}}""",
        )

        val state = OnboardingStateParser.parse(onboarding(http).state().data)!!

        assertThat(http.only.method).isEqualTo("GET")
        assertThat(http.only.path).isEqualTo("/api/v1/me/onboarding")
        assertThat(state.seenSteps).containsExactly(OnboardingStepId.LANGUAGES)
        assertThat(state.servesAgeStep).isTrue()
    }

    @Test
    fun `une carte vue part en patch avec son issue`() = runTest {
        val http = RecordingHttp(responseBody = """{"success":true,"data":{"eligible":true}}""")

        onboarding(http).record(OnboardingStepUpdate.of(OnboardingStepId.FRIENDS, OnboardingStepOutcome.DONE))

        assertThat(http.only.method).isEqualTo("PATCH")
        assertThat(http.only.path).isEqualTo("/api/v1/me/onboarding")
        assertThat(http.only.body).isEqualTo("""{"step":"friends","outcome":"done"}""")
    }

    @Test
    fun `la fin du parcours part en patch avec finish vrai`() = runTest {
        val http = RecordingHttp(responseBody = """{"success":true,"data":{"eligible":true}}""")

        onboarding(http).finish(OnboardingFinishUpdate.closing)

        assertThat(http.only.method).isEqualTo("PATCH")
        assertThat(http.only.body).isEqualTo("""{"finish":true}""")
    }
}
