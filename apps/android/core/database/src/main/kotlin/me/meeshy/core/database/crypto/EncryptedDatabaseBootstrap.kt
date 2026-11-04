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
 * purge un fichier que la clé ne déverrouille plus. Exécuté une seule fois par process, par `DatabaseOpener` AVANT
 * toute ouverture, donc sur le thread qui construit le singleton `MeeshyDatabase` (le `@Provides` de Hilt) : la
 * lecture du Keystore et, au premier lancement d'une base en clair, l'export intégral s'y paient. Tout échec lève, et
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
     * ne la rend pas telle quelle. Une lecture seule : le sauvetage ne crée ni n'écrit jamais de clé, et face à une clé
     * perdue il ne lit rien d'un fichier chiffré (la purge le signale `key-lost`).
     */
    public fun salvageKey(): DatabaseKey? = key ?: keys.existingOrNull()

    private fun run(): DatabaseKey {
        val facts = migrator.facts(databaseFile)
        val current = try {
            keys.obtain()
        } catch (unusable: DatabaseKeyUnavailableException) {
            if (dependsOnKey(facts)) throw unusable
            replace(unusable, facts.main)
        }
        val state = facts.main
        when (KeyLossPolicy.decide(current.origin, state)) {
            StartupAction.DEFER -> throw DatabaseStorageUnavailableException(databaseFile)
            StartupAction.PURGE_THEN_OPEN -> purge(current.origin, state)
            StartupAction.OPEN, StartupAction.MIGRATE_PLAINTEXT -> Unit
        }
        val executed = migrator.migrate(databaseFile, current.passphrase())
        if (executed.isNotEmpty()) onEvent("$MIGRATION${executed.joinToString(",")}")
        return current
    }

    /**
     * Un fichier peut avoir été chiffré par la clé que le coffre ne rend plus : base chiffrée (ou tronquée, ou illisible
     * sur le disque), ou copie chiffrée en attente de vérification à côté de la sauvegarde en clair. Sinon (base en clair,
     * absente), aucune donnée ne dépend de l'ancienne clé.
     */
    private fun dependsOnKey(facts: MigrationFacts): Boolean = when (facts.main) {
        DatabaseFileState.PLAINTEXT -> false
        DatabaseFileState.ABSENT -> facts.tempExists && facts.backupExists
        DatabaseFileState.ENCRYPTED, DatabaseFileState.TRUNCATED, DatabaseFileState.UNAVAILABLE -> true
    }

    /** Un coffre qui refuse aussi l'écriture laisse l'échec d'origine remonter : ce lancement s'ouvre en mémoire. */
    private fun replace(unusable: DatabaseKeyUnavailableException, state: DatabaseFileState): DatabaseKey {
        val fresh = try {
            keys.replaceUnusable()
        } catch (refused: DatabaseEncryptionException) {
            unusable.addSuppressed(refused)
            throw unusable
        }
        onEvent("${KEY_REPLACED}state=$state")
        return fresh
    }

    private fun purge(origin: KeyOrigin, state: DatabaseFileState) {
        onEvent("${PURGE}origin=$origin,state=$state")
        PlaintextDatabaseMigrator.SIDES.forEach { suffix -> File(databaseFile.path + suffix).delete() }
        DatabaseRecovery.clearCorruptionMarker(databaseFile)
    }

    public companion object {
        public const val PURGE: String = "purge:"
        public const val MIGRATION: String = "migration:"
        public const val KEY_REPLACED: String = "key-replaced:"
    }
}
