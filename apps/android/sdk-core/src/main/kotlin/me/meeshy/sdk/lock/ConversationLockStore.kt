package me.meeshy.sdk.lock

import java.security.MessageDigest
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Hashes a PIN for storage — never persist a PIN in plaintext. Port of iOS
 * `ConversationLockManager.sha256`.
 */
internal object PinHasher {
    fun hash(pin: String): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(pin.toByteArray(Charsets.UTF_8))
        return digest.joinToString("") { "%02x".format(it) }
    }
}

/**
 * Local PIN-based lock for conversations — port of iOS `ConversationLockManager`.
 * A 6-digit master PIN gates unlocking; each locked conversation additionally
 * carries its own 4-digit PIN. Both are stored hashed, compared by hash.
 */
interface ConversationLockStore {
    val lockedConversationIds: Set<String>

    /**
     * Reactive mirror of [lockedConversationIds] — port of iOS
     * `ConversationLockManager`'s `@Published lockedConversationIds`, which the
     * conversation list observes directly so a lock/unlock re-evaluates every
     * row. Emits the full current snapshot on every mutation (never a delta).
     */
    val lockedConversationIdsFlow: StateFlow<Set<String>>

    fun hasMasterPin(): Boolean
    fun setMasterPin(pin: String)
    fun verifyMasterPin(pin: String): Boolean

    /** No-op while any conversation is still locked — see [forceRemoveMasterPin]. */
    fun removeMasterPin()

    /** Bypasses the [removeMasterPin] guard — for unlock-all / logout wipe. */
    fun forceRemoveMasterPin()

    fun isLocked(conversationId: String): Boolean
    fun setLock(conversationId: String, pin: String)
    fun verifyLock(conversationId: String, pin: String): Boolean
    fun removeLock(conversationId: String)
    fun removeAllLocks()

    /**
     * Logout = full wipe (port of iOS `resetForLogout`). Neither the master PIN
     * nor a per-conversation lock is namespaced by account — without this, a
     * PIN set under account A would still gate a conversation under account B.
     */
    fun resetForLogout() {
        removeAllLocks()
        forceRemoveMasterPin()
    }
}

/** Volatile lock store — for tests and previews. */
class InMemoryConversationLockStore : ConversationLockStore {
    private var masterPinHash: String? = null
    private val lockHashes = mutableMapOf<String, String>()
    private val _lockedConversationIdsFlow = MutableStateFlow<Set<String>>(emptySet())

    override val lockedConversationIds: Set<String> get() = lockHashes.keys.toSet()
    override val lockedConversationIdsFlow: StateFlow<Set<String>> = _lockedConversationIdsFlow.asStateFlow()

    override fun hasMasterPin(): Boolean = masterPinHash != null

    override fun setMasterPin(pin: String) {
        masterPinHash = PinHasher.hash(pin)
    }

    override fun verifyMasterPin(pin: String): Boolean =
        masterPinHash != null && masterPinHash == PinHasher.hash(pin)

    override fun removeMasterPin() {
        if (lockHashes.isEmpty()) masterPinHash = null
    }

    override fun forceRemoveMasterPin() {
        masterPinHash = null
    }

    override fun isLocked(conversationId: String): Boolean = lockHashes.containsKey(conversationId)

    override fun setLock(conversationId: String, pin: String) {
        lockHashes[conversationId] = PinHasher.hash(pin)
        _lockedConversationIdsFlow.value = lockHashes.keys.toSet()
    }

    override fun verifyLock(conversationId: String, pin: String): Boolean =
        lockHashes[conversationId] == PinHasher.hash(pin)

    override fun removeLock(conversationId: String) {
        lockHashes.remove(conversationId)
        _lockedConversationIdsFlow.value = lockHashes.keys.toSet()
    }

    override fun removeAllLocks() {
        lockHashes.clear()
        _lockedConversationIdsFlow.value = emptySet()
    }
}
