package me.meeshy.sdk.model.selection

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.reading.mode.ConversationReadingMode
import org.junit.Test

private fun assertEquals(expected: Any?, actual: Any?) = assertThat(actual).isEqualTo(expected)
private fun assertTrue(v: Boolean) = assertThat(v).isTrue()
private fun assertFalse(v: Boolean) = assertThat(v).isFalse()
private inline fun <reified T> assertIs(v: Any?) = assertThat(v).isInstanceOf(T::class.java)

class MessageSelectionTest {

    @Test
    fun `entering seeds the selection with the pressed message`() {
        val selection = MessageSelection.begin("m1")
        assertTrue(selection.isActive)
        assertEquals(setOf("m1"), selection.ids)
    }

    @Test
    fun `leaving empties the selection - it never survives the exit`() {
        assertEquals(MessageSelection.Inactive, MessageSelection.begin("m1").end())
        assertFalse(MessageSelection.Inactive.isActive)
    }

    @Test
    fun `toggling adds then removes one message`() {
        val added = MessageSelection.begin("m1").toggle("m2")
        assertEquals(setOf("m1", "m2"), (added as MessageSelection.Toggle.Changed).selection.ids)
        val removed = added.selection.toggle("m2")
        assertEquals(setOf("m1"), (removed as MessageSelection.Toggle.Changed).selection.ids)
    }

    @Test
    fun `a hundred and first message is a signalled no-op, never a silent overflow`() {
        val full = (1..MessageSelection.CAP).fold(MessageSelection.begin("m0")) { acc, i ->
            if (i == MessageSelection.CAP) acc else (acc.toggle("m$i") as MessageSelection.Toggle.Changed).selection
        }
        assertEquals(MessageSelection.CAP, full.ids.size)
        assertEquals(MessageSelection.Toggle.CapReached, full.toggle("extra"))
        assertIs<MessageSelection.Toggle.Changed>(full.toggle("m1"))
    }

    @Test
    fun `an inactive selection ignores a toggle`() {
        assertEquals(MessageSelection.Toggle.Ignored, MessageSelection.Inactive.toggle("m1"))
    }

    @Test
    fun `the selection reads in thread order, not tap order`() {
        val selection = MessageSelection.begin("m3").let { (it.toggle("m1") as MessageSelection.Toggle.Changed).selection }
        assertEquals(listOf("m1", "m3"), selection.inThreadOrder(listOf("m1", "m2", "m3")))
    }

    @Test
    fun `a message that vanished leaves the selection`() {
        val selection = MessageSelection.begin("m1").let { (it.toggle("m2") as MessageSelection.Toggle.Changed).selection }
        assertEquals(setOf("m2"), selection.retaining(setOf("m2", "m3")).ids)
    }

    @Test
    fun `an emptied selection keeps the mode open until the user leaves`() {
        val emptied = MessageSelection.begin("m1").toggle("m1") as MessageSelection.Toggle.Changed
        assertTrue(emptied.selection.isActive)
        assertTrue(emptied.selection.ids.isEmpty())
    }
}

class MessageSelectionHostTest {
    @Test
    fun `the river and the summary hand over to the script, the others stay`() {
        val modes = ConversationReadingMode.values()
        val landed = modes.associateWith { MessageSelectionHost.landing(it) }
        assertEquals(ConversationReadingMode.SCRIPT, landed[ConversationReadingMode.SUMMARY])
        assertEquals(ConversationReadingMode.SCRIPT, landed[ConversationReadingMode.RIVER])
        assertEquals(null, landed[ConversationReadingMode.BUBBLES])
        assertEquals(null, landed[ConversationReadingMode.FOCAL])
        assertEquals(null, landed[ConversationReadingMode.SCRIPT])
    }
}
