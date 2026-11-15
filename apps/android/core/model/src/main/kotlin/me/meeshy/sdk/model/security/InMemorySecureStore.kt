package me.meeshy.sdk.model.security

/** Volatile [SecureStore] — the test double and preview vault. Thread-safe. */
class InMemorySecureStore(
    private val failWrites: Boolean = false,
    private val unreadableKeys: Set<String> = emptySet(),
    allUnreadable: Boolean = false,
) : SecureStore {

    private val unreadableAccounts = if (allUnreadable) mutableSetOf<String?>(ALL) else mutableSetOf()

    private val raw = LinkedHashMap<String, String>()
    private val lock = Any()

    override fun get(key: String, account: String?): String? =
        synchronized(lock) { raw[SecureKeyNamespace.compose(account, key)] }

    override fun read(key: String, account: String?): SecureRead = synchronized(lock) {
        val composed = SecureKeyNamespace.compose(account, key)
        when {
            composed in unreadableKeys -> SecureRead.Unreadable
            ALL in unreadableAccounts && account !in unreadableAccounts -> SecureRead.Unreadable
            else -> raw[composed]?.let(SecureRead::Present) ?: SecureRead.Absent
        }
    }

    override fun acknowledgeRecovery(account: String?) {
        synchronized(lock) { unreadableAccounts.add(account) }
    }

    override fun put(key: String, value: String, account: String?): Boolean {
        if (failWrites) return false
        synchronized(lock) { raw[SecureKeyNamespace.compose(account, key)] = value }
        return true
    }

    override fun remove(key: String, account: String?) {
        synchronized(lock) { raw.remove(SecureKeyNamespace.compose(account, key)) }
    }

    override fun keys(account: String?): Set<String> = synchronized(lock) {
        raw.keys.mapNotNull { SecureKeyNamespace.bareKey(it, account) }.toSet()
    }

    override fun clearAccount(account: String) {
        val owner = SecureKeyNamespace.normalize(account) ?: return
        synchronized(lock) { raw.keys.removeAll { SecureKeyNamespace.belongsTo(it, owner) } }
    }

    override fun clearAll() {
        synchronized(lock) { raw.clear() }
    }

    private companion object {
        const val ALL = "*"
    }
}
