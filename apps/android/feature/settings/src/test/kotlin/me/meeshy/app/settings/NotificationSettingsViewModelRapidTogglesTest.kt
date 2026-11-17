package me.meeshy.app.settings

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.model.DndDay
import me.meeshy.sdk.model.NotificationType
import me.meeshy.sdk.model.UserNotificationPreferences
import me.meeshy.sdk.notification.NotificationPreferencesStore
import me.meeshy.sdk.notification.NotificationPreferencesSyncRepository
import org.junit.After
import org.junit.Before
import org.junit.Test

/**
 * Deux bascules à quelques millisecondes d'écart : la seconde ne relit pas l'état d'avant la
 * première. Le magasin factice ci-dessous reproduit le DataStore réel — l'écriture a une latence, et
 * l'observable `preferences` ne se met à jour qu'APRÈS elle ; ce que le disque porte se lit par
 * `awaitHydrated`.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class NotificationSettingsViewModelRapidTogglesTest {

    private val dispatcher = StandardTestDispatcher()

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private class SlowDiskStore : NotificationPreferencesStore {
        private var disk = UserNotificationPreferences()
        private val shown = MutableStateFlow(disk)
        override val preferences: StateFlow<UserNotificationPreferences> = shown.asStateFlow()

        override suspend fun setPreferences(preferences: UserNotificationPreferences) {
            delay(WRITE_LATENCY_MS)
            disk = preferences
            shown.value = preferences
        }

        override suspend fun awaitHydrated(): UserNotificationPreferences = disk

        private companion object {
            const val WRITE_LATENCY_MS = 1L
        }
    }

    private val snapshots = mutableListOf<UserNotificationPreferences>()

    private fun syncRepository(firstSendLatencyMs: Long = 0L): NotificationPreferencesSyncRepository {
        val sync = mockk<NotificationPreferencesSyncRepository>()
        coEvery { sync.enqueueSync(any()) } coAnswers {
            val snapshot = firstArg<UserNotificationPreferences>()
            if (snapshots.isEmpty()) delay(firstSendLatencyMs)
            snapshots += snapshot
            "cmid_${snapshots.size}"
        }
        return sync
    }

    private fun vm(store: NotificationPreferencesStore, sync: NotificationPreferencesSyncRepository) =
        NotificationSettingsViewModel(
            notificationPreferencesStore = store,
            notificationPreferencesSyncRepository = sync,
            workManager = mockk(relaxed = true),
        )

    @Test
    fun twoQuickDndDayToggles_keepBothDaysOnTheScreenAndInTheLastSnapshotSent() = runTest(dispatcher) {
        val store = SlowDiskStore()
        val vm = vm(store, syncRepository())
        advanceUntilIdle()

        vm.toggleDndDay(DndDay.MON)
        vm.toggleDndDay(DndDay.TUE)
        advanceUntilIdle()

        assertThat(vm.state.value.notifications.dndDays).containsExactly(DndDay.MON, DndDay.TUE)
        assertThat(snapshots.last().dndDays).containsExactly(DndDay.MON, DndDay.TUE)
    }

    @Test
    fun twoQuickTypeToggles_keepBothChoices() = runTest(dispatcher) {
        val store = SlowDiskStore()
        val vm = vm(store, syncRepository())
        advanceUntilIdle()

        vm.setNotificationTypeEnabled(NotificationType.MENTION, enabled = false)
        vm.setNotificationTypeEnabled(NotificationType.POST_LIKE, enabled = false)
        advanceUntilIdle()

        val shown = vm.state.value.notifications
        assertThat(shown.mentionEnabled).isFalse()
        assertThat(shown.postLikeEnabled).isFalse()
        assertThat(snapshots.last().mentionEnabled).isFalse()
        assertThat(snapshots.last().postLikeEnabled).isFalse()
    }

    @Test
    fun aSlowFirstSend_doesNotLetTheOlderSnapshotArriveLast() = runTest(dispatcher) {
        val store = SlowDiskStore()
        val vm = vm(store, syncRepository(firstSendLatencyMs = 50L))
        advanceUntilIdle()

        vm.toggleDndDay(DndDay.MON)
        vm.toggleDndDay(DndDay.TUE)
        advanceUntilIdle()

        assertThat(snapshots.map { it.dndDays.size }).isInOrder()
        assertThat(snapshots.last().dndDays).containsExactly(DndDay.MON, DndDay.TUE)
    }
}
