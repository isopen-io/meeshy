package me.meeshy.app.settings

import androidx.work.WorkManager
import androidx.work.WorkRequest
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import io.mockk.slot
import io.mockk.verify
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.language.InMemoryInterfaceLanguageStore
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.NotificationType
import me.meeshy.sdk.model.UserNotificationPreferences
import me.meeshy.sdk.notification.InMemoryNotificationPreferencesStore
import me.meeshy.sdk.notification.NotificationPreferencesStore
import me.meeshy.sdk.notification.NotificationPreferencesSyncRepository
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.theme.InMemoryThemeStore
import me.meeshy.sdk.user.UserRepository
import org.junit.After
import org.junit.Before
import org.junit.Test

/**
 * The backend-sync wiring in [SettingsViewModel]: every notification-preference toggle
 * persists to the device-local store instantly (UI SSOT) and then enqueues a durable
 * `UPDATE_SETTINGS` mutation through [NotificationPreferencesSyncRepository], waking the
 * flush worker only when a real row was queued. The UI-only search query never syncs.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class SettingsViewModelSyncTest {

    private val dispatcher = StandardTestDispatcher()

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun vm(
        store: NotificationPreferencesStore = InMemoryNotificationPreferencesStore(),
        sync: NotificationPreferencesSyncRepository,
        workManager: WorkManager,
    ): SettingsViewModel {
        val session = mockk<SessionRepository>()
        every { session.currentUser } returns MutableStateFlow<MeeshyUser?>(null)
        return SettingsViewModel(
            sessionRepository = session,
            userRepository = mockk<UserRepository>(relaxed = true),
            themeStore = InMemoryThemeStore(),
            interfaceLanguageStore = InMemoryInterfaceLanguageStore(),
            notificationPreferencesStore = store,
            notificationPreferencesSyncRepository = sync,
            workManager = workManager,
        )
    }

    @Test
    fun togglingANotification_persistsLocallyThenEnqueuesTheSnapshotAndWakesTheWorker() =
        runTest(dispatcher) {
            val store = InMemoryNotificationPreferencesStore()
            val sync = mockk<NotificationPreferencesSyncRepository>()
            val captured = slot<UserNotificationPreferences>()
            coEvery { sync.enqueueSync(capture(captured)) } returns "cmid_1"
            val workManager = mockk<WorkManager>(relaxed = true)
            val vm = vm(store = store, sync = sync, workManager = workManager)
            advanceUntilIdle()

            vm.setPushEnabled(false)
            advanceUntilIdle()

            // instant local persist (UI SSOT)
            assertThat(store.preferences.value.pushEnabled).isFalse()
            // the durable enqueue carries the just-updated snapshot
            coVerify(exactly = 1) { sync.enqueueSync(any()) }
            assertThat(captured.captured.pushEnabled).isFalse()
            verify(exactly = 1) { workManager.enqueue(any<WorkRequest>()) }
        }

    @Test
    fun everyPersistedNotificationToggle_flowsThroughTheDurableSync() = runTest(dispatcher) {
        val sync = mockk<NotificationPreferencesSyncRepository>(relaxed = true)
        coEvery { sync.enqueueSync(any()) } returns "cmid"
        val workManager = mockk<WorkManager>(relaxed = true)
        val vm = vm(sync = sync, workManager = workManager)
        advanceUntilIdle()

        vm.setSoundEnabled(false)
        vm.setVibrationEnabled(false)
        vm.setNewMessageEnabled(false)
        vm.setDndEnabled(true)
        vm.setNotificationTypeEnabled(NotificationType.MENTION, false)
        advanceUntilIdle()

        coVerify(exactly = 5) { sync.enqueueSync(any()) }
        verify(exactly = 5) { workManager.enqueue(any<WorkRequest>()) }
    }

    @Test
    fun aSupersededOrSessionlessEnqueue_doesNotWakeTheWorker() = runTest(dispatcher) {
        val sync = mockk<NotificationPreferencesSyncRepository>()
        // null cmid = superseded / no active session — nothing to flush.
        coEvery { sync.enqueueSync(any()) } returns null
        val workManager = mockk<WorkManager>(relaxed = true)
        val vm = vm(sync = sync, workManager = workManager)
        advanceUntilIdle()

        vm.setSoundEnabled(false)
        advanceUntilIdle()

        coVerify(exactly = 1) { sync.enqueueSync(any()) }
        verify(exactly = 0) { workManager.enqueue(any<WorkRequest>()) }
    }

    @Test
    fun theSearchQuery_isUiOnlyAndNeverSyncs() = runTest(dispatcher) {
        val sync = mockk<NotificationPreferencesSyncRepository>(relaxed = true)
        val workManager = mockk<WorkManager>(relaxed = true)
        val vm = vm(sync = sync, workManager = workManager)
        advanceUntilIdle()

        vm.setNotificationTypeQuery("mention")
        advanceUntilIdle()

        assertThat(vm.state.value.notificationTypeQuery).isEqualTo("mention")
        coVerify(exactly = 0) { sync.enqueueSync(any()) }
        verify(exactly = 0) { workManager.enqueue(any<WorkRequest>()) }
    }
}
