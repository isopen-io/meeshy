package me.meeshy.core.database

import androidx.room.RoomDatabase
import androidx.sqlite.db.SupportSQLiteDatabase
import java.util.concurrent.Executor
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicInteger

/**
 * Réglages posés sur CHAQUE connexion (iOS `AppDatabase` : WAL, synchronous NORMAL, mmap, temp en mémoire, cache) et
 * exécuteur de requêtes dédié, pour que la base ne rivalise ni avec le pool par défaut de Room ni avec l'IO de l'app.
 */
public object DatabasePragmas {
    public const val MMAP_SIZE_BYTES: Long = 64L * 1024 * 1024

    /** Valeur négative = kibioctets (SQLite) : 8 Mio de cache de pages par connexion. */
    public const val CACHE_SIZE_KIB: Int = -8_192

    public val statements: List<String> = listOf(
        "PRAGMA synchronous=NORMAL",
        "PRAGMA mmap_size=$MMAP_SIZE_BYTES",
        "PRAGMA temp_store=MEMORY",
        "PRAGMA cache_size=$CACHE_SIZE_KIB",
    )

    public val callback: RoomDatabase.Callback = object : RoomDatabase.Callback() {
        override fun onOpen(db: SupportSQLiteDatabase) {
            apply(db)
        }
    }

    /** Un PRAGMA qui rend une ligne se lit par `query` : `execSQL` lèverait une exception sur certains d'entre eux. */
    public fun apply(db: SupportSQLiteDatabase) {
        statements.forEach { sql ->
            try {
                db.query(sql).use { it.moveToFirst() }
            } catch (_: Exception) {
                // Un réglage de performance refusé (mémoire partagée, VFS) ne doit jamais empêcher d'ouvrir la base.
            }
        }
    }

    /** Un seul exécuteur pour toute la vie du process : les bases ouvertes en repli ou en test le partagent. */
    public val sharedQueryExecutor: Executor by lazy { newQueryExecutor() }

    public fun newQueryExecutor(threads: Int = QUERY_THREADS): Executor {
        val counter = AtomicInteger()
        return Executors.newFixedThreadPool(threads) { runnable ->
            Thread(runnable, "meeshy-db-query-${counter.incrementAndGet()}").apply { isDaemon = true }
        }
    }

    private const val QUERY_THREADS = 4
}
