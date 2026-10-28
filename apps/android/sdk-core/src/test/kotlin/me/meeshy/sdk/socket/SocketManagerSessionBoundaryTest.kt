package me.meeshy.sdk.socket

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.Dispatchers
import me.meeshy.sdk.call.CallActivityGate
import me.meeshy.sdk.net.InMemoryTokenStore
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.net.SessionRefresher
import me.meeshy.sdk.net.SessionTransitionFlags
import org.junit.Test

/**
 * #13558 : une socket ouverte sous une session ne livre plus rien une fois cette session finie — ni après une
 * déconnexion différée par un appel en cours, ni au compte adopté par-dessus.
 */
class SocketManagerSessionBoundaryTest {

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
    }

    @Test
    fun `un evenement recu sous la session qui a ouvert la socket est livre`() {
        val rig = Rig()
        val received = mutableListOf<String>()
        rig.manager.on("message:new") { received += "A" }
        rig.manager.connect()

        rig.factory.created.single().fire("message:new", "payload")

        assertThat(received).containsExactly("A")
    }

    @Test
    fun `apres la fin de la session, la socket gardee par un appel ne livre plus ses evenements`() {
        val rig = Rig()
        val received = mutableListOf<String>()
        rig.manager.on("message:new") { received += "A" }
        rig.manager.connect()
        val socketOfA = rig.factory.created.single()
        rig.gate.setActive(true)

        rig.transition.bumpGeneration()
        rig.manager.disconnect()
        socketOfA.fire("message:new", "payload")

        assertThat(socketOfA.disconnectCalls).isEqualTo(0)
        assertThat(received).isEmpty()
    }

    @Test
    fun `un ecouteur ajoute apres l'ouverture suit la meme borne`() {
        val rig = Rig()
        rig.manager.connect()
        val received = mutableListOf<String>()
        rig.manager.on("message:new") { received += "late" }

        rig.transition.bumpGeneration()
        rig.gate.setActive(true)
        rig.factory.created.first().fire("message:new", "payload")

        assertThat(received).isEmpty()
    }

    @Test
    fun `une socket d'une session finie se rouvre sous la session courante au premier evenement perime`() {
        val rig = Rig()
        val received = mutableListOf<String>()
        rig.manager.on("message:new") { received += "event" }
        rig.manager.connect()

        rig.transition.bumpGeneration()
        rig.factory.created.single().fire("message:new", "payload")

        assertThat(rig.factory.created).hasSize(2)
        rig.factory.created.last().fire("message:new", "payload")
        assertThat(received).containsExactly("event")
    }
}
