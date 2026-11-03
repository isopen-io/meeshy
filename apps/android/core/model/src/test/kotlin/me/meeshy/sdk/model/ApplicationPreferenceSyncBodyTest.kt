package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import org.junit.Test

class ApplicationPreferenceSyncBodyTest {

    private val wireJson = Json { encodeDefaults = true }

    @Test
    fun `la sérialisation est exactement le thème`() {
        val wire = wireJson.encodeToString(ApplicationPreferenceSyncBody.from(ApplicationPreferences(theme = AppThemeMode.DARK)))
        assertThat(wire).isEqualTo("""{"theme":"dark"}""")
    }

    @Test
    fun `aucune clé de consentement ni langue d'interface même avec un bloc local chargé`() {
        val local = ApplicationPreferences(
            theme = AppThemeMode.LIGHT,
            interfaceLanguage = "fr",
            dataProcessingConsentAt = "2026-01-01T00:00:00Z",
            voiceDataConsentAt = "2026-01-01T00:00:00Z",
            voiceProfileConsentAt = "2026-01-01T00:00:00Z",
            voiceCloningConsentAt = "2026-01-01T00:00:00Z",
            voiceCloningEnabledAt = "2026-01-01T00:00:00Z",
        )
        val keys = wireJson.parseToJsonElement(wireJson.encodeToString(ApplicationPreferenceSyncBody.from(local))).jsonObject.keys
        assertThat(keys).containsExactly("theme")
        assertThat(keys.none { it.contains("consent", ignoreCase = true) || it == "interfaceLanguage" }).isTrue()
    }

    @Test
    fun `lire la passerelle ne remplace que le thème du bloc local`() {
        val local = ApplicationPreferences(
            theme = AppThemeMode.AUTO,
            interfaceLanguage = "fr",
            voiceCloningConsentAt = "2026-01-01T00:00:00Z",
            extras = mapOf("futur" to JsonPrimitive(1)),
        )
        val folded = ApplicationPreferenceSyncBody(AppThemeMode.DARK).toPreferences(local)
        assertThat(folded).isEqualTo(local.copy(theme = AppThemeMode.DARK))
    }
}
