package me.meeshy.core.e2ee.flow

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.core.e2ee.content.E2eeContent
import me.meeshy.core.e2ee.content.E2eeOpening
import me.meeshy.core.e2ee.content.E2eePayloadKind
import me.meeshy.core.e2ee.content.E2eePlaintextReader
import me.meeshy.core.e2ee.content.E2eeUnreadableReason
import me.meeshy.core.e2ee.open.E2eeOpenOutcome
import me.meeshy.core.e2ee.wire.LibsignalSendRequest
import org.junit.Test

/**
 * Audit de #19077, P1 — un clair très imbriqué, qu'un pair quelconque peut sceller (60 Kio, sous le plafond d'un corps), est
 * JUGÉ illisible, donc acquitté, au lieu de faire déborder la pile du lecteur : le rattrapage des messages qui le suivent
 * n'en est jamais arrêté. La borne se compte hors des chaînes, et elle laisse passer tout clair qui la respecte.
 */
class E2eeDeeplyNestedPlaintextTest {
    private val alice = "64f0c0ffee0000000000aaaa"
    private val bob = "64f0c0ffee0000000000bbbb"
    private val conversation = "64f0c0ffee000000000c0001"
    private val nested = ("[".repeat(30_000) + "]".repeat(30_000)).toByteArray()

    /** Un contenu dont la profondeur totale (l'objet compris) vaut [depth]. */
    private fun messageOfDepth(depth: Int, version: Int): ByteArray {
        val value = "[".repeat(depth - 1) + "]".repeat(depth - 1)
        return """{"conversationId":"$conversation","sentAt":1,"text":"bonjour","v":$version,"x":$value}""".toByteArray()
    }

    @Test
    fun theReader_judgesADeeplyNestedPlaintextUnreadable_insteadOfOverflowingTheStack() {
        assertThat(E2eePlaintextReader.read(nested))
            .isEqualTo(E2eeOpening.Unreadable(E2eePayloadKind.MESSAGE, E2eeUnreadableReason.NOT_JSON))
    }

    @Test
    fun theBound_admitsAMessageAtItsLimit_andJudgesOneLevelMoreUnreadable_whateverItsVersion() {
        val beyond = E2eeOpening.Unreadable(E2eePayloadKind.MESSAGE, E2eeUnreadableReason.NOT_JSON)

        assertThat(E2eePlaintextReader.read(messageOfDepth(E2eePlaintextReader.MAX_DEPTH, version = 1)))
            .isInstanceOf(E2eeOpening.Message::class.java)
        assertThat(E2eePlaintextReader.read(messageOfDepth(E2eePlaintextReader.MAX_DEPTH + 1, version = 1))).isEqualTo(beyond)
        assertThat(E2eePlaintextReader.read(messageOfDepth(E2eePlaintextReader.MAX_DEPTH + 1, version = 2))).isEqualTo(beyond)
    }

    @Test
    fun theBound_countsOnlyTheBracketsOutsideStrings() {
        val brackets = "[".repeat(200) + "{".repeat(200)
        val message = """{"conversationId":"$conversation","sentAt":1,"text":"$brackets \" ]]] }}}","v":1}"""

        val opening = E2eePlaintextReader.read(message.toByteArray())

        assertThat((opening as E2eeOpening.Message).content.text).isEqualTo("$brackets \" ]]] }}}")
    }

    @Test
    fun aDeeplyNestedPlaintextFromAPeer_neverStopsTheCatchUpOfTheMessagesAfterIt() = runTest {
        val server = FakeE2eeServer()
        val a = E2eeTestDevice(server, alice).enroll()
        val b = E2eeTestDevice(server, bob).enroll()
        a.sealer.sealAndDeliverRaw(nested, bob) { a.session.send(conversation, bob, LibsignalSendRequest.of("cid_deep", it)) }
        val after = E2eeContent.compose("après", null, null, conversation, "cid_after", 1L)
        a.sealer.sealAndDeliver(after, bob) { a.session.send(conversation, bob, LibsignalSendRequest.of("cid_after", it)) }

        val outcomes = b.opener.catchUp()

        assertThat(outcomes.filterIsInstance<E2eeOpenOutcome.Opened>().map { it.content.text }).containsExactly("après")
        assertThat(outcomes.filterIsInstance<E2eeOpenOutcome.Undecryptable>()).hasSize(1)
        assertThat(server.mailbox).isEmpty()
    }
}
