package me.meeshy.sdk.model.voice

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.Json
import org.junit.Test

class VoiceConsentLawTest {
    private val json = Json { ignoreUnknownKeys = true; coerceInputValues = true }

    @Test
    fun `the notice shows only on the authors own voice while consent is missing`() {
        assertThat(shouldShowConsentNotice(isOwn = true, voiceConsentMissing = true)).isTrue()
        assertThat(shouldShowConsentNotice(isOwn = false, voiceConsentMissing = true)).isFalse()
        assertThat(shouldShowConsentNotice(isOwn = true, voiceConsentMissing = false)).isFalse()
    }

    @Test
    fun `granting cloning grants its whole lineage`() {
        assertThat(ConsentPurpose.VOICE_CLONING.lineage).containsExactly(
            ConsentPurpose.VOICE_CLONING, ConsentPurpose.VOICE_PROFILE, ConsentPurpose.VOICE_DATA, ConsentPurpose.DATA_PROCESSING,
        ).inOrder()
    }

    @Test
    fun `an unknown purpose does not invalidate the others`() {
        val snapshot = json.decodeFromString<ConsentsSnapshot>(
            """{"consents":[{"purpose":"voice-profile","granted":true,"policyVersion":"2026-08-30"},{"purpose":"future","granted":true},{"purpose":"analytics","granted":false}]}""",
        )

        assertThat(snapshot.consents.grantedPurposes()).containsExactly(ConsentPurpose.VOICE_PROFILE)
    }

    @Test
    fun `the update body carries the current policy version`() {
        val body = Json { encodeDefaults = false }.encodeToString(ConsentUpdateRequest.serializer(), ConsentUpdateRequest(granted = true))

        assertThat(body).isEqualTo("""{"granted":true,"policyVersion":"2026-08-30"}""")
    }

    @Test
    fun `an unknown job status keeps waiting`() {
        val job = json.decodeFromString<VoiceJob>("""{"jobId":"j","status":"queued-elsewhere"}""")

        assertThat(job.status).isEqualTo(VoiceJobStatus.PENDING)
    }

    @Test
    fun `polling is bounded and a failure is never a silent other language`() {
        val plan = VoiceJobPollPlan(maxAttempts = 3)
        val pending = VoiceJob(jobId = "j", status = VoiceJobStatus.PROCESSING, progress = 0.4)

        assertThat(reduceVoiceJobPoll("j", pending, attempt = 0, plan = plan)).isInstanceOf(VoiceTranslationState.Running::class.java)
        assertThat(reduceVoiceJobPoll("j", pending, attempt = 2, plan = plan)).isEqualTo(VoiceTranslationState.Failed("j", "timeout"))
        assertThat(reduceVoiceJobPoll("j", VoiceJob(status = VoiceJobStatus.FAILED, error = "boom"), 0, plan))
            .isEqualTo(VoiceTranslationState.Failed("j", "boom"))
        assertThat(reduceVoiceJobPoll("j", VoiceJob(status = VoiceJobStatus.COMPLETED), 0, plan)).isInstanceOf(VoiceTranslationState.Done::class.java)
    }

    @Test
    fun `delays double up to the cap`() {
        val plan = VoiceJobPollPlan(firstDelayMs = 1_000, maxDelayMs = 4_000)

        assertThat((0..4).map(plan::delayBeforeMs)).containsExactly(1_000L, 2_000L, 4_000L, 4_000L, 4_000L).inOrder()
    }
}
