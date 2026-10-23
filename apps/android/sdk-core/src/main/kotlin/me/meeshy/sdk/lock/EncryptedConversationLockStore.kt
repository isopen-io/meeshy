package me.meeshy.sdk.lock

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import me.meeshy.sdk.model.security.SecureStore

/**
 * [ConversationLockStore] on the device [SecureStore] (the Keystore-backed
 * `meeshy_conversation_locks` file in production, an `InMemorySecureStore` in
 * tests). [lockedConversationIds] is derived from which lock keys exist rather
 * than kept as a separate persisted list, so it can never drift from the hashes
 * that actually gate a conversation. Keys are the historical bare ones
 * (`master_pin`, `lock_<id>`), so an update keeps every PIN valid.
 *
 * The flow is seeded lazily: nothing opens the Keystore at construction.
 */
class EncryptedConversationLockStore(private val store: SecureStore) : ConversationLockStore {

    override val lockedConversationIds: Set<String>
        get() = computeLockedConversationIds()

    private val _lockedConversationIdsFlow: MutableStateFlow<Set<String>> by lazy {
        MutableStateFlow(computeLockedConversationIds())
    }
    override val lockedConversationIdsFlow: StateFlow<Set<String>>
        get() = _lockedConversationIdsFlow.asStateFlow()

    private fun computeLockedConversationIds(): Set<String> = store.keys()
        .filter { it.startsWith(LOCK_KEY_PREFIX) }
        .map { it.removePrefix(LOCK_KEY_PREFIX) }
        .toSet()

    private fun publish() {
        _lockedConversationIdsFlow.value = computeLockedConversationIds()
    }

    override fun hasMasterPin(): Boolean = store.get(MASTER_PIN_KEY) != null

    override fun setMasterPin(pin: String) {
        store.put(MASTER_PIN_KEY, PinHasher.hash(pin))
    }

    override fun verifyMasterPin(pin: String): Boolean =
        store.get(MASTER_PIN_KEY) == PinHasher.hash(pin)

    override fun removeMasterPin() {
        if (lockedConversationIds.isEmpty()) store.remove(MASTER_PIN_KEY)
    }

    override fun forceRemoveMasterPin() {
        store.remove(MASTER_PIN_KEY)
    }

    override fun isLocked(conversationId: String): Boolean = store.get(lockKey(conversationId)) != null

    override fun setLock(conversationId: String, pin: String) {
        store.put(lockKey(conversationId), PinHasher.hash(pin))
        publish()
    }

    override fun verifyLock(conversationId: String, pin: String): Boolean =
        store.get(lockKey(conversationId)) == PinHasher.hash(pin)

    override fun removeLock(conversationId: String) {
        store.remove(lockKey(conversationId))
        publish()
    }

    override fun removeAllLocks() {
        lockedConversationIds.forEach { store.remove(lockKey(it)) }
        publish()
    }

    private fun lockKey(conversationId: String) = "$LOCK_KEY_PREFIX$conversationId"

    private companion object {
        private const val MASTER_PIN_KEY = "master_pin"
        private const val LOCK_KEY_PREFIX = "lock_"
    }
}
