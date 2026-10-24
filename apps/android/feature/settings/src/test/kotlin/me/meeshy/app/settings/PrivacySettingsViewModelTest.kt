package me.meeshy.app.settings

import androidx.work.WorkManager
import androidx.work.WorkRequest
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import io.mockk.slot
import io.mockk.verify
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
import me.meeshy.sdk.location.InMemoryLocationSharingPreferencesStore
import me.meeshy.sdk.location.LocationSharingPreferencesStore
import me.meeshy.sdk.model.LocationPrecision
import me.meeshy.sdk.model.PrivacyCatalog
import me.meeshy.sdk.model.PrivacyPreferenceSyncBody
import me.meeshy.sdk.model.SharedMapStyle
import me.meeshy.sdk.model.PrivacyInfoTopic
import me.meeshy.sdk.model.PrivacyPreferences
import me.meeshy.sdk.model.PrivacyToggle
import me.meeshy.sdk.privacy.AnalyticsCollectionGate
import me.meeshy.sdk.privacy.NoOpAnalyticsCollectionGate
import me.meeshy.sdk.privacy.PrivacyPreferencesStore
import me.meeshy.sdk.privacy.PrivacyPreferencesSyncRepository
import org.junit.After
import org.junit.Before
import org.junit.Test

/**
 * Behavioural coverage of [PrivacySettingsViewModel]: it mirrors the store's persisted privacy
 * block into an immutable UI state, persists a per-toggle change through the store SSOT without
 * clobbering the other toggles, short-circuits a no-op re-set, and propagates a real change to the
 * gateway through the durable sync repository — waking the flush worker only when a real row was
 * queued.
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

    private fun vm(
        store: PrivacyPreferencesStore = RecordingStore(),
        sync: PrivacyPreferencesSyncRepository = mockk(relaxed = true),
        workManager: WorkManager = mockk(relaxed = true),
        locationStore: LocationSharingPreferencesStore = InMemoryLocationSharingPreferencesStore(),
        gate: AnalyticsCollectionGate = NoOpAnalyticsCollectionGate,
    ) = PrivacySettingsViewModel(store, sync, workManager, locationStore, gate)

    @Test
    fun state_mirrorsThePersistedPreferences() = runTest {
        val store = RecordingStore(PrivacyPreferences(blockScreenshots = true))
        val vm = vm(store = store)
        advanceUntilIdle()
        assertThat(vm.state.value.preferences.blockScreenshots).isTrue()
    }

    @Test
    fun setToggle_persistsTheChange_leavingOtherTogglesUntouched() = runTest {
        val store = RecordingStore()
        val vm = vm(store = store)
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
        val vm = vm(store = store)
        advanceUntilIdle()

        // « Appels hors contacts » est vrai par défaut : le fermer est le vrai changement.
        vm.setToggle(PrivacyToggle.ALLOW_CALLS_FROM_NON_CONTACTS, false)
        vm.setToggle(PrivacyToggle.SHOW_TYPING_INDICATOR, false)
        vm.setToggle(PrivacyToggle.ALLOW_ANALYTICS, true)
        advanceUntilIdle()

        val prefs = store.preferences.value
        assertThat(prefs.acceptCallsFromNonContacts).isFalse()
        assertThat(prefs.showTypingIndicator).isFalse()
        assertThat(prefs.allowAnalytics).isTrue()
    }

    @Test
    fun state_showsTheCallsSwitchOpenByDefault_likeTheServer() = runTest {
        val vm = vm()
        advanceUntilIdle()

        assertThat(vm.state.value.preferences.acceptCallsFromNonContacts).isTrue()
    }

    @Test
    fun setToggle_closingTheCalls_syncsTheCanonicalFieldToTheGateway() = runTest {
        val store = RecordingStore()
        val sync = mockk<PrivacyPreferencesSyncRepository>()
        val captured = slot<PrivacyPreferences>()
        coEvery { sync.enqueueSync(capture(captured)) } returns "cmid_1"
        val vm = vm(store = store, sync = sync)
        advanceUntilIdle()

        vm.setToggle(PrivacyToggle.ALLOW_CALLS_FROM_NON_CONTACTS, false)
        advanceUntilIdle()

        assertThat(captured.captured.acceptCallsFromNonContacts).isFalse()
        assertThat(PrivacyPreferenceSyncBody.from(captured.captured).acceptCallsFromNonContacts).isFalse()
    }

    @Test
    fun setToggle_reSettingTheCurrentValue_isANoOpWrite() = runTest {
        // showOnlineStatus already defaults true.
        val store = RecordingStore()
        val vm = vm(store = store)
        advanceUntilIdle()

        vm.setToggle(PrivacyToggle.SHOW_ONLINE_STATUS, true)
        advanceUntilIdle()

        assertThat(store.writeCount).isEqualTo(0)
    }

    @Test
    fun setToggle_aRealChange_writesExactlyOnce() = runTest {
        val store = RecordingStore()
        val vm = vm(store = store)
        advanceUntilIdle()

        vm.setToggle(PrivacyToggle.SHOW_TYPING_INDICATOR, false)
        advanceUntilIdle()

        assertThat(store.writeCount).isEqualTo(1)
    }

    @Test
    fun setToggle_aRealChange_persistsLocallyThenEnqueuesTheSnapshotAndWakesTheWorker() = runTest {
        val store = RecordingStore()
        val sync = mockk<PrivacyPreferencesSyncRepository>()
        val captured = slot<PrivacyPreferences>()
        coEvery { sync.enqueueSync(capture(captured)) } returns "cmid_1"
        val workManager = mockk<WorkManager>(relaxed = true)
        val vm = vm(store = store, sync = sync, workManager = workManager)
        advanceUntilIdle()

        vm.setToggle(PrivacyToggle.SHOW_TYPING_INDICATOR, false)
        advanceUntilIdle()

        // instant local persist (UI SSOT)
        assertThat(store.preferences.value.showTypingIndicator).isFalse()
        // the durable enqueue carries the just-updated snapshot
        coVerify(exactly = 1) { sync.enqueueSync(any()) }
        assertThat(captured.captured.showTypingIndicator).isFalse()
        verify(exactly = 1) { workManager.enqueue(any<WorkRequest>()) }
    }

    @Test
    fun setToggle_aNoOpReSet_neverSyncsNorWakesTheWorker() = runTest {
        val store = RecordingStore()
        val sync = mockk<PrivacyPreferencesSyncRepository>(relaxed = true)
        val workManager = mockk<WorkManager>(relaxed = true)
        val vm = vm(store = store, sync = sync, workManager = workManager)
        advanceUntilIdle()

        // showOnlineStatus already defaults true — re-setting it is inert.
        vm.setToggle(PrivacyToggle.SHOW_ONLINE_STATUS, true)
        advanceUntilIdle()

        coVerify(exactly = 0) { sync.enqueueSync(any()) }
        verify(exactly = 0) { workManager.enqueue(any<WorkRequest>()) }
    }

    @Test
    fun setToggle_aSupersededOrSessionlessEnqueue_doesNotWakeTheWorker() = runTest {
        val store = RecordingStore()
        val sync = mockk<PrivacyPreferencesSyncRepository>()
        // null cmid = superseded / no active session — nothing to flush.
        coEvery { sync.enqueueSync(any()) } returns null
        val workManager = mockk<WorkManager>(relaxed = true)
        val vm = vm(store = store, sync = sync, workManager = workManager)
        advanceUntilIdle()

        vm.setToggle(PrivacyToggle.SHOW_TYPING_INDICATOR, false)
        advanceUntilIdle()

        // local persist still happens (UI SSOT)
        assertThat(store.preferences.value.showTypingIndicator).isFalse()
        coVerify(exactly = 1) { sync.enqueueSync(any()) }
        verify(exactly = 0) { workManager.enqueue(any<WorkRequest>()) }
    }

    @Test
    fun locationPrecision_defaultsToExact() = runTest {
        val vm = vm()
        advanceUntilIdle()
        assertThat(vm.state.value.locationSharing.precision).isEqualTo(LocationPrecision.EXACT)
    }

    @Test
    fun setLocationPrecision_persistsAndRepaints() = runTest {
        val location = InMemoryLocationSharingPreferencesStore()
        val vm = vm(locationStore = location)
        advanceUntilIdle()

        vm.setLocationPrecision(LocationPrecision.CITY)
        advanceUntilIdle()

        assertThat(location.preferences.value.precision).isEqualTo(LocationPrecision.CITY)
        assertThat(vm.state.value.locationSharing.precision).isEqualTo(LocationPrecision.CITY)
    }

    @Test
    fun setLocationMapStyle_persistsAndRepaints() = runTest {
        val location = InMemoryLocationSharingPreferencesStore()
        val vm = vm(locationStore = location)
        advanceUntilIdle()

        vm.setLocationMapStyle(SharedMapStyle.IMAGERY)
        advanceUntilIdle()

        assertThat(location.preferences.value.mapStyle).isEqualTo(SharedMapStyle.IMAGERY)
        assertThat(vm.state.value.locationSharing.mapStyle).isEqualTo(SharedMapStyle.IMAGERY)
    }

    private class RecordingGate : AnalyticsCollectionGate {
        val calls = mutableListOf<Boolean>()
        override fun onAnalyticsConsentChanged(enabled: Boolean) { calls += enabled }
    }

    @Test
    fun setToggle_onAComingSoonRow_isRefused_andTheStoredValueStaysIntact() = runTest {
        val store = RecordingStore(PrivacyPreferences(blockScreenshots = true))
        val sync = mockk<PrivacyPreferencesSyncRepository>(relaxed = true)
        val vm = vm(store = store, sync = sync)
        advanceUntilIdle()

        listOf(
            PrivacyToggle.BLOCK_SCREENSHOTS, PrivacyToggle.SAVE_MEDIA_TO_GALLERY,
            PrivacyToggle.SHARE_USAGE_DATA, PrivacyToggle.ALLOW_CONTACT_REQUESTS,
            PrivacyToggle.ALLOW_GROUP_INVITES,
        ).forEach { vm.setToggle(it, !PrivacyCatalog.isEnabled(store.preferences.value, it)) }
        advanceUntilIdle()

        assertThat(store.writeCount).isEqualTo(0)
        assertThat(store.preferences.value.blockScreenshots).isTrue()
        coVerify(exactly = 0) { sync.enqueueSync(any()) }
    }

    @Test
    fun setToggle_notifyContactsOnReturn_persistsAndSyncsTheThirteenthKey() = runTest {
        val store = RecordingStore()
        val sync = mockk<PrivacyPreferencesSyncRepository>()
        val captured = slot<PrivacyPreferences>()
        coEvery { sync.enqueueSync(capture(captured)) } returns "cmid_1"
        val vm = vm(store = store, sync = sync)
        advanceUntilIdle()

        vm.setToggle(PrivacyToggle.NOTIFY_CONTACTS_ON_RETURN, false)
        advanceUntilIdle()

        assertThat(store.preferences.value.notifyContactsOnReturn).isFalse()
        assertThat(PrivacyPreferenceSyncBody.from(captured.captured).notifyContactsOnReturn).isFalse()
    }

    @Test
    fun info_opensForARowAndClosesOnDismiss() = runTest {
        val vm = vm()
        advanceUntilIdle()
        assertThat(vm.state.value.presentedInfo).isNull()

        vm.showInfo(PrivacyInfoTopic.READ_RECEIPTS)
        advanceUntilIdle()
        assertThat(vm.state.value.presentedInfo).isEqualTo(PrivacyInfoTopic.READ_RECEIPTS)

        vm.dismissInfo()
        advanceUntilIdle()
        assertThat(vm.state.value.presentedInfo).isNull()
    }

    @Test
    fun analyticsGate_isCalledOncePerRealChange_andNeverForOtherTogglesOrNoOps() = runTest {
        val gate = RecordingGate()
        val vm = vm(gate = gate)
        advanceUntilIdle()

        vm.setToggle(PrivacyToggle.ALLOW_ANALYTICS, true)
        vm.setToggle(PrivacyToggle.ALLOW_ANALYTICS, true)
        vm.setToggle(PrivacyToggle.SHOW_LAST_SEEN, false)
        vm.setToggle(PrivacyToggle.ALLOW_ANALYTICS, false)
        advanceUntilIdle()

        assertThat(gate.calls).containsExactly(true, false).inOrder()
    }
}
