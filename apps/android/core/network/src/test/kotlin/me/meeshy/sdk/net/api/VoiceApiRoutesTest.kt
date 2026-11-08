package me.meeshy.sdk.net.api

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.VoiceConsentRequest
import me.meeshy.sdk.model.VoiceProfileAudioRequest
import me.meeshy.sdk.model.voice.ConsentUpdateRequest
import me.meeshy.sdk.model.voice.VoiceTranslateAsyncRequest
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody
import org.junit.Test

/** Les routes `/voice/…` et `/me/consents`, telles qu'elles partent (#15085). */
class VoiceApiRoutesTest {

    private fun voice(http: RecordingHttp) = http.serve(VoiceApi::class.java)

    @Test
    fun `reading the consent status asks the profile consent route and decodes the three stamps`() = runTest {
        val http = RecordingHttp(
            responseBody = """{"success":true,"data":{"voiceRecordingConsentAt":"2026-10-01T10:00:00.000Z","voiceCloningEnabledAt":null,"ageVerificationConsentAt":null}}""",
        )

        val status = voice(http).consentStatus().data!!

        assertThat(http.only.method).isEqualTo("GET")
        assertThat(http.only.path).isEqualTo("/api/v1/voice/profile/consent")
        assertThat(status.hasConsent).isTrue()
    }

    @Test
    fun `granting posts the recording consent and the cloning flag, revoking writes false only`() = runTest {
        val grant = RecordingHttp()
        voice(grant).setConsent(VoiceConsentRequest(voiceRecordingConsent = true, voiceCloningConsent = true))
        val revoke = RecordingHttp()
        voice(revoke).setConsent(VoiceConsentRequest(voiceRecordingConsent = false))

        assertThat(grant.only.method).isEqualTo("POST")
        assertThat(grant.only.path).isEqualTo("/api/v1/voice/profile/consent")
        assertThat(grant.only.body).contains("\"voiceRecordingConsent\":true")
        assertThat(grant.only.body).contains("\"voiceCloningConsent\":true")
        assertThat(revoke.only.body).contains("\"voiceRecordingConsent\":false")
        assertThat(revoke.only.body).doesNotContain("voiceCloningConsent")
    }

    @Test
    fun `the profile is read and deleted on the same route`() = runTest {
        val read = RecordingHttp(responseBody = """{"success":true,"data":{"profileId":null,"userId":"u","exists":false}}""")
        val gone = RecordingHttp(responseBody = """{"success":true,"data":{"deleted":true,"samplesDeleted":3}}""")

        assertThat(voice(read).profile().data!!.toDomain()).isNull()
        val deleted = voice(gone).deleteProfile().data!!

        assertThat(read.only.method).isEqualTo("GET")
        assertThat(gone.only.method).isEqualTo("DELETE")
        assertThat(gone.only.path).isEqualTo("/api/v1/voice/profile")
        assertThat(deleted.samplesDeleted).isEqualTo(3)
    }

    @Test
    fun `registering sends a multipart file with its format and never a base64 body`() = runTest {
        val http = RecordingHttp(responseBody = """{"success":true,"data":{"profileId":"p1","qualityScore":72.5,"audioDurationMs":11000}}""")
        val part = MultipartBody.Part.createFormData("file", "sample.m4a", "abc".toRequestBody("audio/mp4".toMediaType()))

        val response = voice(http).register(part, "m4a".toRequestBody(), "11000".toRequestBody())

        assertThat(http.only.method).isEqualTo("POST")
        assertThat(http.only.path).isEqualTo("/api/v1/voice/profile/register")
        assertThat(http.only.contentType).startsWith("multipart/form-data")
        assertThat(http.only.body).contains("name=\"audioFormat\"")
        assertThat(http.only.body).contains("name=\"file\"; filename=\"sample.m4a\"")
        assertThat(response.data!!.profileId).isEqualTo("p1")
    }

    @Test
    fun `recalibrating puts the audio on the profile id`() = runTest {
        val http = RecordingHttp()

        voice(http).recalibrate("p1", VoiceProfileAudioRequest(audioData = "QUJD", audioFormat = "m4a"))

        assertThat(http.only.method).isEqualTo("PUT")
        assertThat(http.only.path).isEqualTo("/api/v1/voice/profile/p1")
        assertThat(http.only.body).contains("\"audioData\":\"QUJD\"")
    }

    @Test
    fun `an async translation targets an existing attachment and a job is read and cancelled by id`() = runTest {
        val start = RecordingHttp(responseBody = """{"success":true,"data":{"jobId":"j1","taskId":"j1","status":"processing"}}""")
        val poll = RecordingHttp(responseBody = """{"success":true,"data":{"jobId":"j1","status":"completed","progress":1}}""")
        val cancel = RecordingHttp()

        val accepted = voice(start).translateAsync(VoiceTranslateAsyncRequest("att1", listOf("en", "es"), generateVoiceClone = true)).data!!
        val job = voice(poll).job("j1").data!!
        voice(cancel).cancelJob("j1")

        assertThat(start.only.path).isEqualTo("/api/v1/voice/translate/async")
        assertThat(start.only.body).contains("\"attachmentId\":\"att1\"")
        assertThat(accepted.id).isEqualTo("j1")
        assertThat(poll.only.path).isEqualTo("/api/v1/voice/job/j1")
        assertThat(job.status.isTerminal).isTrue()
        assertThat(cancel.only.method).isEqualTo("DELETE")
    }

    @Test
    fun `the remaining voice routes keep their verb and path`() = runTest {
        val http = RecordingHttp()
        val api = voice(http)

        api.languages()
        api.history()
        api.adminMetrics()
        api.analysis()

        assertThat(http.requests.map { it.method + " " + it.path }).containsExactly(
            "GET /api/v1/voice/languages",
            "GET /api/v1/voice/history",
            "GET /api/v1/voice/admin/metrics",
            "GET /api/v1/voice/analysis",
        ).inOrder()
    }

    @Test
    fun `consents are listed and granted by purpose with the policy version`() = runTest {
        val list = RecordingHttp(responseBody = """{"success":true,"data":{"consents":[{"purpose":"voice-profile","granted":true,"policyVersion":"2026-08-30"}]}}""")
        val put = RecordingHttp(responseBody = """{"success":true,"data":{"purpose":"voice-cloning","granted":true,"policyVersion":"2026-08-30"}}""")

        val snapshot = list.serve(ConsentsApi::class.java).consents().data!!
        val entry = put.serve(ConsentsApi::class.java).setConsent("voice-cloning", ConsentUpdateRequest(granted = true)).data!!

        assertThat(list.only.path).isEqualTo("/api/v1/me/consents")
        assertThat(snapshot.consents.single().granted).isTrue()
        assertThat(put.only.method).isEqualTo("PUT")
        assertThat(put.only.path).isEqualTo("/api/v1/me/consents/voice-cloning")
        assertThat(put.only.body).isEqualTo("""{"granted":true,"policyVersion":"2026-08-30"}""")
        assertThat(entry.granted).isTrue()
    }
}
