package me.meeshy.sdk.speech

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.delay
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.withTimeoutOrNull
import me.meeshy.sdk.media.LocalTranscriptions
import me.meeshy.sdk.model.speech.OnDeviceTranscription
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class VoiceNoteLocalTranscriberTest {
    private fun heard(text: String = "bonjour") =
        SoundTranscriptionOutcome.Heard(OnDeviceTranscription.fromRecognition(text, "fr", 0.9, 2_000))

    private fun TestScope.transcriber(
        transcribe: suspend (String, String) -> SoundTranscriptionOutcome = { _, _ -> heard() },
    ) = VoiceNoteLocalTranscriber(this, transcribe)

    @Test
    fun `la reconnaissance est abandonnee apres huit secondes et le vocal part sans texte`() = runTest {
        val t = transcriber { _, _ -> delay(8_001); heard() }
        t.begin("a1", "/a.m4a", 2_000, "fr")
        advanceTimeBy(7_999); runCurrent()
        assertThat(t.transcription("a1")).isNull()
        advanceUntilIdle()
        assertThat(t.transcription("a1")).isNull()
        assertThat(t.results.value).isEmpty()
    }

    @Test
    fun `un resultat est pose sur la bulle sous l'id local avec la langue du composeur`() = runTest {
        val t = transcriber()
        t.begin("a1", "/a.m4a", 2_000, "fr")
        advanceUntilIdle()
        val tus = t.results.value.getValue("a1")
        assertThat(tus.text).isEqualTo("bonjour")
        assertThat(tus.language).isEqualTo("fr")
        assertThat(tus.durationMs).isEqualTo(2_000)
        assertThat(tus.segments).hasSize(1)
    }

    @Test
    fun `huit resultats au plus sont retenus`() = runTest {
        val t = transcriber()
        (1..9).forEach { t.begin("a$it", "/a.m4a", 1_000, "fr") }
        advanceUntilIdle()
        assertThat(t.results.value.keys).containsExactlyElementsIn((2..9).map { "a$it" })
    }

    @Test
    fun `l'attente a l'envoi est bornee a 700 ms et emporte ce qui est deja connu`() = runTest {
        val t = transcriber { path, _ -> if (path == "/slow") delay(5_000); heard(path) }
        t.begin("fast", "/fast", 1_000, "fr")
        t.begin("slow", "/slow", 1_000, "fr")
        runCurrent()
        val awaited = withTimeoutOrNull(LocalTranscriptions.SEND_WAIT_BUDGET_MS) { t.await(listOf("fast", "slow"), "tmp") }
        assertThat(awaited).isNull()
        assertThat(currentTime).isEqualTo(700)
        assertThat(t.known(listOf("fast", "slow")).keys).containsExactly("fast")
        advanceUntilIdle()
        assertThat(t.transcription("slow")).isNotNull()
    }

    @Test
    fun `un echec ou une langue indisponible ne laisse rien et n'echoue pas`() = runTest {
        val unavailable = transcriber { _, _ -> SoundTranscriptionOutcome.ServerWillTranscribe }
        unavailable.begin("a1", "/a", 1_000, "fr")
        val crashing = transcriber { _, _ -> error("boom") }
        crashing.begin("a2", "/a", 1_000, "fr")
        advanceUntilIdle()
        assertThat(unavailable.await(listOf("a1"), "t")).isEmpty()
        assertThat(crashing.await(listOf("a2"), "t")).isEmpty()
    }

    @Test
    fun `annuler la piece abandonne la reconnaissance`() = runTest {
        val gate = CompletableDeferred<Unit>()
        val t = transcriber { _, _ -> gate.await(); heard() }
        t.begin("a1", "/a", 1_000, "fr")
        runCurrent()
        t.discard("a1")
        gate.complete(Unit)
        advanceUntilIdle()
        assertThat(t.results.value).isEmpty()
    }

    @Test
    fun `la transcription suit l'id local vers l'id serveur apres l'upload`() = runTest {
        val t = transcriber()
        t.begin("local", "/a", 1_000, "fr")
        advanceUntilIdle()
        t.promoted("local", "srv")
        assertThat(t.results.value.keys).containsExactly("srv")
    }
}
