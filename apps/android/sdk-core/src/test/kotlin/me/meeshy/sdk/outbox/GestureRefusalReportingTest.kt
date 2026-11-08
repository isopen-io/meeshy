package me.meeshy.sdk.outbox

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.core.database.entity.OutboxEntity
import me.meeshy.sdk.chat.GestureRefusalCenter
import me.meeshy.sdk.chat.GestureRefusalEvent
import me.meeshy.sdk.model.feedback.DailyGestureLimit
import org.junit.Test

class GestureRefusalReportingTest {

    private fun row(lastError: String?) = OutboxEntity(
        cmid = "m1", lane = "social", kind = OutboxKind.LIKE_POST.name, targetId = "p1", payload = "{}", dependsOn = null,
        attempts = 1, state = "FAILED", createdAt = 0, updatedAt = 0, lastError = lastError,
    )

    private val limit = DailyGestureLimit(DailyGestureLimit.Gesture.REACTION, 1_793_743_200_000L, 200)

    @Test
    fun `une ligne qui renonce sur la limite du jour la consigne et la dit`() = runTest {
        val ledger = DailyGestureLimitLedger()
        val center = GestureRefusalCenter()
        val registry = MutationSenderRegistry(emptyMap(), dailyLimits = ledger, refusals = center)
        center.events.test {
            registry.onExhausted(row(limit.reason))
            assertThat(awaitItem()).isEqualTo(GestureRefusalEvent.DailyLimit(limit))
        }
        assertThat(ledger.take("m1")).isEqualTo(limit)
    }

    @Test
    fun `un autre echec, ou une erreur reseau, ne leve aucun refus`() = runTest {
        val ledger = DailyGestureLimitLedger()
        val center = GestureRefusalCenter()
        val registry = MutationSenderRegistry(emptyMap(), dailyLimits = ledger, refusals = center)
        center.events.test {
            registry.onExhausted(row("Refused: HTTP 404 POST_NOT_FOUND"))
            registry.onExhausted(row("NETWORK"))
            registry.onExhausted(row(null))
            expectNoEvents()
        }
        assertThat(ledger.take("m1")).isNull()
    }
}
