package me.meeshy.core.database

import java.io.File

/**
 * Les copies que la reprise laisse sur le disque (`meeshy.db.corrupted.*`, `meeshy-fallback.db`, et les marqueurs
 * `.corruption-detected`), non chiffrées : elles
 * partent avec la session (déconnexion, compte supprimé, fin de session invitée), sauf la base que l'app a ouverte en ce
 * moment ([markInUse]), qu'on ne retire pas sous SQLite et que la purge de session vide par ailleurs.
 */
public class DatabaseLeftovers(
    private val primary: File,
    private val secondary: File,
) {
    @Volatile private var inUse: File? = null

    /** La base ouverte par ce processus ; `null` pour une base en mémoire. */
    public fun markInUse(database: File?) {
        inUse = database
    }

    /** Supprime les copies de reprise ; rend les fichiers effectivement retirés. */
    public fun purge(): List<File> = DatabaseRecovery.deleteLeftovers(primary, secondary, inUse)
}
