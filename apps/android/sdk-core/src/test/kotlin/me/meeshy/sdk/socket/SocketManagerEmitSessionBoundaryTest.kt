package me.meeshy.sdk.socket

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.Dispatchers
import me.meeshy.sdk.call.CallActivityGate
import me.meeshy.sdk.net.InMemoryTokenStore
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.net.SessionRefresher
import me.meeshy.sdk.net.SessionTransitionFlags
import org.json.JSONObject
import org.junit.Test

/**
 * #13566 : une socket ouverte sous une session finie n'émet plus rien au nom du compte suivant — l'émission part par
 * une socket de la session courante, ou est refusée avec une issue immédiate pour qui attend un accusé ; un accusé
 * arrivé après la fin de la session ne livre jamais sa charge ; et un compte connecté pendant l'appel qui diffère la
 * déconnexion du précédent retrouve son temps réel à la fin de l'appel.
 */
class SocketManagerEmitSessionBoundaryTest {

    private class Rig {
        val gate = CallActivityGate()
        val transition = SessionTransitionFlags()
        val store = InMemoryTokenStore(jwt = validJwt, sessionToken = "sess")
        val factory = FakeSocketFactory()
        val manager = SocketManager(
            config = MeeshyConfig(apiBaseUrl = "http://x", socketUrl = "http://x"),
            tokenStore = store,
            factory = factory,
            clientIdentity = { testIdentity },
            refresher = SessionRefresher(store, nowEpochSeconds = { NOW }) { validJwt },
            ioDispatcher = Dispatchers.Unconfined,
            nowEpochSeconds = { NOW },
            callGate = gate,
            transition = transition,
        )

        fun logoutDuringCall(): FakeRealtimeSocket {
            manager.connect()
            val socketOfA = factory.created.single()
            gate.setActive(true)
            store.clear()
            transition.bumpGeneration()
            manager.disconnect()
            store.jwt = validJwt
            transition.bumpGeneration()
            return socketOfA
        }
    }

    private fun success(args: Array<Any>): Boolean? = (args.firstOrNull() as? JSONObject)?.optBoolean("success")

    @Test
    fun `une emission sous la session qui a ouvert la socket part par elle`() {
        val rig = Rig()
        rig.manager.connect()

        rig.manager.emit("typing:start", JSONObject())

        assertThat(rig.factory.created.single().emitted).containsExactly("typing:start")
    }

    @Test
    fun `hors appel, l'emission du compte suivant part par une socket rouverte sous sa session, jamais par celle de A`() {
        val rig = Rig()
        rig.manager.connect()
        val socketOfA = rig.factory.created.single()

        rig.transition.bumpGeneration()
        rig.manager.emit("typing:start", JSONObject())

        assertThat(socketOfA.emitted).isEmpty()
        assertThat(rig.factory.created).hasSize(2)
        assertThat(rig.factory.created.last().emitted).containsExactly("typing:start")
    }

    @Test
    fun `pendant l'appel qui differe la deconnexion de A, l'emission de B ne part pas sous la socket de A et son accuse rend un refus`() {
        val rig = Rig()
        val socketOfA = rig.logoutDuringCall()
        val answers = mutableListOf<Boolean?>()

        rig.manager.emit("call:initiate", JSONObject()) { args -> answers += success(args) }
        rig.manager.emit("typing:start", JSONObject())

        assertThat(socketOfA.emitted).isEmpty()
        assertThat(answers).containsExactly(false)
    }

    @Test
    fun `l'accuse d'une socket arrive apres la fin de sa session ne livre pas sa charge`() {
        val rig = Rig()
        rig.manager.connect()
        val socketOfA = rig.factory.created.single()
        val answers = mutableListOf<Boolean?>()
        rig.manager.emit("attachment:reaction-add", JSONObject()) { args -> answers += success(args) }

        rig.transition.bumpGeneration()
        socketOfA.answer("attachment:reaction-add", JSONObject().put("success", true))

        assertThat(answers).containsExactly(false)
    }

    @Test
    fun `sans socket, un appelant qui attend un accuse recoit un refus immediat`() {
        val rig = Rig()
        val answers = mutableListOf<Boolean?>()

        rig.manager.emit("call:join", JSONObject()) { args -> answers += success(args) }

        assertThat(answers).containsExactly(false)
    }

    @Test
    fun `B connecte pendant l'appel qui differe la deconnexion de A retrouve son temps reel a la fin de l'appel`() {
        val rig = Rig()
        val socketOfA = rig.logoutDuringCall()
        val received = mutableListOf<String>()

        rig.manager.connect()
        rig.manager.on("message:new") { received += "B" }
        rig.gate.setActive(false)

        assertThat(socketOfA.disconnectCalls).isEqualTo(1)
        val socketOfB = rig.factory.created.last()
        assertThat(socketOfB).isNotSameInstanceAs(socketOfA)
        socketOfB.fire("message:new", "payload")
        assertThat(received).containsExactly("B")
    }

    @Test
    fun `apres l'appel, B emet par sa propre socket`() {
        val rig = Rig()
        val socketOfA = rig.logoutDuringCall()

        rig.manager.connect()
        rig.gate.setActive(false)
        rig.manager.emit("typing:start", JSONObject())

        assertThat(socketOfA.emitted).isEmpty()
        assertThat(rig.factory.created.last().emitted).containsExactly("typing:start")
    }
}
