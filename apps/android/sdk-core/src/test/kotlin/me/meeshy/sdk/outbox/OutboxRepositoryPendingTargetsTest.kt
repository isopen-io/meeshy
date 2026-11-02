package me.meeshy.sdk.outbox

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.flow.first
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class OutboxRepositoryPendingTargetsTest {

    private fun prefs(target: String, cmid: String) = OutboxMutation(
        kind = OutboxKind.UPDATE_CONVERSATION_PREFS,
        lane = OutboxLanes.CONVERSATION_PREFS,
        targetId = target,
        payload = "{}",
        cmid = cmid,
    )

    private fun reaction(cmid: String) = OutboxMutation(
        kind = OutboxKind.ADD_REACTION,
        lane = OutboxLanes.REACTION,
        targetId = "m1:thumbsup",
        payload = "{}",
        cmid = cmid,
    )

    @Test
    fun `an empty queue has no pending target`() = withOutbox { outbox ->
        assertThat(outbox.observePendingTargets(OutboxKind.UPDATE_CONVERSATION_PREFS).first()).isEmpty()
    }

    @Test
    fun `only the asked kinds contribute their targets`() = withOutbox { outbox ->
        outbox.enqueue(prefs("c1", "p1"))
        outbox.enqueue(prefs("c2", "p2"))
        outbox.enqueue(reaction("r1"))

        assertThat(outbox.observePendingTargets(OutboxKind.UPDATE_CONVERSATION_PREFS).first())
            .containsExactly("c1", "c2")
        assertThat(outbox.observePendingTargets(OutboxKind.ADD_REACTION).first())
            .containsExactly("m1:thumbsup")
    }

    @Test
    fun `several kinds are unioned`() = withOutbox { outbox ->
        outbox.enqueue(prefs("c1", "p1"))
        outbox.enqueue(reaction("r1"))

        assertThat(
            outbox.observePendingTargets(OutboxKind.UPDATE_CONVERSATION_PREFS, OutboxKind.ADD_REACTION).first(),
        ).containsExactly("c1", "m1:thumbsup")
    }

    @Test
    fun `a target appears when queued then disappears once delivered`() = withOutbox { outbox ->
        outbox.observePendingTargets(OutboxKind.UPDATE_CONVERSATION_PREFS).test {
            assertThat(awaitItem()).isEmpty()

            val cmid = outbox.enqueue(prefs("c1", "p1"))!!
            assertThat(awaitItem()).containsExactly("c1")

            outbox.markSucceeded(cmid)
            assertThat(awaitItem()).isEmpty()
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `an exhausted row stops counting as pending`() = withOutbox { outbox ->
        val cmid = outbox.enqueue(prefs("c1", "p1"))!!
        outbox.markExhausted(cmid, "gone")

        assertThat(outbox.observePendingTargets(OutboxKind.UPDATE_CONVERSATION_PREFS).first()).isEmpty()
    }

    @Test
    fun `two rows on one target make a single entry`() = withOutbox { outbox ->
        outbox.enqueue(prefs("c1", "p1"))
        outbox.enqueue(prefs("c1", "p2"))

        assertThat(outbox.observePendingTargets(OutboxKind.UPDATE_CONVERSATION_PREFS).first()).containsExactly("c1")
    }
}
