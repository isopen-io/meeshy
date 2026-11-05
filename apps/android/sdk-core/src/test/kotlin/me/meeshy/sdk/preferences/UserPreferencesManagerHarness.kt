package me.meeshy.sdk.preferences

import io.mockk.coEvery
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.TestScope
import me.meeshy.sdk.audio.InMemoryAudioPreferencesStore
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.PreferencesCategoryApi
import me.meeshy.sdk.notification.InMemoryNotificationPreferencesStore
import me.meeshy.sdk.outbox.OutboxEnqueueResult
import me.meeshy.sdk.outbox.OutboxMutation
import me.meeshy.sdk.outbox.OutboxRepository
import me.meeshy.sdk.privacy.InMemoryPrivacyPreferencesStore
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.SocketConnectionState
import me.meeshy.sdk.socket.SocketManager
import me.meeshy.sdk.voice.ConsentsRepository

/** Le banc commun des témoins du gestionnaire : magasins en mémoire, file simulée, temps virtuel. */
internal class UserPreferencesHarness(
    private val test: TestScope,
    hasSession: Boolean = true,
    val snapshotStore: PreferenceSnapshotStore = InMemoryPreferenceSnapshotStore(),
    var utcOffset: Int = 60,
) {
    val enqueued = mutableListOf<OutboxMutation>()
    val connection = MutableStateFlow(SocketConnectionState.DISCONNECTED)
    val clock = object : CacheClock {
        override fun nowMillis(): Long = test.testScheduler.currentTime
    }
    val session: SessionRepository = mockk { every { currentUserId } returns if (hasSession) "u1" else null }
    val outbox: OutboxRepository = mockk {
        coEvery { tryEnqueue(any(), any()) } answers {
            this@UserPreferencesHarness.enqueued += firstArg<OutboxMutation>()
            OutboxEnqueueResult.Accepted("c${this@UserPreferencesHarness.enqueued.size}")
        }
        coEvery { hasDeliverable(any(), any()) } returns false
    }
    val readApi: PreferencesCategoryApi = mockk(relaxed = true)
    val consents: ConsentsRepository = mockk(relaxed = true) {
        coEvery { refresh() } returns NetworkResult.Success(emptySet())
    }
    val coordinator: PreferencesSyncCoordinator = mockk(relaxed = true)
    val socket: SocketManager = mockk { every { connectionState } returns connection }
    val notificationStore = InMemoryNotificationPreferencesStore()
    val privacyStore = InMemoryPrivacyPreferencesStore()
    val audioStore = InMemoryAudioPreferencesStore()

    /** Un dépôt neuf sur les MÊMES magasins : sa mémoire est vide, comme celle d'un nouveau processus. */
    fun newSync() = CategorySyncRepository(session, outbox, readApi, snapshotStore, clock)

    val sync = newSync()

    fun manager(
        scope: CoroutineScope = test.backgroundScope,
        sync: CategorySyncRepository = this.sync,
    ) = UserPreferencesManager(
        scope = scope,
        sync = sync,
        snapshotStore = snapshotStore,
        notificationStore = notificationStore,
        privacyStore = privacyStore,
        audioStore = audioStore,
        consents = consents,
        connection = socket,
        coordinator = coordinator,
        clock = clock,
        utcOffsetMinutes = { utcOffset },
    )
}
