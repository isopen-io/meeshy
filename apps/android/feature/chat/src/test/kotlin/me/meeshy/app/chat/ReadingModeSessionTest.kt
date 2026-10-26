package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.reading.mode.ConversationReadingMode
import me.meeshy.sdk.model.reading.mode.ConversationReadingMode.BUBBLES
import me.meeshy.sdk.model.reading.mode.ConversationReadingMode.FOCAL
import me.meeshy.sdk.model.reading.mode.ConversationReadingMode.SCRIPT
import me.meeshy.sdk.model.reading.mode.ConversationReadingMode.SUMMARY
import me.meeshy.sdk.model.reading.mode.LensUnavailableReason
import me.meeshy.sdk.model.reading.mode.OrchestratorDecision
import me.meeshy.sdk.model.reading.mode.OrchestratorDecisionReason
import me.meeshy.sdk.model.reading.mode.ReadingModePreferenceScope
import org.junit.Test

class ReadingModeSessionTest {

    private class MemoryStore : ReadingModePreferenceStoring, ReadingModeFlags {
        val modes = mutableMapOf<String, ConversationReadingMode>()
        val opened = mutableMapOf<String, Long>()
        override var isReadingModesEnabled = true
        override var isRiviereModeEnabled = true

        override fun mode(conversationId: String, scope: ReadingModePreferenceScope) =
            modes[ReadingModePreferenceScope.modeKey(scope, conversationId)]

        override fun setMode(mode: ConversationReadingMode?, conversationId: String, scope: ReadingModePreferenceScope) {
            val key = ReadingModePreferenceScope.modeKey(scope, conversationId)
            if (mode == null) modes.remove(key) else modes[key] = mode
        }

        override fun lastOpenedAtMs(conversationId: String, scope: ReadingModePreferenceScope) =
            opened[ReadingModePreferenceScope.lastOpenedKey(scope, conversationId)]

        override fun noteOpened(conversationId: String, scope: ReadingModePreferenceScope, atMs: Long) {
            opened[ReadingModePreferenceScope.lastOpenedKey(scope, conversationId)] = atMs
        }
    }

    private val me = ReadingModePreferenceScope.Registered("u1")
    private val now = 1_000_000_000_000L

    private fun open(
        store: MemoryStore,
        type: String = "direct",
        members: Int = 2,
        unread: Int = 0,
        scope: ReadingModePreferenceScope = me,
        delivered: Set<ConversationReadingMode> = DELIVERED_READING_MODES,
    ) = ReadingModeSession.open("c1", scope, type, members, unread, store, store, { now }, delivered)

    @Test
    fun `Android opens in Script with the AUTO notch, as iOS, once Script is rendered`() {
        val state = open(MemoryStore()).state.value
        assertThat(state.decision).isEqualTo(OrchestratorDecision(SCRIPT, OrchestratorDecisionReason.DEFAULT))
        assertThat(state.isAuto).isTrue()
        assertThat(state.showsChip).isTrue()
        assertThat(state.nextInCycle).isEqualTo(BUBBLES)
    }

    @Test
    fun `while only Bubbles is rendered every decision falls back to Bubbles`() {
        val state = open(MemoryStore(), delivered = setOf(BUBBLES)).state.value
        assertThat(state.decision).isEqualTo(OrchestratorDecision(BUBBLES, OrchestratorDecisionReason.DEFAULT))
        assertThat(state.nextInCycle).isNull()
    }

    @Test
    fun `too many unread messages still open in Script while Summary is not rendered`() {
        val state = open(MemoryStore(), unread = 40).state.value
        assertThat(state.decision).isEqualTo(OrchestratorDecision(SCRIPT, OrchestratorDecisionReason.UNREAD_OVER_CAP))
        assertThat(state.rows.single { it.mode == SUMMARY }.unavailableReason).isEqualTo(LensUnavailableReason.NotYetRendered)
    }

    @Test
    fun `selecting Bubbles is sticky across a reopen, Automatique clears it`() {
        val store = MemoryStore()
        val session = open(store)
        session.select(BUBBLES)
        assertThat(session.state.value.decision).isEqualTo(OrchestratorDecision(BUBBLES, OrchestratorDecisionReason.STICKY))
        assertThat(open(store).state.value.isAuto).isFalse()
        session.resetToAuto()
        assertThat(store.modes).isEmpty()
        assertThat(session.state.value.isAuto).isTrue()
    }

    @Test
    fun `opening notes the visit after deciding, so the absence rule sees the previous one`() {
        val store = MemoryStore()
        val first = open(store, unread = 12, delivered = ConversationReadingMode.entries.toSet())
        assertThat(first.state.value.decision.reason).isEqualTo(OrchestratorDecisionReason.STALE_ABSENCE)
        assertThat(store.opened.values.single()).isEqualTo(now)
        val second = open(store, unread = 12, delivered = ConversationReadingMode.entries.toSet())
        assertThat(second.state.value.decision).isEqualTo(OrchestratorDecision(SCRIPT, OrchestratorDecisionReason.DEFAULT))
    }

    @Test
    fun `the menu greys the views Android does not render yet and keeps River's real reason`() {
        val rows = open(MemoryStore()).state.value.rows
        assertThat(rows.map { it.mode }).containsExactly(FOCAL, SCRIPT, BUBBLES, SUMMARY, ConversationReadingMode.RIVER).inOrder()
        assertThat(rows.single { it.mode == BUBBLES }.isAvailable).isTrue()
        assertThat(rows.single { it.mode == FOCAL }.unavailableReason).isEqualTo(LensUnavailableReason.NotYetRendered)
        assertThat(rows.single { it.mode == ConversationReadingMode.RIVER }.unavailableReason).isEqualTo(LensUnavailableReason.RiverNever)
    }

    @Test
    fun `once every view is rendered the session follows iOS - Script by default, tap cycles`() {
        val session = open(MemoryStore(), type = "group", members = 8, delivered = ConversationReadingMode.entries.toSet())
        assertThat(session.state.value.mode).isEqualTo(SCRIPT)
        assertThat(session.state.value.nextInCycle).isEqualTo(BUBBLES)
        session.select(BUBBLES)
        assertThat(session.state.value.nextInCycle).isEqualTo(FOCAL)
        assertThat(session.state.value.rows.single { it.mode == ConversationReadingMode.RIVER }.isAvailable).isTrue()
    }

    @Test
    fun `a disabled flag hides the chip`() {
        val store = MemoryStore().apply { isReadingModesEnabled = false }
        assertThat(open(store).state.value.showsChip).isFalse()
    }

    @Test
    fun `two readers on one device never share a choice`() {
        val store = MemoryStore()
        open(store).select(BUBBLES)
        val guest = open(store, scope = ReadingModePreferenceScope.Anonymous("p-1"))
        assertThat(guest.state.value.isAuto).isTrue()
    }
}
