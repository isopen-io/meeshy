package me.meeshy.sdk.voice

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.audio.AudioPreferencesSyncRepository
import me.meeshy.sdk.audio.InMemoryAudioPreferencesStore
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.VoiceConsentStatus
import me.meeshy.sdk.model.voice.ConsentEntry
import me.meeshy.sdk.model.voice.ConsentPurpose
import me.meeshy.sdk.model.voice.ConsentsSnapshot
import me.meeshy.sdk.net.api.ConsentsApi
import me.meeshy.sdk.net.api.VoiceApi
import org.junit.Test

class VoiceConsentGateTest {

    private class Fixture(
        val voice: VoiceApi,
        val consentsApi: ConsentsApi,
        val store: InMemoryGrantedConsentsStore,
        val audio: InMemoryAudioPreferencesStore,
        val sync: AudioPreferencesSyncRepository,
        val gate: VoiceConsentGate,
    )

    private fun fixture(known: Set<ConsentPurpose> = emptySet()): Fixture {
        val voice = mockk<VoiceApi>()
        val consentsApi = mockk<ConsentsApi>()
        val store = InMemoryGrantedConsentsStore(known)
        val audio = InMemoryAudioPreferencesStore()
        val sync = mockk<AudioPreferencesSyncRepository>(relaxed = true)
        val consents = ConsentsRepository(consentsApi, store)
        val profiles = VoiceProfileRepository(voice, consents, store)
        return Fixture(voice, consentsApi, store, audio, sync, VoiceConsentGate(consents, store, profiles, audio, sync))
    }

    private fun entry(purpose: ConsentPurpose, granted: Boolean = true) =
        ApiResponse(success = true, data = ConsentEntry(purpose.wire, granted, "2026-10-01T10:00:00Z", "2026-08-30"))

    @Test
    fun `a consent the gateway confirmed is known without any request`() = runTest {
        val f = fixture(known = setOf(ConsentPurpose.VOICE_PROFILE))

        assertThat(f.gate.isKnownGranted).isTrue()
        assertThat(f.gate.fetchMissing()).isFalse()
        coVerify(exactly = 0) { f.voice.consentStatus() }
    }

    @Test
    fun `without a confirmed consent the REST status decides whether it is missing`() = runTest {
        val missing = fixture().apply {
            coEvery { voice.consentStatus() } returns ApiResponse(success = true, data = VoiceConsentStatus())
        }
        val present = fixture().apply {
            coEvery { voice.consentStatus() } returns
                ApiResponse(success = true, data = VoiceConsentStatus(voiceRecordingConsentAt = "2026-10-01T10:00:00Z"))
        }

        assertThat(missing.gate.fetchMissing()).isTrue()
        assertThat(present.gate.fetchMissing()).isFalse()
    }

    @Test
    fun `any error is fail-safe and never reports a missing consent`() = runTest {
        val f = fixture().apply { coEvery { voice.consentStatus() } throws java.io.IOException("offline") }

        assertThat(f.gate.fetchMissing()).isFalse()
    }

    @Test
    fun `an error answer from the gateway is also fail-safe`() = runTest {
        val f = fixture().apply {
            coEvery { voice.consentStatus() } returns ApiResponse(success = false, error = "boom", code = "INTERNAL")
        }

        assertThat(f.gate.fetchMissing()).isFalse()
    }

    @Test
    fun `granting confirms voice cloning with its whole lineage and switches the audio features on`() = runTest {
        val f = fixture()
        coEvery { f.consentsApi.setConsent("voice-cloning", any()) } returns entry(ConsentPurpose.VOICE_CLONING)

        f.gate.grant()

        assertThat(f.store.granted.value).containsAtLeast(
            ConsentPurpose.VOICE_CLONING, ConsentPurpose.VOICE_PROFILE, ConsentPurpose.VOICE_DATA, ConsentPurpose.DATA_PROCESSING,
        )
        assertThat(f.gate.isKnownGranted).isTrue()
        val audio = f.audio.preferences.value
        assertThat(audio.voiceProfileEnabled).isTrue()
        assertThat(audio.ttsEnabled).isTrue()
        assertThat(audio.transcriptionEnabled).isTrue()
        assertThat(audio.audioTranslationEnabled).isTrue()
        coVerify { f.sync.enqueueSync(audio) }
    }

    @Test
    fun `a refused grant throws before any local write`() = runTest {
        val f = fixture()
        coEvery { f.consentsApi.setConsent("voice-cloning", any()) } returns entry(ConsentPurpose.VOICE_CLONING, granted = false)

        val thrown = runCatching { f.gate.grant() }.exceptionOrNull()

        assertThat(thrown).isInstanceOf(VoiceConsentNotGrantedException::class.java)

        assertThat(f.store.granted.value).isEmpty()
        assertThat(f.audio.preferences.value.voiceProfileEnabled).isFalse()
    }

    @Test
    fun `refreshing replaces the local set so a withdrawal made elsewhere is honoured`() = runTest {
        val f = fixture(known = setOf(ConsentPurpose.VOICE_PROFILE, ConsentPurpose.VOICE_DATA, ConsentPurpose.DATA_PROCESSING))
        coEvery { f.consentsApi.consents() } returns ApiResponse(
            success = true,
            data = ConsentsSnapshot(listOf(ConsentEntry("data-processing", true), ConsentEntry("voice-profile", false))),
        )

        ConsentsRepository(f.consentsApi, f.store).refresh()

        assertThat(f.store.granted.value).containsExactly(ConsentPurpose.DATA_PROCESSING)
    }

    @Test
    fun `a failed refresh leaves the confirmed set untouched`() = runTest {
        val f = fixture(known = setOf(ConsentPurpose.VOICE_PROFILE))
        coEvery { f.consentsApi.consents() } throws java.io.IOException("offline")

        ConsentsRepository(f.consentsApi, f.store).refresh()

        assertThat(f.store.granted.value).containsExactly(ConsentPurpose.VOICE_PROFILE)
    }
}
