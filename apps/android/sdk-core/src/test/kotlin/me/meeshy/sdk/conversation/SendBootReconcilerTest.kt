package me.meeshy.sdk.conversation

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.outbox.OutboxState
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class SendBootReconcilerTest {

    private val sender = MeeshyUser(id = "me", username = "atabeth", displayName = "Atabeth")

    private fun reconciler(harness: MessageCollaboratorHarness) =
        SendBootReconciler(harness.database.messageDao(), harness.database.outboxDao())

    private fun sends(harness: MessageCollaboratorHarness) =
        MessageSendCoordinator(harness.database, harness.database.messageDao(), harness.outbox, harness.clock)

    @Test
    fun `a sending bubble without an outbox row becomes failed`() = runHarnessTest { harness ->
        val cid = sends(harness).sendOptimistic("c1", "salut", "fr", sender)
        harness.database.outboxDao().deleteAll(listOf(cid))

        val changed = reconciler(harness).reconcile()

        assertThat(changed).isEqualTo(1)
        assertThat(harness.cachedSendState(cid)).isEqualTo(LocalSendState.FAILED.name)
    }

    @Test
    fun `a failed bubble whose outbox restarted becomes sending`() = runHarnessTest { harness ->
        val cid = sends(harness).sendOptimistic("c1", "salut", "fr", sender)
        harness.database.messageDao().updateSendState(cid, LocalSendState.FAILED.name)

        reconciler(harness).reconcile()

        assertThat(harness.cachedSendState(cid)).isEqualTo(LocalSendState.SENDING.name)
    }

    @Test
    fun `a coherent sending bubble and an exhausted failed one are left alone`() = runHarnessTest { harness ->
        val live = sends(harness).sendOptimistic("c1", "un", "fr", sender)
        val dead = sends(harness).sendOptimistic("c1", "deux", "fr", sender)
        harness.database.outboxDao().updateState(dead, OutboxState.EXHAUSTED.name, 5, harness.clock.now)
        harness.database.messageDao().updateSendState(dead, LocalSendState.FAILED.name)

        val changed = reconciler(harness).reconcile()

        assertThat(changed).isEqualTo(0)
        assertThat(harness.cachedSendState(live)).isEqualTo(LocalSendState.SENDING.name)
        assertThat(harness.cachedSendState(dead)).isEqualTo(LocalSendState.FAILED.name)
    }
}
