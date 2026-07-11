package me.meeshy.app.settings

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.media.MediaDownloadPreferencesStore
import me.meeshy.sdk.model.AutoDownloadPolicy
import me.meeshy.sdk.model.MediaDownloadPreferences
import me.meeshy.sdk.model.MediaKind
import org.junit.After
import org.junit.Before
import org.junit.Test

/**
 * Behavioural coverage of [MediaDownloadViewModel]: it mirrors the store's persisted policy
 * block into an immutable UI state, persists a per-kind policy change through the store SSOT
 * without clobbering the other kinds, and short-circuits a no-op re-selection.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class MediaDownloadViewModelTest {

    private val dispatcher = StandardTestDispatcher()

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    /** A store that records writes, so the no-op guard can be asserted behaviourally. */
    private class RecordingStore(
        initial: MediaDownloadPreferences = MediaDownloadPreferences(),
    ) : MediaDownloadPreferencesStore {
        private val flow = MutableStateFlow(initial)
        override val preferences: StateFlow<MediaDownloadPreferences> = flow.asStateFlow()
        var writeCount: Int = 0
            private set

        override suspend fun setPreferences(preferences: MediaDownloadPreferences) {
            writeCount += 1
            flow.value = preferences
        }
    }

    @Test
    fun state_mirrorsThePersistedPreferences() = runTest {
        val store = RecordingStore(MediaDownloadPreferences(video = AutoDownloadPolicy.ALWAYS))
        val vm = MediaDownloadViewModel(store)
        advanceUntilIdle()
        assertThat(vm.state.value.preferences.video).isEqualTo(AutoDownloadPolicy.ALWAYS)
    }

    @Test
    fun setPolicy_persistsTheChangeForThatKind_leavingOthersUntouched() = runTest {
        val store = RecordingStore()
        val vm = MediaDownloadViewModel(store)
        advanceUntilIdle()

        vm.setPolicy(MediaKind.VIDEO, AutoDownloadPolicy.ALWAYS)
        advanceUntilIdle()

        assertThat(store.preferences.value.video).isEqualTo(AutoDownloadPolicy.ALWAYS)
        assertThat(store.preferences.value.image).isEqualTo(MediaDownloadPreferences().image)
        assertThat(store.preferences.value.audio).isEqualTo(MediaDownloadPreferences().audio)
        assertThat(store.preferences.value.audioTranslation)
            .isEqualTo(MediaDownloadPreferences().audioTranslation)
        assertThat(vm.state.value.preferences.video).isEqualTo(AutoDownloadPolicy.ALWAYS)
    }

    @Test
    fun setPolicy_routesEachKindToItsOwnField() = runTest {
        val store = RecordingStore()
        val vm = MediaDownloadViewModel(store)
        advanceUntilIdle()

        vm.setPolicy(MediaKind.IMAGE, AutoDownloadPolicy.NEVER)
        vm.setPolicy(MediaKind.AUDIO, AutoDownloadPolicy.ALWAYS)
        vm.setPolicy(MediaKind.AUDIO_TRANSLATION, AutoDownloadPolicy.ALWAYS)
        advanceUntilIdle()

        val prefs = store.preferences.value
        assertThat(prefs.image).isEqualTo(AutoDownloadPolicy.NEVER)
        assertThat(prefs.audio).isEqualTo(AutoDownloadPolicy.ALWAYS)
        assertThat(prefs.audioTranslation).isEqualTo(AutoDownloadPolicy.ALWAYS)
    }

    @Test
    fun setPolicy_reselectingTheCurrentPolicy_isANoOpWrite() = runTest {
        val store = RecordingStore(MediaDownloadPreferences(image = AutoDownloadPolicy.NEVER))
        val vm = MediaDownloadViewModel(store)
        advanceUntilIdle()

        vm.setPolicy(MediaKind.IMAGE, AutoDownloadPolicy.NEVER)
        advanceUntilIdle()

        assertThat(store.writeCount).isEqualTo(0)
    }

    @Test
    fun setPolicy_aRealChange_writesExactlyOnce() = runTest {
        val store = RecordingStore()
        val vm = MediaDownloadViewModel(store)
        advanceUntilIdle()

        vm.setPolicy(MediaKind.VIDEO, AutoDownloadPolicy.ALWAYS)
        advanceUntilIdle()

        assertThat(store.writeCount).isEqualTo(1)
    }
}
