package me.meeshy.app.conversations

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.flow.MutableStateFlow
import org.junit.Test
import me.meeshy.sdk.lock.InMemoryConversationLockStore

class ConversationListLockCoordinatorTest {

    private class Harness(val store: InMemoryConversationLockStore) {
        val state = MutableStateFlow(ConversationListUiState())
        val opened = mutableListOf<String>()
        val coordinator = ConversationListLockCoordinator(state, store) { opened += it }
        val prompt get() = state.value.lockPrompt
        fun enter(digits: String) = digits.forEach { coordinator.onLockDigit(it - '0') }
    }

    private fun harness(store: InMemoryConversationLockStore = InMemoryConversationLockStore()) = Harness(store)

    @Test
    fun `master pin setup chains into the lock code entry`() {
        val h = harness()

        h.coordinator.onLockToggle("c1")
        assertThat(h.prompt?.mode).isEqualTo(LockPinMode.SETUP_MASTER_PIN)
        h.enter("123456")
        h.enter("123456")

        assertThat(h.prompt?.mode).isEqualTo(LockPinMode.LOCK_CONVERSATION)
        assertThat(h.prompt?.conversationId).isEqualTo("c1")
        assertThat(h.prompt?.step).isEqualTo(1)
        assertThat(h.state.value.hasMasterPin).isTrue()

        h.enter("4321")
        h.enter("4321")

        assertThat(h.prompt).isNull()
        assertThat(h.store.isLocked("c1")).isTrue()
    }

    @Test
    fun `tapping a locked row asks for the code then opens it`() {
        val store = InMemoryConversationLockStore().apply {
            setMasterPin("123456")
            setLock("c1", "4321")
        }
        val h = harness(store)

        h.coordinator.onConversationTap("c1")
        assertThat(h.opened).isEmpty()
        assertThat(h.prompt?.mode).isEqualTo(LockPinMode.OPEN_CONVERSATION)

        h.enter("4321")

        assertThat(h.opened).containsExactly("c1")
        assertThat(h.prompt).isNull()
    }

    @Test
    fun `tapping an unlocked row opens it directly`() {
        val h = harness()

        h.coordinator.onConversationTap("c9")

        assertThat(h.opened).containsExactly("c9")
        assertThat(h.prompt).isNull()
    }

    @Test
    fun `unlock all drops every lock with the master pin`() {
        val store = InMemoryConversationLockStore().apply {
            setMasterPin("123456")
            setLock("c1", "4321")
            setLock("c2", "1111")
        }
        val h = harness(store)

        h.coordinator.onUnlockAll()
        assertThat(h.prompt?.mode).isEqualTo(LockPinMode.UNLOCK_ALL)
        h.enter("123456")

        assertThat(store.lockedConversationIds).isEmpty()
        assertThat(h.prompt).isNull()
    }

    @Test
    fun `unlock all is inert when nothing is locked`() {
        val h = harness(InMemoryConversationLockStore().apply { setMasterPin("123456") })

        h.coordinator.onUnlockAll()

        assertThat(h.prompt).isNull()
    }

    @Test
    fun `removing the master pin is refused while a lock exists`() {
        val store = InMemoryConversationLockStore().apply {
            setMasterPin("123456")
            setLock("c1", "4321")
        }
        val h = harness(store)

        h.coordinator.onRemoveMasterPin()

        assertThat(h.prompt).isNull()
    }

    @Test
    fun `removing the master pin opens its sheet once nothing is locked`() {
        val h = harness(InMemoryConversationLockStore().apply { setMasterPin("123456") })

        h.coordinator.onRemoveMasterPin()

        assertThat(h.prompt?.mode).isEqualTo(LockPinMode.REMOVE_MASTER_PIN)
    }

    @Test
    fun `dismissing drops the sheet and the pending chained lock`() {
        val h = harness()

        h.coordinator.onLockToggle("c1")
        h.coordinator.dismissLockPrompt()
        h.coordinator.onLockToggle("c2")
        h.enter("123456")
        h.enter("123456")

        assertThat(h.prompt?.conversationId).isEqualTo("c2")
    }
}
