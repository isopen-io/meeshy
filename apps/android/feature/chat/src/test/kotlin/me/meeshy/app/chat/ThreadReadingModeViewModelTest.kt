package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import me.meeshy.sdk.model.reading.mode.ConversationReadingMode
import me.meeshy.sdk.model.reading.mode.ConversationReadingMode.BUBBLES
import me.meeshy.sdk.model.reading.mode.ConversationReadingMode.FOCAL
import me.meeshy.sdk.model.reading.mode.ConversationReadingMode.SCRIPT
import me.meeshy.sdk.model.reading.mode.ReadingModeChoice
import me.meeshy.sdk.model.reading.mode.ReadingModePreferenceScope
import me.meeshy.sdk.reading.ReadingModeFlags
import me.meeshy.sdk.reading.ReadingModePreferenceStoring
import org.junit.Test

class ThreadReadingModeViewModelTest {

    private class MemoryStore : ReadingModePreferenceStoring, ReadingModeFlags {
        val modes = mutableMapOf<String, ConversationReadingMode>()
        var writes = 0
        override val isReadingModesEnabled: Boolean = true
        override val isRiviereModeEnabled: Boolean = true
        override fun mode(conversationId: String, scope: ReadingModePreferenceScope) = modes[conversationId]
        override fun setMode(mode: ConversationReadingMode?, conversationId: String, scope: ReadingModePreferenceScope) {
            writes++
            if (mode == null) modes.remove(conversationId) else modes[conversationId] = mode
        }
        override fun lastOpenedAtMs(conversationId: String, scope: ReadingModePreferenceScope): Long? = 1L
        override fun noteOpened(conversationId: String, scope: ReadingModePreferenceScope, atMs: Long) = Unit
    }

    private class SessionSource(val session: ReadingModeSession) : ThreadReadingModeSource {
        override val state: StateFlow<ReadingModeUiState?> = session.state
        override fun select(mode: ConversationReadingMode) = session.select(mode)
        override fun resetToAuto() = session.resetToAuto()
    }

    private val now = 1_000L

    private fun open(
        store: MemoryStore = MemoryStore(),
        forced: ConversationReadingMode? = null,
        type: String = "group",
    ) = ReadingModeSession.open(
        conversationId = "c1",
        scope = ReadingModePreferenceScope.Registered("me"),
        conversationType = type,
        memberCount = 8,
        unreadCount = 0,
        flags = store,
        store = store,
        now = { now },
        forcedMode = forced,
    ).let { SessionSource(it) to store }

    @Test
    fun `reads the mode the session resolved`() {
        val (source, _) = open()
        val vm = ThreadReadingModeViewModel(source)
        assertThat(vm.state.value).isNotNull()
        assertThat(vm.state.value!!.mode).isEqualTo(SCRIPT)
    }

    @Test
    fun `cycling advances to the next view and writes the preference once`() {
        val (source, store) = open()
        val vm = ThreadReadingModeViewModel(source)
        val expected = vm.state.value!!.nextInCycle!!

        assertThat(vm.cycle()).isTrue()

        assertThat(vm.state.value!!.mode).isEqualTo(expected)
        assertThat(store.writes).isEqualTo(1)
        assertThat(store.modes["c1"]).isEqualTo(expected)
    }

    @Test
    fun `the switch is optimistic, the state already shows the new mode`() {
        val (source, _) = open()
        val vm = ThreadReadingModeViewModel(source)
        vm.select(BUBBLES)
        assertThat(vm.state.value!!.mode).isEqualTo(BUBBLES)
        assertThat(vm.state.value!!.isAuto).isFalse()
    }

    @Test
    fun `automatic checks the auto entry and clears the stored choice`() {
        val (source, store) = open()
        val vm = ThreadReadingModeViewModel(source)
        vm.select(FOCAL)
        vm.resetToAuto()
        assertThat(store.modes).isEmpty()
        assertThat(vm.state.value!!.menuEntries.first { it.isSelected }.choice).isEqualTo(ReadingModeChoice.Auto)
    }

    @Test
    fun `a forced mode is ephemeral and is never written`() {
        val (source, store) = open(forced = FOCAL)
        val vm = ThreadReadingModeViewModel(source)
        assertThat(vm.state.value!!.mode).isEqualTo(FOCAL)
        assertThat(store.writes).isEqualTo(0)
    }

    @Test
    fun `the menu is the shared catalog with the sticky choice checked`() {
        val (source, _) = open()
        val vm = ThreadReadingModeViewModel(source)
        vm.select(SCRIPT)
        val checked = vm.state.value!!.menuEntries.filter { it.isSelected }
        assertThat(checked.map { it.choice }).containsExactly(ReadingModeChoice.Mode(SCRIPT))
        assertThat(vm.state.value!!.menuEntries.size).isEqualTo(6)
    }

    @Test
    fun `cycling before the opening is resolved does nothing`() {
        val unresolved = MutableStateFlow<ReadingModeUiState?>(null)
        val vm = ThreadReadingModeViewModel(object : ThreadReadingModeSource {
            override val state: StateFlow<ReadingModeUiState?> = unresolved
            override fun select(mode: ConversationReadingMode) = error("never")
            override fun resetToAuto() = Unit
        })
        assertThat(vm.cycle()).isFalse()
    }

    @Test
    fun `with the flag off the thread opens in script and shows no chip`() {
        val store = object : ReadingModeFlags, ReadingModePreferenceStoring by MemoryStore() {
            override val isReadingModesEnabled: Boolean = false
            override val isRiviereModeEnabled: Boolean = false
        }
        val session = ReadingModeSession.open(
            conversationId = "c1",
            scope = ReadingModePreferenceScope.Registered("me"),
            conversationType = "group",
            memberCount = 8,
            unreadCount = 0,
            flags = store,
            store = store,
            now = { now },
        )
        val vm = ThreadReadingModeViewModel(SessionSource(session))
        assertThat(vm.state.value!!.mode).isEqualTo(SCRIPT)
        assertThat(vm.state.value!!.showsChip).isFalse()
    }
}
