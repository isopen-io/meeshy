package me.meeshy.sdk.lock

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural contract for [ConversationLockStore], exercised through the
 * in-memory implementation — the fast, pure-JVM vehicle for the interface's
 * full contract. [EncryptedConversationLockStoreTest] proves the persistent
 * implementation satisfies the same contract, not a duplicate of every case.
 */
class InMemoryConversationLockStoreTest {

    private fun store() = InMemoryConversationLockStore()

    // ----- master PIN -----

    @Test
    fun `hasMasterPin is false before any PIN is set`() {
        assertThat(store().hasMasterPin()).isFalse()
    }

    @Test
    fun `setMasterPin then hasMasterPin is true`() {
        val sut = store()
        sut.setMasterPin("123456")

        assertThat(sut.hasMasterPin()).isTrue()
    }

    @Test
    fun `verifyMasterPin succeeds for the correct pin`() {
        val sut = store()
        sut.setMasterPin("123456")

        assertThat(sut.verifyMasterPin("123456")).isTrue()
    }

    @Test
    fun `verifyMasterPin fails for the wrong pin`() {
        val sut = store()
        sut.setMasterPin("123456")

        assertThat(sut.verifyMasterPin("000000")).isFalse()
    }

    @Test
    fun `verifyMasterPin fails when no PIN is set`() {
        assertThat(store().verifyMasterPin("123456")).isFalse()
    }

    @Test
    fun `removeMasterPin clears the PIN when no conversation is locked`() {
        val sut = store()
        sut.setMasterPin("123456")

        sut.removeMasterPin()

        assertThat(sut.hasMasterPin()).isFalse()
    }

    @Test
    fun `removeMasterPin is a no-op while a conversation is still locked`() {
        val sut = store()
        sut.setMasterPin("123456")
        sut.setLock("c1", "1111")

        sut.removeMasterPin()

        assertThat(sut.hasMasterPin()).isTrue()
    }

    @Test
    fun `forceRemoveMasterPin clears the PIN even while a conversation is locked`() {
        val sut = store()
        sut.setMasterPin("123456")
        sut.setLock("c1", "1111")

        sut.forceRemoveMasterPin()

        assertThat(sut.hasMasterPin()).isFalse()
    }

    // ----- per-conversation lock -----

    @Test
    fun `isLocked is false for a conversation with no lock`() {
        assertThat(store().isLocked("c1")).isFalse()
    }

    @Test
    fun `setLock marks the conversation locked`() {
        val sut = store()
        sut.setLock("c1", "1111")

        assertThat(sut.isLocked("c1")).isTrue()
        assertThat(sut.lockedConversationIds).containsExactly("c1")
    }

    @Test
    fun `verifyLock succeeds for the correct pin`() {
        val sut = store()
        sut.setLock("c1", "1111")

        assertThat(sut.verifyLock("c1", "1111")).isTrue()
    }

    @Test
    fun `verifyLock fails for the wrong pin`() {
        val sut = store()
        sut.setLock("c1", "1111")

        assertThat(sut.verifyLock("c1", "9999")).isFalse()
    }

    @Test
    fun `verifyLock fails for an unlocked conversation`() {
        assertThat(store().verifyLock("c1", "1111")).isFalse()
    }

    @Test
    fun `locks are isolated per conversation`() {
        val sut = store()
        sut.setLock("c1", "1111")
        sut.setLock("c2", "2222")

        assertThat(sut.verifyLock("c1", "2222")).isFalse()
        assertThat(sut.verifyLock("c2", "1111")).isFalse()
        assertThat(sut.lockedConversationIds).containsExactly("c1", "c2")
    }

    @Test
    fun `removeLock unlocks only that conversation`() {
        val sut = store()
        sut.setLock("c1", "1111")
        sut.setLock("c2", "2222")

        sut.removeLock("c1")

        assertThat(sut.isLocked("c1")).isFalse()
        assertThat(sut.isLocked("c2")).isTrue()
    }

    @Test
    fun `removeAllLocks clears every conversation lock`() {
        val sut = store()
        sut.setLock("c1", "1111")
        sut.setLock("c2", "2222")

        sut.removeAllLocks()

        assertThat(sut.lockedConversationIds).isEmpty()
    }

    // ----- logout -----

    @Test
    fun `resetForLogout wipes both the master PIN and every conversation lock`() {
        val sut = store()
        sut.setMasterPin("123456")
        sut.setLock("c1", "1111")

        sut.resetForLogout()

        assertThat(sut.hasMasterPin()).isFalse()
        assertThat(sut.lockedConversationIds).isEmpty()
    }

    // ----- reactive locked ids -----

    @Test
    fun `lockedConversationIdsFlow starts empty`() {
        assertThat(store().lockedConversationIdsFlow.value).isEmpty()
    }

    @Test
    fun `lockedConversationIdsFlow reflects setLock`() {
        val sut = store()
        sut.setLock("c1", "1111")

        assertThat(sut.lockedConversationIdsFlow.value).containsExactly("c1")
    }

    @Test
    fun `lockedConversationIdsFlow reflects removeLock`() {
        val sut = store()
        sut.setLock("c1", "1111")
        sut.setLock("c2", "2222")

        sut.removeLock("c1")

        assertThat(sut.lockedConversationIdsFlow.value).containsExactly("c2")
    }

    @Test
    fun `lockedConversationIdsFlow reflects removeAllLocks`() {
        val sut = store()
        sut.setLock("c1", "1111")

        sut.removeAllLocks()

        assertThat(sut.lockedConversationIdsFlow.value).isEmpty()
    }

    @Test
    fun `lockedConversationIdsFlow reflects resetForLogout`() {
        val sut = store()
        sut.setLock("c1", "1111")

        sut.resetForLogout()

        assertThat(sut.lockedConversationIdsFlow.value).isEmpty()
    }
}
