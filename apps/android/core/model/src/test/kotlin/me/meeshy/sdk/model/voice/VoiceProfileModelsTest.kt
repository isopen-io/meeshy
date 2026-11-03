package me.meeshy.sdk.model.voice

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.VoiceConsentRequest
import me.meeshy.sdk.model.VoiceConsentStatus
import me.meeshy.sdk.model.VoiceProfileDetails
import me.meeshy.sdk.model.VoiceProfileRegisterResponse
import me.meeshy.sdk.model.VoiceProfileStatus
import org.junit.Test

class VoiceProfileModelsTest {
    private val json = Json { ignoreUnknownKeys = true; isLenient = true; explicitNulls = false; coerceInputValues = true }

    @Test
    fun `consent status derives its booleans from the three timestamps`() {
        val status = json.decodeFromString<VoiceConsentStatus>(
            """{"voiceRecordingConsentAt":"2026-10-01T10:00:00.000Z","voiceCloningEnabledAt":null,"ageVerificationConsentAt":"2026-10-01T10:00:00.000Z"}""",
        )

        assertThat(status.hasConsent).isTrue()
        assertThat(status.ageVerified).isTrue()
        assertThat(status.voiceCloningEnabled).isFalse()
    }

    @Test
    fun `an empty consent status means no consent`() {
        assertThat(json.decodeFromString<VoiceConsentStatus>("{}").hasConsent).isFalse()
    }

    @Test
    fun `revoking writes recording consent false and omits the cloning flag`() {
        val body = Json.encodeToString(VoiceConsentRequest(voiceRecordingConsent = false))

        assertThat(body).contains("\"voiceRecordingConsent\":false")
        assertThat(body).doesNotContain("voiceCloningConsent")
    }

    @Test
    fun `an explicit false cloning flag is written so it can disable cloning`() {
        val body = Json { encodeDefaults = false }.encodeToString(
            VoiceConsentRequest(voiceRecordingConsent = true, voiceCloningConsent = false),
        )

        assertThat(body).contains("\"voiceCloningConsent\":false")
    }

    @Test
    fun `a profile that does not exist maps to the empty state`() {
        val details = json.decodeFromString<VoiceProfileDetails>("""{"profileId":null,"userId":"u1","exists":false}""")

        assertThat(details.toDomain()).isNull()
    }

    @Test
    fun `an existing profile maps with derived status and normalised quality`() {
        val ready = json.decodeFromString<VoiceProfileDetails>(
            """{"profileId":"p1","userId":"u1","exists":true,"qualityScore":0.5,"audioDurationMs":12000,"audioCount":2,"needsCalibration":false,"extra":1}""",
        ).toDomain()!!
        val legacy = json.decodeFromString<VoiceProfileDetails>(
            """{"profileId":"p1","userId":"u1","exists":true,"qualityScore":80,"needsCalibration":true}""",
        ).toDomain()!!

        assertThat(ready.status).isEqualTo(VoiceProfileStatus.READY)
        assertThat(ready.quality).isEqualTo(0.5)
        assertThat(ready.sampleCount).isEqualTo(2)
        assertThat(ready.totalDurationSeconds).isEqualTo(12)
        assertThat(legacy.status).isEqualTo(VoiceProfileStatus.EXPIRED)
        assertThat(legacy.quality).isEqualTo(0.8)
    }

    @Test
    fun `exists absent is deduced from the profile id and a zero quality is unknown`() {
        val details = json.decodeFromString<VoiceProfileDetails>("""{"profileId":"p9","userId":"u1"}""")

        assertThat(details.profileExists).isTrue()
        assertThat(details.toDomain()!!.quality).isNull()
    }

    @Test
    fun `the register response tolerates missing fields`() {
        val response = json.decodeFromString<VoiceProfileRegisterResponse>("""{"profileId":"p1"}""")

        assertThat(response.profileId).isEqualTo("p1")
        assertThat(response.needsCalibration).isFalse()
    }
}
