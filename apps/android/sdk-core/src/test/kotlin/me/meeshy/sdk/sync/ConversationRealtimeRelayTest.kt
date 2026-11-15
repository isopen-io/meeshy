package me.meeshy.sdk.sync

import com.google.common.truth.Truth.assertThat
import java.util.Collections
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.runBlocking
import me.meeshy.sdk.session.AccountTicket
import org.junit.Test

class ConversationRealtimeRelayTest {
    private val log = Collections.synchronizedList(mutableListOf<String>())

    private fun relay(
        vararg appliers: RealtimeCacheApplier,
        isCurrent: (AccountTicket) -> Boolean = { true },
    ) = ConversationRealtimeRelay(
        appliers = appliers.toSet(),
        scopeFactory = { CoroutineScope(SupervisorJob() + Dispatchers.Unconfined) },
        isCurrent = isCurrent,
    )

    private fun applier(
        name: String,
        flow: MutableSharedFlow<String>,
        family: OrderedEventLane.Family = OrderedEventLane.Family.MESSAGES,
        gate: CompletableDeferred<Unit>? = null,
    ) = object : RealtimeCacheApplier {
        override fun subscribe(registrar: RelayRegistrar) {
            registrar.relay(flow, family) { event ->
                gate?.await()
                log += "$name:$event"
            }
        }
    }

    private fun flow() = MutableSharedFlow<String>(extraBufferCapacity = 64)

    @Test
    fun `un applicateur contribue est appele dans l'ordre d'arrivee`() = runBlocking<Unit> {
        val events = flow()
        val gate = CompletableDeferred<Unit>()
        val relay = relay(applier("a", events, gate = gate))
        relay.attach()
        events.emit("new")
        events.emit("edited")
        gate.complete(Unit)
        relay.barrier(OrderedEventLane.Family.MESSAGES)
        assertThat(log).containsExactly("a:new", "a:edited").inOrder()
    }

    @Test
    fun `plusieurs applicateurs partagent la meme voie sans modifier le relais`() = runBlocking<Unit> {
        val first = flow()
        val second = flow()
        val relay = relay(applier("a", first), applier("b", second))
        relay.attach()
        first.emit("1")
        second.emit("2")
        relay.barrier(OrderedEventLane.Family.MESSAGES)
        assertThat(log).containsExactly("a:1", "b:2")
    }

    @Test
    fun `apres desarmement plus aucune ecriture`() = runBlocking<Unit> {
        val events = flow()
        val relay = relay(applier("a", events))
        relay.attach()
        relay.detach()
        events.emit("late")
        assertThat(log).isEmpty()
    }

    @Test
    fun `un applicateur en echec n'empeche pas les autres`() = runBlocking<Unit> {
        val events = flow()
        val broken = object : RealtimeCacheApplier {
            override fun subscribe(registrar: RelayRegistrar) = error("boom")
        }
        val relay = relay(broken, applier("ok", events))
        relay.attach()
        events.emit("x")
        relay.barrier(OrderedEventLane.Family.MESSAGES)
        assertThat(log).containsExactly("ok:x")
    }

    @Test
    fun `le re-armement remplace l'ancien abonnement sans doubler les effets`() = runBlocking<Unit> {
        val events = flow()
        val relay = relay(applier("a", events))
        relay.attach()
        relay.attach()
        events.emit("once")
        relay.barrier(OrderedEventLane.Family.MESSAGES)
        assertThat(log).containsExactly("a:once")
    }
}
