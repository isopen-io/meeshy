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
import me.meeshy.sdk.model.PrivacyPreferences
import me.meeshy.sdk.model.PrivacyToggle
import me.meeshy.sdk.privacy.PrivacyPreferencesStore
import org.junit.After
import org.junit.Before
import org.junit.Test

/**
 * Behavioural coverage of [PrivacySettingsViewModel]: it mirrors the store's persisted privacy
 * block into an immutable UI state, persists a per-toggle change through the store SSOT without
 * clobbering the other toggles, and short-circuits a no-op re-set.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class PrivacySettingsViewModelTest {

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
        initial: PrivacyPreferences = PrivacyPreferences(),
    ) : PrivacyPreferencesStore {
        private val flow = MutableStateFlow(initial)
        override val preferences: StateFlow<PrivacyPreferences> = flow.asStateFlow()
        var writeCount: Int = 0
            private set

        override suspend fun setPreferences(preferences: PrivacyPreferences) {
            writeCount += 1
            flow.value = preferences
        }
    }

    @Test
    fun state_mirrorsThePersistedPreferences() = runTest {
        val store = RecordingStore(PrivacyPreferences(blockScreenshots = true))
        val vm = PrivacySettingsViewModel(store)
        advanceUntilIdle()
        assertThat(vm.state.value.preferences.blockScreenshots).isTrue()
    }

    @Test
    fun setToggle_persistsTheChange_leavingOtherTogglesUntouched() = runTest {
        val store = RecordingStore()
        val vm = PrivacySettingsViewModel(store)
        advanceUntilIdle()

        vm.setToggle(PrivacyToggle.SHOW_ONLINE_STATUS, false)
        advanceUntilIdle()

        assertThat(store.preferences.value.showOnlineStatus).isFalse()
        assertThat(store.preferences.value.showLastSeen).isEqualTo(PrivacyPreferences().showLastSeen)
        assertThat(store.preferences.value.allowAnalytics).isEqualTo(PrivacyPreferences().allowAnalytics)
        assertThat(vm.state.value.preferences.showOnlineStatus).isFalse()
    }

    @Test
    fun setToggle_routesEachToggleToItsOwnField() = runTest {
        val store = RecordingStore()
        val vm = PrivacySettingsViewModel(store)
        advanceUntilIdle()

        vm.setToggle(PrivacyToggle.ALLOW_CALLS_FROM_NON_CONTACTS, true)
        vm.setToggle(PrivacyToggle.BLOCK_SCREENSHOTS, true)
        vm.setToggle(PrivacyToggle.ALLOW_ANALYTICS, false)
        advanceUntilIdle()

        val prefs = store.preferences.value
        assertThat(prefs.allowCallsFromNonContacts).isTrue()
        assertThat(prefs.blockScreenshots).isTrue()
        assertThat(prefs.allowAnalytics).isFalse()
    }

    @Test
    fun setToggle_reSettingTheCurrentValue_isANoOpWrite() = runTest {
        // showOnlineStatus already defaults true.
        val store = RecordingStore()
        val vm = PrivacySettingsViewModel(store)
        advanceUntilIdle()

        vm.setToggle(PrivacyToggle.SHOW_ONLINE_STATUS, true)
        advanceUntilIdle()

        assertThat(store.writeCount).isEqualTo(0)
    }

    @Test
    fun setToggle_aRealChange_writesExactlyOnce() = runTest {
        val store = RecordingStore()
        val vm = PrivacySettingsViewModel(store)
        advanceUntilIdle()

        vm.setToggle(PrivacyToggle.BLOCK_SCREENSHOTS, true)
        advanceUntilIdle()

        assertThat(store.writeCount).isEqualTo(1)
    }
}
