package me.meeshy.core.database.crypto

import me.meeshy.core.database.DatabaseInitDiagnostics
import me.meeshy.core.database.DatabaseInitStage
import me.meeshy.core.database.StorageHealth

/**
 * Rend visibles les gestes de [EncryptedDatabaseBootstrap] : chacun est consigné dans [DatabaseInitDiagnostics] (rapport de
 * crash, écran Mode dégradé), et une purge pour démarrage à froid dégrade [StorageHealth] — `key-lost` quand la clé ne
 * déverrouille plus la base, sinon `purged` — pour que l'interface dise que le cache local est reparti de zéro. Un report
 * de la migration faute de place (la base s'ouvre ENCORE EN CLAIR) dégrade aussi le stockage, en `encryption-deferred`.
 * Les événements ne portent que l'origine de la clé, l'état du fichier et le compte des reports, jamais la clé.
 */
public class EncryptionEventSink(
    private val diagnostics: DatabaseInitDiagnostics,
    private val health: StorageHealth,
) : (String) -> Unit {

    override fun invoke(event: String) {
        if (!event.startsWith(EncryptedDatabaseBootstrap.PURGE)) {
            diagnostics.record(DatabaseInitStage.ENCRYPTION_MIGRATED, event)
            if (event.startsWith(EncryptedDatabaseBootstrap.DEFERRED)) health.markDegraded(ENCRYPTION_DEFERRED)
            return
        }
        diagnostics.record(DatabaseInitStage.COLD_START_PURGE, event)
        health.markDegraded(if (event.endsWith(ENCRYPTED_STATE)) KEY_LOST else PURGED)
    }

    public companion object {
        public const val KEY_LOST: String = "key-lost"
        public const val PURGED: String = "purged"
        public const val ENCRYPTION_DEFERRED: String = "encryption-deferred"
        private const val ENCRYPTED_STATE = "state=ENCRYPTED"
    }
}
