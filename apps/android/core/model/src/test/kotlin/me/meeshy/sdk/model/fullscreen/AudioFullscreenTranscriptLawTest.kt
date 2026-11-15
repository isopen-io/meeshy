package me.meeshy.sdk.model.fullscreen

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.MessageTranscriptionFiche.Request
import me.meeshy.sdk.model.MessageTranscriptionSegment
import me.meeshy.sdk.model.fullscreen.AudioFullscreenTranscriptLaw.Haptic
import me.meeshy.sdk.model.fullscreen.AudioFullscreenTranscriptLaw.Kind
import me.meeshy.sdk.model.fullscreen.AudioFullscreenTranscriptLaw.Origin
import me.meeshy.sdk.model.speech.OnDeviceTranscription
import me.meeshy.sdk.model.speech.OnDeviceTranscriptionSegment
import org.junit.Test

class AudioFullscreenTranscriptLawTest {

    private fun segment(text: String, start: Double? = null, end: Double? = null) =
        MessageTranscriptionSegment(text = text, startTime = start, endTime = end)

    @Test
    fun `la transcription du serveur passe avant la locale`() {
        val served = AudioFullscreenTranscriptLaw.served(
            serverSegments = listOf(segment("serveur", 0.0, 2.0)),
            serverText = "serveur",
            localSegments = listOf(segment("local", 0.0, 2.0)),
            localText = "local",
            durationMs = 2_000,
        )
        assertThat(served?.origin).isEqualTo(Origin.SERVER)
        assertThat(served?.segments?.map { it.text }).containsExactly("serveur")
    }

    @Test
    fun `sans serveur la transcription locale est servie`() {
        val served = AudioFullscreenTranscriptLaw.served(emptyList(), null, listOf(segment("local", 0.0, 1.0)), "local", 1_000)
        assertThat(served?.origin).isEqualTo(Origin.LOCAL)
        assertThat(served?.segments?.map { it.text }).containsExactly("local")
    }

    @Test
    fun `un texte sans segment devient un seul segment de zero a la duree`() {
        val served = AudioFullscreenTranscriptLaw.served(emptyList(), "  bonjour a tous ", emptyList(), null, 4_500)
        assertThat(served?.segments).hasSize(1)
        val only = served!!.segments.single()
        assertThat(only.text).isEqualTo("bonjour a tous")
        assertThat(only.startTime).isEqualTo(0.0)
        assertThat(only.endTime).isEqualTo(4.5)
    }

    @Test
    fun `une duree inconnue laisse le segment unique sans fin`() {
        val only = AudioFullscreenTranscriptLaw.served(emptyList(), "salut", emptyList(), null, 0)!!.segments.single()
        assertThat(only.startTime).isEqualTo(0.0)
        assertThat(only.endTime).isNull()
    }

    @Test
    fun `un serveur sans texte laisse la place a la locale`() {
        val served = AudioFullscreenTranscriptLaw.served(emptyList(), "   ", listOf(segment("local")), "local", 1_000)
        assertThat(served?.origin).isEqualTo(Origin.LOCAL)
    }

    @Test
    fun `rien du serveur ni du local ne sert rien`() {
        assertThat(AudioFullscreenTranscriptLaw.served(emptyList(), null, emptyList(), "", 1_000)).isNull()
    }

    @Test
    fun `le texte servi garde ses segments horodates`() {
        val timed = listOf(segment("un", 0.0, 1.0), segment("deux", 1.0, 2.0))
        val served = AudioFullscreenTranscriptLaw.served(timed, "un deux", emptyList(), null, 2_000)
        assertThat(served?.segments).isEqualTo(timed)
    }

    @Test
    fun `l etat est resultat des qu une transcription est servie`() {
        assertThat(AudioFullscreenTranscriptLaw.state(hasServed = true, request = Request.IN_FLIGHT)).isEqualTo(Kind.RESULT)
    }

    @Test
    fun `l etat est en cours tant que la demande tourne`() {
        assertThat(AudioFullscreenTranscriptLaw.state(hasServed = false, request = Request.IN_FLIGHT)).isEqualTo(Kind.IN_FLIGHT)
    }

    @Test
    fun `l etat est vide au repos et apres un echec`() {
        assertThat(AudioFullscreenTranscriptLaw.state(false, Request.IDLE)).isEqualTo(Kind.EMPTY)
        assertThat(AudioFullscreenTranscriptLaw.state(false, Request.FAILED)).isEqualTo(Kind.EMPTY)
    }

    @Test
    fun `la demande en cours l emporte sur un echec ancien`() {
        assertThat(AudioFullscreenTranscriptLaw.request(Request.FAILED, localRunning = true, localFailed = false)).isEqualTo(Request.IN_FLIGHT)
        assertThat(AudioFullscreenTranscriptLaw.request(Request.IN_FLIGHT, localRunning = false, localFailed = true)).isEqualTo(Request.IN_FLIGHT)
    }

    @Test
    fun `un echec local ou serveur est un echec`() {
        assertThat(AudioFullscreenTranscriptLaw.request(Request.IDLE, localRunning = false, localFailed = true)).isEqualTo(Request.FAILED)
        assertThat(AudioFullscreenTranscriptLaw.request(Request.FAILED, localRunning = false, localFailed = false)).isEqualTo(Request.FAILED)
        assertThat(AudioFullscreenTranscriptLaw.request(Request.IDLE, localRunning = false, localFailed = false)).isEqualTo(Request.IDLE)
    }

    @Test
    fun `la transcription qui arrive porte un succes`() {
        assertThat(AudioFullscreenTranscriptLaw.outcome(Kind.IN_FLIGHT, Kind.RESULT, Request.IDLE)).isEqualTo(Haptic.SUCCESS)
    }

    @Test
    fun `la demande qui echoue porte une erreur`() {
        assertThat(AudioFullscreenTranscriptLaw.outcome(Kind.IN_FLIGHT, Kind.EMPTY, Request.FAILED)).isEqualTo(Haptic.ERROR)
    }

    @Test
    fun `aucune autre transition ne vibre`() {
        assertThat(AudioFullscreenTranscriptLaw.outcome(Kind.EMPTY, Kind.RESULT, Request.IDLE)).isNull()
        assertThat(AudioFullscreenTranscriptLaw.outcome(Kind.EMPTY, Kind.IN_FLIGHT, Request.IN_FLIGHT)).isNull()
        assertThat(AudioFullscreenTranscriptLaw.outcome(Kind.IN_FLIGHT, Kind.EMPTY, Request.IDLE)).isNull()
        assertThat(AudioFullscreenTranscriptLaw.outcome(Kind.RESULT, Kind.RESULT, Request.IDLE)).isNull()
    }

    @Test
    fun `la reconnaissance sur l appareil devient des segments en secondes`() {
        val heard = OnDeviceTranscription(
            text = "un deux",
            language = "fr",
            confidence = 0.9,
            segments = listOf(
                OnDeviceTranscriptionSegment("un", startMs = 500, durationMs = 1_000, confidence = 0.9),
                OnDeviceTranscriptionSegment("deux", startMs = 1_500, durationMs = 500, confidence = 0.8),
            ),
        )
        val local = AudioFullscreenTranscriptLaw.localOf(heard)
        assertThat(local.text).isEqualTo("un deux")
        assertThat(local.segments.map { it.text }).containsExactly("un", "deux").inOrder()
        assertThat(local.segments.map { it.startTime }).containsExactly(0.5, 1.5).inOrder()
        assertThat(local.segments.map { it.endTime }).containsExactly(1.5, 2.0).inOrder()
    }
}
