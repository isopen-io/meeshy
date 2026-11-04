package me.meeshy.core.database.crypto

import java.io.File
import me.meeshy.core.database.DatabaseRecovery

/**
 * Prépare le fichier `meeshy.db` avant la première ouverture : relit (ou crée) la clé, migre une base en clair,
 * purge un fichier que la clé ne déverrouille plus. Exécuté une seule fois par process, à la première ouverture de
 * Room (jamais à la construction du singleton Hilt, [LazyPassphraseOpenHelperFactory]). Tout échec lève : il n'y a
 * aucun repli en clair.
 */
public class EncryptedDatabaseBootstrap(
    private val databaseFile: File,
    private val keys: DatabaseKeyProvider,
    private val migrator: PlaintextDatabaseMigrator,
    private val onEvent: (String) -> Unit = {},
) {
    @Volatile private var key: DatabaseKey? = null

    public val file: File get() = databaseFile

    public fun prepare(): DatabaseKey = key ?: synchronized(this) { key ?: run().also { key = it } }

    public fun passphrase(): ByteArray = prepare().passphrase()

    private fun run(): DatabaseKey {
        val current = keys.obtain()
        val state = migrator.facts(databaseFile).main
        if (KeyLossPolicy.decide(current.origin, state) == StartupAction.PURGE_THEN_OPEN) purge(current.origin, state)
        val executed = migrator.migrate(databaseFile, current.passphrase())
        if (executed.isNotEmpty()) onEvent("migration:${executed.joinToString(",")}")
        return current
    }

    private fun purge(origin: KeyOrigin, state: DatabaseFileState) {
        onEvent("purge:origin=$origin,state=$state")
        PlaintextDatabaseMigrator.SIDES.forEach { suffix -> File(databaseFile.path + suffix).delete() }
        DatabaseRecovery.clearCorruptionMarker(databaseFile)
    }
}
