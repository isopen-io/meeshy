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
 * La migration a été différée faute de place autant de lancements que [EncryptedDatabaseBootstrap.maxDeferrals] le
 * permet : la base en clair ne s'ouvre plus telle quelle. La cause est une [IOException], donc [DatabaseRecovery.classify]
 * y lit une indisponibilité et ce lancement s'ouvre EN MÉMOIRE, l'outbox du disque relue en lecture seule.
 */
public class MigrationDeferralExhaustedException(file: File) :
    IllegalStateException("encryption of ${file.name} deferred too many times", IOException("disk cannot hold the encrypted copy"))

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
    private val freeBytes: (File) -> Long = { directory -> directory.usableSpace },
    public val maxDeferrals: Int = MAX_DEFERRALS,
) {
    @Volatile private var key: DatabaseKey? = null

    @Volatile private var deferred: Boolean = false

    private val deferrals = MigrationDeferrals(File(databaseFile.path + DEFERRALS_SUFFIX))

    public val file: File get() = databaseFile

    /**
     * `true` quand le disque ne pouvait pas porter la copie chiffrée : la base, déjà en clair sur le disque, s'ouvre telle
     * quelle pour ce lancement, et le suivant retente la migration. Ce lancement ÉCRIT EN CLAIR (cache, nouveaux messages,
     * outbox) : c'est le prix d'une app qui garde son cache et son outbox au lieu de tourner en mémoire. Il est borné et
     * signalé : chaque report est compté sur le disque et journalisé (`encryption-deferred:disk-full,launch=n/max`, stockage
     * dégradé), et au-delà de [maxDeferrals] lancements consécutifs la base en clair ne s'ouvre plus ([MigrationDeferralExhaustedException] :
     * base en mémoire, outbox relue). Une base recréée pendant un report (quarantaine) naît CHIFFRÉE : le report ne vaut que
     * tant que le fichier sur le disque est la base en clair d'origine ([prepare] le relit).
     */
    public val plaintextDeferred: Boolean get() = deferred

    /**
     * La clé, une fois la préparation faite. Un report en clair n'est gardé que tant que le fichier principal est encore
     * la base en clair qu'il protège : s'il a disparu (quarantaine avant une recréation) ou changé, la préparation se
     * rejoue, et la base qui naît est chiffrée.
     */
    public fun prepare(): DatabaseKey {
        key?.takeUnless { staleDeferral() }?.let { return it }
        return synchronized(this) {
            key?.takeUnless { staleDeferral() }?.let { return it }
            key = null
            run().also { key = it }
        }
    }

    private fun staleDeferral(): Boolean =
        deferred && DatabaseFileStates.of(databaseFile) != DatabaseFileState.PLAINTEXT

    /** La phrase remise à SQLCipher ; vide (base en clair, aucun codec) quand la migration est différée. */
    public fun passphrase(): ByteArray {
        val current = prepare()
        return if (deferred) ByteArray(0) else current.passphrase()
    }

    /**
     * La clé, pour relire une base qu'on met de côté, sans rejouer une migration qui vient d'échouer ; `null` si le coffre
     * ne la rend pas telle quelle. Une lecture seule : le sauvetage ne crée ni n'écrit jamais de clé, et face à une clé
     * perdue il ne lit rien d'un fichier chiffré (la purge le signale `key-lost`).
     */
    public fun salvageKey(): DatabaseKey? = key ?: keys.existingOrNull()

    private fun run(): DatabaseKey {
        deferred = false
        DatabaseRecovery.deletePlaintextQuarantines(databaseFile)
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
        if (lacksRoomForExport(facts)) {
            deferMigration(facts)
            return current
        }
        val executed = migrator.migrate(databaseFile, current.passphrase())
        deferrals.clear()
        if (executed.isNotEmpty()) onEvent("$MIGRATION${executed.joinToString(",")}")
        return current
    }

    /** L'export double la place de la base : s'il ne tient pas, il échouerait sur `SQLITE_FULL` à chaque lancement. */
    private fun lacksRoomForExport(facts: MigrationFacts): Boolean {
        if (MigrationStep.EXPORT !in PlaintextMigrationPlan.steps(facts)) return false
        val source = if (facts.main == DatabaseFileState.PLAINTEXT) databaseFile else PlaintextDatabaseMigrator.backup(databaseFile)
        val directory = databaseFile.absoluteFile.parentFile ?: return false
        return freeBytes(directory) < requiredFreeBytes(source)
    }

    /**
     * Une sauvegarde en clair seule est remise en place (un renommage) : sinon Room créerait une base vide à côté d'elle,
     * et la base en mémoire n'en relirait pas l'outbox. Le report est compté sur le disque ; un compteur qui ne s'écrit pas
     * vaut un report de trop (jamais d'écriture en clair sans borne).
     */
    private fun deferMigration(facts: MigrationFacts) {
        if (facts.main == DatabaseFileState.ABSENT) migrator.restoreBackup(databaseFile)
        val launch = deferrals.record()
        if (launch == null || launch > maxDeferrals) {
            onEvent("$DEFERRED$EXHAUSTED,launch=${launch ?: UNRECORDED}/$maxDeferrals")
            throw MigrationDeferralExhaustedException(databaseFile)
        }
        deferred = true
        onEvent("$DEFERRED$DISK_FULL,launch=$launch/$maxDeferrals")
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
        public const val DEFERRED: String = "encryption-deferred:"
        public const val EXHAUSTED: String = "exhausted"

        /** Les lancements consécutifs qui peuvent s'ouvrir en clair faute de place pour la copie chiffrée. */
        public const val MAX_DEFERRALS: Int = 3

        /** Le compteur des reports, à côté de la base : un entier, aucune donnée. */
        public const val DEFERRALS_SUFFIX: String = ".encryption-deferrals"
        private const val DISK_FULL = "disk-full"
        private const val UNRECORDED = "unrecorded"
        private const val MIN_MARGIN_BYTES = 4L * 1024 * 1024

        /**
         * La place que l'export exige à côté de [plain] : la base et son journal WAL (qu'elle peut absorber), plus une
         * marge d'un dixième (au moins 4 Mio) pour les pages de la copie chiffrée et son propre journal.
         */
        public fun requiredFreeBytes(plain: File): Long {
            val size = plain.length() + File(plain.path + "-wal").length()
            return size + maxOf(size / 10, MIN_MARGIN_BYTES)
        }
    }
}

/** Le nombre de lancements consécutifs dont la migration a été différée, dans un petit fichier à côté de la base. */
internal class MigrationDeferrals(private val file: File) {
    /** Compte un report de plus ; `null` si le compteur ne s'écrit pas. */
    fun record(): Int? = try {
        val next = (file.takeIf(File::isFile)?.readText()?.trim()?.toIntOrNull() ?: 0) + 1
        file.writeText(next.toString())
        next
    } catch (_: IOException) {
        null
    }

    fun clear() {
        if (file.isFile) file.delete()
    }
}
