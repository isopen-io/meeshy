package me.meeshy.sdk.model.security

/**
 * Idempotent migration of bare (un-namespaced) secrets into an account's
 * namespace — mirror of iOS `LegacyAuthKeyMigration`.
 *
 * Law: copy only into an empty destination slot (never overwrite), and ALWAYS
 * delete the bare original, even when the copy failed — a loss is reported
 * (key name only, never a value), a cross-account leak is not an option.
 * Replaying it changes nothing.
 */
object SecureStoreMigration {

    data class Outcome(val copied: Set<String>, val lost: Set<String>)

    fun adoptBareKeys(
        store: SecureStore,
        account: String?,
        keys: Collection<String>,
        onLoss: (key: String) -> Unit = {},
    ): Outcome {
        val owner = SecureKeyNamespace.normalize(account) ?: return Outcome(emptySet(), emptySet())
        val copied = mutableSetOf<String>()
        val lost = mutableSetOf<String>()
        keys.forEach { key ->
            val bare = store.get(key) ?: return@forEach
            val occupied = store.get(key, owner) != null
            when {
                occupied -> Unit
                store.put(key, bare, owner) -> copied += key
                else -> {
                    lost += key
                    onLoss(key)
                }
            }
            store.remove(key)
        }
        return Outcome(copied, lost)
    }
}
