package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.junit.Test

class AudioPreferencesSyncTest {

    private val wireJson = Json { encodeDefaults = true }

    @Test
    fun `un jeton absent, vide ou corrompu rend les défauts`() {
        listOf(null, "", "   ", "{pas du json", "[1,2]", "\"x\"").forEach {
            assertThat(audioPreferencesFromStorage(it)).isEqualTo(AudioPreferences())
        }
    }

    @Test
    fun `le bloc survit à l'aller-retour, transcription coupée comprise`() {
        val prefs = AudioPreferences(autoTranscribeIncoming = false, ttsSpeed = 1.5)
        assertThat(audioPreferencesFromStorage(prefs.storageValue)).isEqualTo(prefs)
    }

    @Test
    fun `un jeton partiel garde les défauts des champs manquants`() {
        val prefs = audioPreferencesFromStorage("""{"autoTranscribeIncoming":false}""")
        assertThat(prefs).isEqualTo(AudioPreferences(autoTranscribeIncoming = false))
    }

    @Test
    fun `une clé inconnue n'empêche pas la relecture`() {
        val prefs = audioPreferencesFromStorage("""{"autoTranscribeIncoming":false,"futur":1}""")
        assertThat(prefs.autoTranscribeIncoming).isFalse()
    }

    @Test
    fun `le corps envoyé ne porte que la transcription automatique`() {
        val body = AudioPreferenceSyncBody.from(AudioPreferences(autoTranscribeIncoming = false, ttsSpeed = 2.0))
        val wire = wireJson.encodeToString(body)
        assertThat(wire).isEqualTo("""{"autoTranscribeIncoming":false}""")
    }

    @Test
    fun `lire la passerelle ne touche que la transcription automatique du bloc local`() {
        val local = AudioPreferences(autoTranscribeIncoming = true, ttsSpeed = 1.7)
        val folded = AudioPreferenceSyncBody(autoTranscribeIncoming = false).toPreferences(local)
        assertThat(folded).isEqualTo(local.copy(autoTranscribeIncoming = false))
    }
}
