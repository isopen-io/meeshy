package me.meeshy.app.settings

import androidx.work.WorkManager
import androidx.work.WorkRequest
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.audio.AudioPreferencesSyncRepository
import me.meeshy.sdk.audio.InMemoryAudioPreferencesStore
import me.meeshy.sdk.model.AudioPreferences
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class TranscriptionSettingsViewModelTest {

    private val dispatcher = StandardTestDispatcher()

    @Before fun setUp() = Dispatchers.setMain(dispatcher)

    @After fun tearDown() = Dispatchers.resetMain()

    private class Fixture(
        val store: InMemoryAudioPreferencesStore,
        val sync: AudioPreferencesSyncRepository,
        val workManager: WorkManager,
        val viewModel: TranscriptionSettingsViewModel,
    )

    private fun fixture(enqueued: String? = "cmid_1"): Fixture {
        val store = InMemoryAudioPreferencesStore()
        val sync = mockk<AudioPreferencesSyncRepository>(relaxed = true)
        coEvery { sync.enqueueSync(any()) } returns enqueued
        val workManager = mockk<WorkManager>(relaxed = true)
        return Fixture(store, sync, workManager, TranscriptionSettingsViewModel(store, sync, workManager))
    }

    @Test
    fun `la transcription automatique est active par défaut`() {
        assertThat(fixture().viewModel.autoTranscribeIncoming.value).isTrue()
    }

    @Test
    fun `couper la transcription se peint à l'instant puis part en file et réveille le worker`() = runTest(dispatcher) {
        val f = fixture()
        advanceUntilIdle()

        f.viewModel.setAutoTranscribeIncoming(false)
        advanceUntilIdle()

        assertThat(f.store.preferences.value.autoTranscribeIncoming).isFalse()
        assertThat(f.viewModel.autoTranscribeIncoming.value).isFalse()
        coVerify(exactly = 1) { f.sync.enqueueSync(AudioPreferences(autoTranscribeIncoming = false)) }
        verify(exactly = 1) { f.workManager.enqueue(any<WorkRequest>()) }
    }

    @Test
    fun `sans ligne mise en file le worker n'est pas réveillé`() = runTest(dispatcher) {
        val f = fixture(enqueued = null)
        advanceUntilIdle()

        f.viewModel.setAutoTranscribeIncoming(false)
        advanceUntilIdle()

        assertThat(f.store.preferences.value.autoTranscribeIncoming).isFalse()
        verify(exactly = 0) { f.workManager.enqueue(any<WorkRequest>()) }
    }

    @Test
    fun `redonner la valeur courante ne synchronise rien`() = runTest(dispatcher) {
        val f = fixture()
        advanceUntilIdle()

        f.viewModel.setAutoTranscribeIncoming(true)
        advanceUntilIdle()

        coVerify(exactly = 0) { f.sync.enqueueSync(any()) }
    }

    @Test
    fun `l'ouverture relit le bloc depuis la passerelle`() = runTest(dispatcher) {
        val f = fixture()
        advanceUntilIdle()
        coVerify(exactly = 1) { f.sync.refresh() }
    }
}
