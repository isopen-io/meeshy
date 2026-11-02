package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.call.TelecomConnectionState
import me.meeshy.sdk.model.call.TelecomConnectionUpdate
import me.meeshy.sdk.model.call.TelecomDisconnectCause
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class CallTelecomSessionTest {

    private fun TestScope.session(isOutgoing: Boolean) = CallTelecomSession(this, isOutgoing)

    private fun CallTelecomSession.drain(): List<TelecomCommand> {
        val out = mutableListOf<TelecomCommand>()
        while (true) out += commands.tryReceive().getOrNull() ?: break
        return out
    }

    private val active = TelecomConnectionUpdate(TelecomConnectionState.Active)

    @Test
    fun `l activation attend la connexion media`() = runTest {
        val session = session(isOutgoing = true)

        session.apply(active)
        advanceTimeBy(5_000)
        assertThat(session.drain()).isEmpty()

        session.onMediaConnected()
        advanceUntilIdle()
        assertThat(session.drain()).containsExactly(TelecomCommand.Activate)
    }

    @Test
    fun `le filet de 10 secondes active quand le media n arrive jamais`() = runTest {
        val session = session(isOutgoing = true)

        session.apply(active)
        advanceTimeBy(9_999)
        assertThat(session.drain()).isEmpty()

        advanceTimeBy(2)
        assertThat(session.drain()).containsExactly(TelecomCommand.Activate)
    }

    @Test
    fun `un decroche par le systeme n ajoute pas d activation, onAnswer le tient`() = runTest {
        val session = session(isOutgoing = false)
        session.markSystemAnswered()

        session.apply(active)
        session.onMediaConnected()
        advanceUntilIdle()

        assertThat(session.drain()).isEmpty()
    }

    @Test
    fun `un decroche depuis l application active la connexion entrante a la connexion media`() = runTest {
        val session = session(isOutgoing = false)

        session.apply(active)
        session.onMediaConnected()
        advanceUntilIdle()

        assertThat(session.drain()).containsExactly(TelecomCommand.Activate)
    }

    @Test
    fun `holdUntilMedia rend la main a la connexion media`() = runTest {
        val session = session(isOutgoing = false)
        var released = false
        val waiter = launch { session.holdUntilMedia(); released = true }

        advanceTimeBy(1_000)
        assertThat(released).isFalse()

        session.onMediaConnected()
        advanceUntilIdle()
        assertThat(released).isTrue()
        waiter.cancel()
    }

    @Test
    fun `holdUntilMedia rend la main au bout de 10 secondes sans media`() = runTest {
        val session = session(isOutgoing = false)
        var released = false
        launch { session.holdUntilMedia(); released = true }

        advanceTimeBy(10_001)
        assertThat(released).isTrue()
    }

    @Test
    fun `la fin transmet sa cause et ferme la connexion`() = runTest {
        val session = session(isOutgoing = true)

        session.apply(TelecomConnectionUpdate(TelecomConnectionState.Disconnected, TelecomDisconnectCause.Remote))

        assertThat(session.drain()).containsExactly(TelecomCommand.Disconnect(TelecomDisconnectCause.Remote))
        assertThat(session.commands.tryReceive().isClosed).isTrue()
    }

    @Test
    fun `une activation en attente est abandonnee quand la fin arrive`() = runTest {
        val session = session(isOutgoing = true)
        session.apply(active)
        session.apply(TelecomConnectionUpdate(TelecomConnectionState.Disconnected, TelecomDisconnectCause.Local))

        session.onMediaConnected()
        advanceUntilIdle()

        assertThat(session.drain()).containsExactly(TelecomCommand.Disconnect(TelecomDisconnectCause.Local))
    }

    @Test
    fun `la sonnerie et la numerotation n emettent rien`() = runTest {
        val session = session(isOutgoing = true)

        session.apply(TelecomConnectionUpdate(TelecomConnectionState.Dialing))
        session.apply(TelecomConnectionUpdate(TelecomConnectionState.Ringing))
        advanceUntilIdle()

        assertThat(session.drain()).isEmpty()
    }

    @Test
    fun `apres destruction par le systeme plus aucun ordre n est emis`() = runTest {
        val session = session(isOutgoing = true)
        session.markSystemEnded()

        session.apply(active)
        session.apply(TelecomConnectionUpdate(TelecomConnectionState.Disconnected, TelecomDisconnectCause.Local))
        advanceUntilIdle()

        assertThat(session.drain()).isEmpty()
    }
}
