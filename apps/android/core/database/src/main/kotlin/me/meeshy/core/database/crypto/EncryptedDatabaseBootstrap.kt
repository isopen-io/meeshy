package me.meeshy.core.database.crypto

import java.io.File
import java.io.IOException
import me.meeshy.core.database.DatabaseRecovery

/**
 * Le disque a refusé de lire `meeshy.db` : rien n'est purgé ni migré. La cause est une [IOException], donc
 * [DatabaseRecovery.classify] y lit une indisponibilité et ce lancement s'ouvre en mémoire.
 */
public class DatabaseStorageUnavailableException(file: File) :
    IllegalStateException("database file ${file.name} is unreadable on disk", IOException("header read refused"))

/**
 * Prépare le fichier `meeshy.db` avant la première ouverture : relit (ou crée) la clé, migre une base en clair,
 * purge un fichier que la clé ne déverrouille plus. Exécuté une seule fois par process, à la première ouverture de
 * Room (jamais à la construction du singleton Hilt, [LazyPassphraseOpenHelperFactory]). Tout échec lève, et
 * `DatabaseOpener` le traite : une base en clair abîmée part en quarantaine, toute autre panne ouvre la base EN MÉMOIRE
 * pour ce lancement — jamais un repli en clair, jamais un plantage en boucle. Un échec n'est pas mémorisé : l'appel
 * suivant (recréation, ou lancement suivant) rejoue la préparation.
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

    /**
     * La clé, pour relire une base qu'on met de côté, sans rejouer une migration qui vient d'échouer ; `null` si le coffre
     * ne la rend pas (le sauvetage ne lit alors rien d'un fichier chiffré, et n'écrit rien).
     */
    public fun salvageKey(): DatabaseKey? = key ?: try {
        keys.obtain()
    } catch (_: DatabaseEncryptionException) {
        null
    }

    private fun run(): DatabaseKey {
        val current = keys.obtain()
        val state = migrator.facts(databaseFile).main
        when (KeyLossPolicy.decide(current.origin, state)) {
            StartupAction.DEFER -> throw DatabaseStorageUnavailableException(databaseFile)
            StartupAction.PURGE_THEN_OPEN -> purge(current.origin, state)
            StartupAction.OPEN, StartupAction.MIGRATE_PLAINTEXT -> Unit
        }
        val executed = migrator.migrate(databaseFile, current.passphrase())
        if (executed.isNotEmpty()) onEvent("$MIGRATION${executed.joinToString(",")}")
        return current
    }

    private fun purge(origin: KeyOrigin, state: DatabaseFileState) {
        onEvent("${PURGE}origin=$origin,state=$state")
        PlaintextDatabaseMigrator.SIDES.forEach { suffix -> File(databaseFile.path + suffix).delete() }
        DatabaseRecovery.clearCorruptionMarker(databaseFile)
    }

    public companion object {
        public const val PURGE: String = "purge:"
        public const val MIGRATION: String = "migration:"
    }
}
