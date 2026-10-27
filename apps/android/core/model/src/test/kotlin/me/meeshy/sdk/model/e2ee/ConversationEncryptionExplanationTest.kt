package me.meeshy.sdk.model.e2ee

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.e2ee.ConversationEncryptionExplanation.Fact
import me.meeshy.sdk.model.e2ee.ConversationEncryptionExplanation.Topic
import org.junit.Test

/** Chaque fait est relevé dans le code qui le produit (miroir de `ConversationEncryptionExplanation.swift`, #12880). */
class ConversationEncryptionExplanationTest {

    private fun explain(mode: String?, isDirect: Boolean = true) = ConversationEncryptionExplanation.of(mode, isDirect)

    private fun ConversationEncryptionExplanation.facts(topic: Topic): List<Fact> =
        sections.first { it.topic == topic }.facts

    @Test
    fun `a clear conversation says it is stored without encryption on the server`() {
        val clear = explain(null)

        assertThat(clear.sections.map { it.topic }).containsExactly(Topic.WHO_READS, Topic.AVAILABLE, Topic.SWITCHING).inOrder()
        assertThat(clear.facts(Topic.WHO_READS)).containsExactly(Fact.TRANSIT_PROTECTED, Fact.STORED_WITHOUT_ENCRYPTION).inOrder()
    }

    @Test
    fun `server and hybrid say that the server reads, hybrid adds that it is the server mode today`() {
        assertThat(explain("server").facts(Topic.WHO_READS))
            .containsExactly(Fact.TRANSIT_PROTECTED, Fact.ENCRYPTED_ON_SERVER_SERVER_READS).inOrder()
        assertThat(explain("hybrid").facts(Topic.WHO_READS))
            .containsExactly(Fact.TRANSIT_PROTECTED, Fact.ENCRYPTED_ON_SERVER_SERVER_READS, Fact.HYBRID_IS_SERVER_TODAY).inOrder()
    }

    @Test
    fun `readable regimes explain how to switch, ending on the final end to end`() {
        assertThat(explain("server").facts(Topic.SWITCHING))
            .containsExactly(Fact.WHO_MAY_TOGGLE, Fact.SWITCH_KEEPS_HISTORY, Fact.SWITCH_IS_SHOWN_IN_THREAD, Fact.END_TO_END_IS_FINAL)
            .inOrder()
    }

    @Test
    fun `end to end says what the server does not see and what is absent`() {
        val e2ee = explain("e2ee")

        assertThat(e2ee.facts(Topic.WHO_READS)).containsExactly(Fact.ONLY_PARTICIPANTS_READ)
        assertThat(e2ee.facts(Topic.AVAILABLE)).containsExactly(Fact.TRANSLATED_ON_DEVICE)
        assertThat(e2ee.facts(Topic.ABSENT)).containsExactly(
            Fact.NO_SERVER_TRANSCRIPTION, Fact.NO_NOTIFICATION_PREVIEW, Fact.NO_SEARCH,
            Fact.NO_EDIT, Fact.NO_FORWARD, Fact.NO_OFFLINE_SENDING,
        ).inOrder()
        assertThat(e2ee.facts(Topic.DEVICES)).containsExactly(Fact.ONE_KEY_PER_DEVICE, Fact.DEVICE_LIMIT, Fact.RESTORED_DEVICE_IS_NEW).inOrder()
    }

    @Test
    fun `an unknown mode is explained as end to end, never as readable`() {
        assertThat(explain("signal-v9").facts(Topic.WHO_READS)).containsExactly(Fact.ONLY_PARTICIPANTS_READ)
    }

    @Test
    fun `a group end to end adds that sending is unavailable, and its permanence fact is the group one`() {
        val direct = explain("e2ee", isDirect = true)
        val group = explain("e2ee", isDirect = false)

        assertThat(direct.facts(Topic.NOT_YET)).doesNotContain(Fact.GROUP_SENDING_UNAVAILABLE)
        assertThat(group.facts(Topic.NOT_YET)).contains(Fact.GROUP_SENDING_UNAVAILABLE)
        assertThat(direct.facts(Topic.PERMANENCE)).containsExactly(Fact.END_TO_END_NEVER_TURNED_OFF_DIRECT, Fact.SERVER_CANNOT_TURN_IT_OFF).inOrder()
        assertThat(group.facts(Topic.PERMANENCE)).containsExactly(Fact.END_TO_END_NEVER_TURNED_OFF, Fact.SERVER_CANNOT_TURN_IT_OFF).inOrder()
    }

    @Test
    fun `no section is empty`() {
        listOf(null, "server", "hybrid", "e2ee").forEach { mode ->
            assertThat(explain(mode).sections.all { it.facts.isNotEmpty() }).isTrue()
        }
    }
}
