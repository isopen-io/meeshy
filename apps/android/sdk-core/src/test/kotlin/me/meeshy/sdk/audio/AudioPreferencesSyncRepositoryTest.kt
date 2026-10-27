package me.meeshy.sdk.audio

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import io.mockk.slot
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.decodeFromString
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.AudioPreferenceSyncBody
import me.meeshy.sdk.model.AudioPreferences
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.net.api.PreferencesApi
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxLanes
import me.meeshy.sdk.outbox.OutboxMutation
import me.meeshy.sdk.outbox.OutboxRepository
import me.meeshy.sdk.session.SessionRepository
import org.junit.Test

class AudioPreferencesSyncRepositoryTest {

    private class Fixture(
        val session: SessionRepository,
        val outbox: OutboxRepository,
        val api: PreferencesApi,
        val store: InMemoryAudioPreferencesStore,
        val repository: AudioPreferencesSyncRepository,
    )

    private fun fixture(
        userId: String? = "me-42",
        local: AudioPreferences = AudioPreferences(autoTranscribeIncoming = false),
        writePending: Boolean = false,
    ): Fixture {
        val session = mockk<SessionRepository>(relaxed = true)
        coEvery { session.currentUserId } returns userId
        val outbox = mockk<OutboxRepository>(relaxed = true)
        coEvery { outbox.hasDeliverable(any(), any()) } returns writePending
        val api = mockk<PreferencesApi>()
        val store = InMemoryAudioPreferencesStore(local)
        return Fixture(session, outbox, api, store, AudioPreferencesSyncRepository(session, outbox, api, store))
    }

    @Test
    fun `enqueueSync met l'instantané en file sur la voie des réglages, au nom de l'utilisateur`() = runTest {
        val f = fixture()
        val captured = slot<OutboxMutation>()
        coEvery { f.outbox.enqueue(capture(captured)) } returns "cmid_1"

        val cmid = f.repository.enqueueSync(AudioPreferences(autoTranscribeIncoming = false))

        assertThat(cmid).isEqualTo("cmid_1")
        assertThat(captured.captured.kind).isEqualTo(OutboxKind.UPDATE_AUDIO_SETTINGS)
        assertThat(captured.captured.lane).isEqualTo(OutboxLanes.SETTINGS)
        assertThat(captured.captured.targetId).isEqualTo("me-42")
        val body = MeeshyApi.json.decodeFromString<AudioPreferenceSyncBody>(captured.captured.payload)
        assertThat(body.autoTranscribeIncoming).isFalse()
    }

    @Test
    fun `enqueueSync est inerte sans session`() = runTest {
        val f = fixture(userId = null)
        assertThat(f.repository.enqueueSync(AudioPreferences())).isNull()
        coVerify(exactly = 0) { f.outbox.enqueue(any()) }
    }

    @Test
    fun `refresh replace le bloc local sur la valeur de la passerelle`() = runTest {
        val f = fixture(local = AudioPreferences(autoTranscribeIncoming = false, ttsSpeed = 1.5))
        coEvery { f.api.getAudio() } returns ApiResponse(success = true, data = AudioPreferenceSyncBody(true))

        f.repository.refresh()

        assertThat(f.store.preferences.value).isEqualTo(AudioPreferences(autoTranscribeIncoming = true, ttsSpeed = 1.5))
    }

    @Test
    fun `refresh saute la relecture tant qu'un envoi attend`() = runTest {
        val f = fixture(writePending = true)
        coEvery { f.api.getAudio() } returns ApiResponse(success = true, data = AudioPreferenceSyncBody(true))

        f.repository.refresh()

        assertThat(f.store.preferences.value.autoTranscribeIncoming).isFalse()
        coVerify(exactly = 0) { f.api.getAudio() }
    }

    @Test
    fun `une relecture en échec garde le bloc local`() = runTest {
        val f = fixture()
        coEvery { f.api.getAudio() } returns ApiResponse(success = false, error = "offline")

        f.repository.refresh()

        assertThat(f.store.preferences.value.autoTranscribeIncoming).isFalse()
    }

    @Test
    fun `au changement de compte le bloc audio repart aux défauts`() = runTest {
        val f = fixture()
        AudioPreferencesAccountReset(f.store).clear()
        assertThat(f.store.preferences.value).isEqualTo(AudioPreferences())
    }

    @Test
    fun `chaque compte qui s'ouvre relit le bloc audio de la passerelle, une fois par ouverture`() = runTest {
        val f = fixture(local = AudioPreferences(autoTranscribeIncoming = true))
        coEvery { f.api.getAudio() } returns ApiResponse(success = true, data = AudioPreferenceSyncBody(false))

        f.repository.refreshOnEachAccount(flowOf(null, "me-42", "me-42", null, "me-42", "other-7"))

        assertThat(f.store.preferences.value.autoTranscribeIncoming).isFalse()
        coVerify(exactly = 3) { f.api.getAudio() }
    }
}
