package me.meeshy.sdk.socket

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runCurrent
import org.junit.Test

/** #13558 : un événement reçu sous une session et encore en file quand elle finit n'est jamais appliqué. */
class OrderedDeliveryLaneSessionTest {

    @Test
    fun `un travail mis en file sous la session finie est jete, le suivant passe`() {
        val dispatcher = StandardTestDispatcher()
        val scope = TestScope(dispatcher)
        var session = 0L
        val lane = OrderedDeliveryLane(dispatcher) { session }
        val applied = mutableListOf<String>()

        lane.deliver { applied += "message de A" }
        session += 1
        lane.deliver { applied += "message de B" }
        scope.runCurrent()

        assertThat(applied).containsExactly("message de B")
        lane.close()
    }
}
