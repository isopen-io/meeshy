package me.meeshy.sdk.game

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.game.GameErrorCode
import me.meeshy.sdk.model.game.GameRefusal
import org.junit.Test

class GameRequestIdLedgerTest {

    private fun ledger(): GameRequestIdLedger {
        var n = 0
        return GameRequestIdLedger { "req-${++n}" }
    }

    private fun refused(code: GameErrorCode) = GameServiceResult.Refused(GameRefusal(code, code.wire))

    @Test
    fun `l identifiant d une intention est stable tant qu elle n est pas reglee`() {
        val ledger = ledger()

        assertThat(ledger.idFor("chest")).isEqualTo(ledger.idFor("chest"))
        assertThat(ledger.idFor("chest")).isNotEqualTo(ledger.idFor("relight"))
    }

    @Test
    fun `une coupure et un 5xx rejouent le meme identifiant`() = runTest {
        val ledger = ledger()
        val sent = mutableListOf<String>()

        ledger.perform("chest") { sent += it; GameServiceResult.Offline }
        ledger.perform("chest") { sent += it; GameServiceResult.Failed(503) }
        ledger.perform("chest") { sent += it; refused(GameErrorCode.ChestNotReady) }

        assertThat(sent.toSet()).hasSize(1)
    }

    @Test
    fun `un succes renouvelle l identifiant`() = runTest {
        val ledger = ledger()
        val sent = mutableListOf<String>()

        ledger.perform("chest") { sent += it; GameServiceResult.Done(Unit) }
        ledger.perform("chest") { sent += it; GameServiceResult.Done(Unit) }

        assertThat(sent).containsExactly("req-1", "req-2").inOrder()
    }

    @Test
    fun `un conflit d identifiant libere l identifiant`() = runTest {
        val ledger = ledger()
        val sent = mutableListOf<String>()

        ledger.perform("chest") { sent += it; refused(GameErrorCode.RequestIdConflict) }
        ledger.perform("chest") { sent += it; GameServiceResult.Offline }

        assertThat(sent).containsExactly("req-1", "req-2").inOrder()
    }
}
