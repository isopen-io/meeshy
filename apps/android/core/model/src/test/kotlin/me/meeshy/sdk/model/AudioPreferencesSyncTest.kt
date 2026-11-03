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
    fun `le corps envoyé porte les quatre interrupteurs vocaux et rien d'autre`() {
        val body = AudioPreferenceSyncBody.from(
            AudioPreferences(autoTranscribeIncoming = false, transcriptionEnabled = false, ttsEnabled = false, ttsSpeed = 2.0),
        )
        val wire = wireJson.encodeToString(body)
        assertThat(wire).isEqualTo(
            """{"autoTranscribeIncoming":false,"transcriptionEnabled":false,"audioTranslationEnabled":true,"ttsEnabled":false,"voiceProfileEnabled":false}""",
        )
    }

    @Test
    fun `la projection est complète et l'aller-retour garde les champs locaux`() {
        val local = AudioPreferences(
            autoTranscribeIncoming = false,
            transcriptionEnabled = false,
            audioTranslationEnabled = false,
            ttsEnabled = false,
            voiceProfileEnabled = true,
            ttsSpeed = 1.7,
            extras = mapOf("futur" to kotlinx.serialization.json.JsonPrimitive(1)),
        )
        assertThat(AudioPreferenceSyncBody.from(local).toPreferences(AudioPreferences(ttsSpeed = 1.7, extras = local.extras)))
            .isEqualTo(local)
    }

    @Test
    fun `lire une ligne ancienne ne touche que la transcription automatique`() {
        val local = AudioPreferences(autoTranscribeIncoming = true, ttsEnabled = false, ttsSpeed = 1.7)
        val folded = AudioPreferenceSyncBody(autoTranscribeIncoming = false).toPreferences(local)
        assertThat(folded).isEqualTo(local.copy(autoTranscribeIncoming = false))
    }
}
