package me.meeshy.app.push

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import org.junit.Test

class PushInteractionBusTest {

    @Test
    fun `affichage ouverture et balayage circulent dans l ordre d emission`() = runTest {
        val bus = PushInteractionBus()
        bus.events.test {
            bus.emit(PushInteraction.Displayed("n1"))
            bus.emit(PushInteraction.Opened("n1"))
            bus.emit(PushInteraction.Dismissed("n2"))

            assertThat(awaitItem()).isEqualTo(PushInteraction.Displayed("n1"))
            assertThat(awaitItem()).isEqualTo(PushInteraction.Opened("n1"))
            assertThat(awaitItem()).isEqualTo(PushInteraction.Dismissed("n2"))
        }
    }
}
