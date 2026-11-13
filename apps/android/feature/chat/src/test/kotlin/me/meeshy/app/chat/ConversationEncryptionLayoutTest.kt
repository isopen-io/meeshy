package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import me.meeshy.feature.chat.R
import me.meeshy.sdk.model.e2ee.ConversationEncryptionExplanation
import me.meeshy.sdk.model.e2ee.ConversationEncryptionExplanation.Fact
import me.meeshy.sdk.model.e2ee.ConversationEncryptionExplanation.Topic
import org.junit.Test

/** Ce que la fiche Chiffrement dit au repos et ce qui passe derrière un (i) (#17697) : aucun fait ne disparaît. */
class ConversationEncryptionLayoutTest {

    private fun layout(mode: String?, isDirect: Boolean = true, footer: Boolean = false) =
        ConversationEncryptionExplanation.of(mode, isDirect).layout(footerStatesFinality = footer).associateBy { it.topic }

    @Test
    fun `an end to end conversation keeps one key per device visible and puts the two others behind the phone question`() {
        val devices = layout("e2ee").getValue(Topic.DEVICES)

        assertThat(devices.visible).containsExactly(Fact.ONE_KEY_PER_DEVICE)
        assertThat(devices.noted).containsExactly(Fact.DEVICE_LIMIT, Fact.RESTORED_DEVICE_IS_NEW).inOrder()
        assertThat(devices.questionRes).isEqualTo(R.string.encryption_note_devices_question)
    }

    @Test
    fun `changing the mode keeps the thread notice and the irreversibility visible, the rest behind the question`() {
        val switching = layout("server").getValue(Topic.SWITCHING)

        assertThat(switching.visible).containsExactly(Fact.SWITCH_IS_SHOWN_IN_THREAD, Fact.END_TO_END_IS_FINAL).inOrder()
        assertThat(switching.noted).containsExactly(Fact.WHO_MAY_TOGGLE, Fact.SWITCH_KEEPS_HISTORY).inOrder()
        assertThat(switching.questionRes).isEqualTo(R.string.encryption_note_switching_question)
    }

    @Test
    fun `when the activation footer states the finality the short sentence leaves the topic`() {
        val switching = layout(null, footer = true).getValue(Topic.SWITCHING)

        assertThat(switching.visible).containsExactly(Fact.SWITCH_IS_SHOWN_IN_THREAD)
        assertThat(switching.visible + switching.noted).doesNotContain(Fact.END_TO_END_IS_FINAL)
    }

    @Test
    fun `a topic with nothing behind a note has no question`() {
        assertThat(layout("e2ee").getValue(Topic.WHO_READS).questionRes).isNull()
        assertThat(layout("e2ee").getValue(Topic.PERMANENCE).noted).isEmpty()
    }

    @Test
    fun `the unencrypted conversation says who reads once, in the topic`() {
        val whoReads = layout(null).getValue(Topic.WHO_READS)

        assertThat(whoReads.visible).contains(Fact.STORED_WITHOUT_ENCRYPTION)
    }

    @Test
    fun `no fact is lost, every one is either visible or behind a note`() {
        listOf(null, "server", "hybrid", "e2ee").forEach { mode ->
            val explained = ConversationEncryptionExplanation.of(mode, isDirect = false).sections.flatMap { it.facts }
            val laid = layout(mode, isDirect = false).values.flatMap { it.visible + it.noted }
            assertThat(laid).containsExactlyElementsIn(explained)
        }
    }
}
