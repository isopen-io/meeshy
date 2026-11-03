package me.meeshy.sdk.model.consent

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.junit.Test

class ConsentEntryDecodingTest {
    private val json = Json { ignoreUnknownKeys = true; coerceInputValues = true }

    @Test
    fun `une finalite inconnue du client est ignoree sans erreur`() {
        val body = """{"consents":[
            {"purpose":"data-processing","granted":true,"grantedAt":"2026-09-01T00:00:00Z","policyVersion":"2026-10-01","source":"server"},
            {"purpose":"quantum-sharing","granted":true,"policyVersion":"2026-10-01"},
            {"purpose":"analytics","granted":false,"revokedAt":null,"policyVersion":"2026-10-01"}
        ],"gameConsents":[{"purpose":"public-league","granted":true}],"derived":{"canTranscribeAudio":true}}"""
        val snap = ConsentSnapshot.from(json.decodeFromString<ConsentsPayload>(body).consents)
        assertThat(snap.granted).containsExactly(ConsentPurpose.DATA_PROCESSING)
        assertThat(snap.policyVersion).isEqualTo("2026-10-01")
    }

    @Test
    fun `sans entree la version par defaut s'applique`() {
        assertThat(ConsentSnapshot.from(emptyList()).policyVersion).isEqualTo(ConsentPolicy.DEFAULT_VERSION)
    }

    @Test
    fun `le corps du PUT ne porte que granted et policyVersion`() {
        val encoded = Json { encodeDefaults = false }.encodeToString(ConsentUpdateRequest(true, "2026-08-30"))
        assertThat(encoded).isEqualTo("""{"granted":true,"policyVersion":"2026-08-30"}""")
    }
}
