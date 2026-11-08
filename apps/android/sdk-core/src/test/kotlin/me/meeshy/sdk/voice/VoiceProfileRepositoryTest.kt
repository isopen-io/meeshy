package me.meeshy.sdk.voice

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import io.mockk.slot
import java.io.File
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.VoiceConsentRequest
import me.meeshy.sdk.model.VoiceConsentResponse
import me.meeshy.sdk.model.VoiceProfileAudioRequest
import me.meeshy.sdk.model.VoiceProfileDeleteResponse
import me.meeshy.sdk.model.VoiceProfileDetails
import me.meeshy.sdk.model.VoiceProfileRegisterResponse
import me.meeshy.sdk.model.voice.ConsentPurpose
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.ConsentsApi
import me.meeshy.sdk.net.api.VoiceApi
import org.junit.Test

class VoiceProfileRepositoryTest {

    private class Fixture(val api: VoiceApi, val store: InMemoryGrantedConsentsStore, val repository: VoiceProfileRepository)

    private fun fixture(known: Set<ConsentPurpose> = emptySet()): Fixture {
        val api = mockk<VoiceApi>()
        val store = InMemoryGrantedConsentsStore(known)
        return Fixture(api, store, VoiceProfileRepository(api, ConsentsRepository(mockk<ConsentsApi>(), store), store))
    }

    private fun sample(): File = File.createTempFile("sample", ".m4a").apply { writeBytes(byteArrayOf(1, 2, 3)); deleteOnExit() }

    private fun existing(id: String? = "p1", count: Int = 2) =
        ApiResponse(success = true, data = VoiceProfileDetails(profileId = id, userId = "u", exists = id != null, audioCount = count))

    @Test
    fun `granting consent with cloning writes both flags and records the lineage`() = runTest {
        val f = fixture()
        val body = slot<VoiceConsentRequest>()
        coEvery { f.api.setConsent(capture(body)) } returns ApiResponse(success = true, data = VoiceConsentResponse("t", "t", null))

        val result = f.repository.grantConsent(voiceCloningConsent = true, birthDate = "2000-01-02")

        assertThat(result).isInstanceOf(NetworkResult.Success::class.java)
        assertThat(body.captured).isEqualTo(VoiceConsentRequest(true, true, "2000-01-02"))
        assertThat(f.store.granted.value).containsAtLeast(ConsentPurpose.VOICE_PROFILE, ConsentPurpose.VOICE_CLONING)
    }

    @Test
    fun `granting recording only omits the cloning flag`() = runTest {
        val f = fixture()
        val body = slot<VoiceConsentRequest>()
        coEvery { f.api.setConsent(capture(body)) } returns ApiResponse(success = true, data = VoiceConsentResponse())

        f.repository.grantConsent()

        assertThat(body.captured.voiceCloningConsent).isNull()
        assertThat(f.store.granted.value).doesNotContain(ConsentPurpose.VOICE_CLONING)
    }

    @Test
    fun `revoking writes false and forgets the profile consent and its descendants`() = runTest {
        val f = fixture(known = ConsentPurpose.VOICE_CLONING.lineage.toSet())
        val body = slot<VoiceConsentRequest>()
        coEvery { f.api.setConsent(capture(body)) } returns ApiResponse(success = true, data = VoiceConsentResponse())

        f.repository.revokeConsent()

        assertThat(body.captured.voiceRecordingConsent).isFalse()
        assertThat(f.store.granted.value).containsExactly(ConsentPurpose.VOICE_DATA, ConsentPurpose.DATA_PROCESSING)
    }

    @Test
    fun `a failed revoke keeps the local consent`() = runTest {
        val f = fixture(known = setOf(ConsentPurpose.VOICE_PROFILE))
        coEvery { f.api.setConsent(any()) } returns ApiResponse(success = false, error = "no", code = "X")

        val result = f.repository.revokeConsent()

        assertThat(result).isInstanceOf(NetworkResult.Failure::class.java)
        assertThat(f.store.granted.value).containsExactly(ConsentPurpose.VOICE_PROFILE)
    }

    @Test
    fun `a profile that does not exist is an empty state, not an error`() = runTest {
        val f = fixture()
        coEvery { f.api.profile() } returns existing(id = null)

        assertThat(f.repository.profile()).isEqualTo(NetworkResult.Success(null))
    }

    @Test
    fun `samples are always empty because the gateway models one profile`() = runTest {
        assertThat(fixture().repository.samples()).isEmpty()
    }

    @Test
    fun `uploading without an active consent is refused locally before any network`() = runTest {
        val f = fixture()

        val result = f.repository.uploadSample(sample(), durationMs = 11_000)

        assertThat((result as NetworkResult.Failure).error.code).isEqualTo(VoiceProfileRepository.CONSENT_REQUIRED)
        coVerify(exactly = 0) { f.api.profile() }
        coVerify(exactly = 0) { f.api.register(any(), any(), any()) }
    }

    @Test
    fun `the first sample registers the profile as a multipart file`() = runTest {
        val f = fixture(known = setOf(ConsentPurpose.VOICE_PROFILE))
        coEvery { f.api.profile() } returns existing(id = null)
        coEvery { f.api.register(any(), any(), any()) } returns ApiResponse(success = true, data = VoiceProfileRegisterResponse(profileId = "p9"))

        val result = f.repository.uploadSample(sample(), durationMs = 12_000) as NetworkResult.Success

        assertThat(result.data.profileId).isEqualTo("p9")
        assertThat(result.data.sampleCount).isEqualTo(1)
        assertThat(result.data.durationMs).isEqualTo(12_000)
    }

    @Test
    fun `later samples recalibrate the existing profile and count one more`() = runTest {
        val f = fixture(known = setOf(ConsentPurpose.VOICE_PROFILE))
        coEvery { f.api.profile() } returns existing(id = "p1", count = 2)
        val body = slot<VoiceProfileAudioRequest>()
        coEvery { f.api.recalibrate("p1", capture(body)) } returns ApiResponse(success = true, data = VoiceProfileRegisterResponse(profileId = "p1"))

        val result = f.repository.uploadSample(sample(), durationMs = 8_000) as NetworkResult.Success

        assertThat(result.data.sampleCount).isEqualTo(3)
        assertThat(body.captured.audioData).isEqualTo("AQID")
        assertThat(body.captured.audioFormat).isEqualTo("m4a")
    }

    @Test
    fun `switching cloning off writes an explicit false and drops the cloning consent`() = runTest {
        val f = fixture(known = ConsentPurpose.VOICE_CLONING.lineage.toSet())
        val body = slot<VoiceConsentRequest>()
        coEvery { f.api.setConsent(capture(body)) } returns ApiResponse(success = true, data = VoiceConsentResponse())

        f.repository.toggleVoiceCloning(enabled = false)

        assertThat(body.captured).isEqualTo(VoiceConsentRequest(voiceRecordingConsent = true, voiceCloningConsent = false))
        assertThat(f.store.granted.value).doesNotContain(ConsentPurpose.VOICE_CLONING)
        assertThat(f.store.granted.value).contains(ConsentPurpose.VOICE_PROFILE)
    }

    @Test
    fun `deleting the profile reports the erased samples`() = runTest {
        val f = fixture()
        coEvery { f.api.deleteProfile() } returns ApiResponse(success = true, data = VoiceProfileDeleteResponse(true, 3))

        val result = f.repository.deleteProfile() as NetworkResult.Success

        assertThat(result.data.samplesDeleted).isEqualTo(3)
    }

    @Test
    fun `a network error maps to a failure and never throws`() = runTest {
        val f = fixture()
        coEvery { f.api.deleteProfile() } throws java.io.IOException("offline")

        assertThat(f.repository.deleteProfile()).isInstanceOf(NetworkResult.Failure::class.java)
    }
}
