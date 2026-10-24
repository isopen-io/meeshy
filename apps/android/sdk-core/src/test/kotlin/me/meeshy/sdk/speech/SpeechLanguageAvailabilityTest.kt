package me.meeshy.sdk.speech

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import org.junit.Test

class SpeechLanguageAvailabilityTest {

    private var sourceCalls = 0

    private fun availability(sdkInt: Int, installed: Set<String> = setOf("fr-FR", "en-US"), region: String? = "FR") =
        SpeechLanguageAvailability(
            source = InstalledSpeechLanguages { sourceCalls++; installed },
            sdkInt = sdkInt,
            deviceRegion = { region },
        )

    @Test
    fun `sous l'API 33 aucune langue n'est annoncée et on retombe sur le serveur sans erreur`() = runTest {
        val api32 = availability(sdkInt = 32)
        assertThat(api32.installedLanguages()).isEmpty()
        assertThat(api32.resolve("fr")).isEqualTo(SpeechLanguageResolution.ServerFallback)
        assertThat(api32.supportsLocalTranscription).isFalse()
        assertThat(sourceCalls).isEqualTo(0)
    }

    @Test
    fun `à partir de l'API 33 les langues installées se listent et se résolvent`() = runTest {
        val api33 = availability(sdkInt = 33)
        assertThat(api33.installedLanguages()).containsExactly("fr-FR", "en-US")
        assertThat(api33.resolve("fr")).isEqualTo(SpeechLanguageResolution.Available("fr-FR"))
    }

    @Test
    fun `une langue sans modèle installé se distingue du repli serveur`() = runTest {
        assertThat(availability(sdkInt = 34).resolve("de")).isEqualTo(SpeechLanguageResolution.NotInstalled)
    }
}
