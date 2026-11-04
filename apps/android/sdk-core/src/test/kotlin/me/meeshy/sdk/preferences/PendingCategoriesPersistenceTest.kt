package me.meeshy.sdk.preferences

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.PreferenceCategory
import org.junit.Test

class PendingCategoriesPersistenceTest {

    private suspend fun killedBeforeTheDebounce(harness: UserPreferencesHarness) {
        // Le premier "processus" ne vit que le temps d'une modification : sa portée est annulée avant la seconde.
        val firstProcess = kotlinx.coroutines.CoroutineScope(kotlinx.coroutines.SupervisorJob())
        harness.manager(firstProcess).updateVideo { it.copy(mirrorLocalVideo = false) }
        firstProcess.coroutineContext[kotlinx.coroutines.Job]!!.cancel()
    }

    @Test
    fun `a category left pending by a dead process is replayed at the next start without debounce`() = runTest {
        val harness = UserPreferencesHarness(this)
        killedBeforeTheDebounce(harness)
        assertThat(harness.enqueued).isEmpty()

        val secondSync = harness.newSync()
        assertThat(secondSync.isPending(PreferenceCategory.VIDEO)).isTrue()
        val secondProcess = harness.manager(sync = secondSync)
        secondProcess.onAppCreate()

        assertThat(harness.enqueued.map { it.targetId }).containsExactly("video")
        assertThat(harness.enqueued.single().payload).contains("\"mirrorLocalVideo\":false")
        assertThat(secondSync.isPending(PreferenceCategory.VIDEO)).isFalse()
    }

    @Test
    fun `the value changed before the death is still the local one after the restart`() = runTest {
        val harness = UserPreferencesHarness(this)
        killedBeforeTheDebounce(harness)

        val secondProcess = harness.manager(sync = harness.newSync())
        runCurrent()

        assertThat(secondProcess.video.value.mirrorLocalVideo).isFalse()
    }

    @Test
    fun `the replay also runs on foreground, on authentication and on socket reconnection`() = runTest {
        val harness = UserPreferencesHarness(this)
        killedBeforeTheDebounce(harness)
        val freshSync = harness.newSync()
        val manager = harness.manager(sync = freshSync)

        manager.onForeground()
        assertThat(harness.enqueued).hasSize(1)

        freshSync.markPending(PreferenceCategory.VIDEO)
        manager.attach()
        runCurrent()
        assertThat(harness.enqueued).hasSize(2)

        freshSync.markPending(PreferenceCategory.VIDEO)
        harness.connection.value = me.meeshy.sdk.socket.SocketConnectionState.CONNECTED
        advanceTimeBy(1)
        runCurrent()
        assertThat(harness.enqueued).hasSize(3)
        manager.detach()
    }

    @Test
    fun `without a session the replay keeps the category pending instead of dropping it`() = runTest {
        val harness = UserPreferencesHarness(this, hasSession = false)
        killedBeforeTheDebounce(harness)

        val secondSync = harness.newSync()
        harness.manager(sync = secondSync).onAppCreate()

        assertThat(harness.enqueued).isEmpty()
        assertThat(secondSync.isPending(PreferenceCategory.VIDEO)).isTrue()
    }
}
