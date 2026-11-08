package me.meeshy.core.database

import java.io.File

/**
 * Les copies que la reprise laisse sur le disque (`meeshy.db.corrupted.*`, `meeshy-fallback.db`, et les marqueurs
 * `.corruption-detected`), non chiffrées : elles
 * partent avec la session (déconnexion, compte supprimé, fin de session invitée), sauf la base que l'app a ouverte en ce
 * moment ([markInUse]), qu'on ne retire pas sous SQLite et que la purge de session vide par ailleurs.
 *
 * Quand ce lancement tourne EN MÉMOIRE, la purge de session ne vide que la mémoire : la base sur disque, intacte, porte
 * encore l'historique du compte qui part. [purge] inscrit alors la purge qu'elle doit subir avant sa prochaine
 * ouverture ([PendingDiskPurge]).
 */
public class DatabaseLeftovers(
    private val primary: File,
    private val secondary: File,
) {
    @Volatile private var inUse: File? = null

    @Volatile private var inMemory: Boolean = false

    /** La base ouverte par ce processus ; `null` pour une base en mémoire. */
    public fun markInUse(database: File?) {
        inUse = database
        inMemory = database == null
    }

    /** Supprime les copies de reprise ; rend les fichiers effectivement retirés. */
    public fun purge(): List<File> {
        if (inMemory) PendingDiskPurge.schedule(primary)
        return DatabaseRecovery.deleteLeftovers(primary, secondary, inUse)
    }
}
