package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** G4.2 (`docs/product/appels-vue-finale.md`) : l'anneau et le halo de la caméra coupée n'existent qu'à la parole. */
class CallPeerSpeechTest {

    private val idle = CallPeerSpeech()

    @Test
    fun `au repos le pair ne parle pas, donc ni anneau ni halo`() {
        assertThat(idle.isSpeaking).isFalse()
    }

    @Test
    fun `un niveau au-dessus du seuil d'entree fait parler le pair`() {
        assertThat(idle.recording(level = 0.2, nowMillis = 0).isSpeaking).isTrue()
        assertThat(idle.recording(level = 0.02, nowMillis = 0).isSpeaking).isFalse()
    }

    @Test
    fun `le maintien evite de clignoter entre deux syllabes puis l'anneau se retire`() {
        val speaking = idle.recording(level = 0.2, nowMillis = 0)

        assertThat(speaking.recording(level = 0.0, nowMillis = 400).isSpeaking).isTrue()
        assertThat(speaking.recording(level = 0.0, nowMillis = 1_000).isSpeaking).isFalse()
    }

    @Test
    fun `un releve sans mesure laisse le maintien s'ecouler`() {
        val speaking = idle.recording(level = 0.2, nowMillis = 0)

        assertThat(speaking.recording(level = null, nowMillis = 400).isSpeaking).isTrue()
        assertThat(speaking.recording(level = null, nowMillis = 1_200).isSpeaking).isFalse()
    }

    @Test
    fun `un groupe encore montre en duo relaie le verdict du maillage, sans second releve`() {
        assertThat(CallPeerSpeech.relayed(meshActive = true, speakers = setOf("u-awa"), peerUserId = "u-awa")).isTrue()
        assertThat(CallPeerSpeech.relayed(meshActive = true, speakers = setOf("u-karim"), peerUserId = "u-awa")).isFalse()
        assertThat(CallPeerSpeech.relayed(meshActive = true, speakers = setOf("u-awa"), peerUserId = null)).isFalse()
    }

    @Test
    fun `hors maillage rien n'est relaye, le placeholder releve lui-meme`() {
        assertThat(CallPeerSpeech.relayed(meshActive = false, speakers = setOf("u-awa"), peerUserId = "u-awa")).isNull()
    }
}
