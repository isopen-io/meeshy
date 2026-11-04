package me.meeshy.core.database.crypto

import androidx.sqlite.db.SupportSQLiteOpenHelper
import java.io.File
import me.meeshy.core.database.DatabaseRecovery
import me.meeshy.core.database.KeepCorruptFileOpenHelperFactory
import me.meeshy.core.database.OpenFailureKind
import me.meeshy.core.database.search.SearchIndexSchema
import net.zetetic.database.sqlcipher.SQLiteDatabase
import net.zetetic.database.sqlcipher.SupportOpenHelperFactory

/** Tout ce qui touche la bibliothèque SQLCipher native : un seul fichier, pour que le reste reste testable sans natif. */
internal object SqlCipherRuntime {
    private val loaded: Unit by lazy { System.loadLibrary("sqlcipher") }

    fun ensureLoaded() = loaded

    /** La fabrique de production : SQLCipher, derrière le garde-fou qui ne supprime jamais un fichier abîmé. */
    fun openHelperFactory(bootstrap: EncryptedDatabaseBootstrap): SupportSQLiteOpenHelper.Factory =
        LazyPassphraseOpenHelperFactory(
            passphrase = {
                ensureLoaded()
                bootstrap.passphrase()
            },
            delegateFor = { phrase -> KeepCorruptFileOpenHelperFactory(SupportOpenHelperFactory(phrase)) },
        )

    /**
     * Le fichier chiffré s'ouvre avec la clé et son catalogue se lit. Seule une vraie corruption (dont « file is not a
     * database » : clé qui ne convient plus) rend `false` ; un échec passager ne prouve rien contre le fichier.
     */
    fun isReadable(file: File, bootstrap: EncryptedDatabaseBootstrap): Boolean {
        if (!file.exists()) return true
        val phrase = String(bootstrap.passphrase(), Charsets.US_ASCII)
        return try {
            ensureLoaded()
            val db = open(file, phrase, SQLiteDatabase.OPEN_READONLY)
            try {
                db.compileStatement("SELECT count(*) FROM sqlite_master").simpleQueryForLong()
            } finally {
                db.close()
            }
            true
        } catch (failure: Exception) {
            DatabaseRecovery.classify(failure) != OpenFailureKind.CORRUPTION
        }
    }

    private fun open(file: File, phrase: String, flags: Int): SQLiteDatabase =
        SQLiteDatabase.openDatabase(file.path, phrase, null, flags, null, null)

    /** `sqlcipher_export` : copie intégrale, schéma et `user_version` compris, vers un fichier chiffré neuf. */
    object Engine : PlaintextExportEngine {
        override fun export(plain: File, target: File, passphrase: ByteArray) {
            ensureLoaded()
            val phrase = String(passphrase, Charsets.US_ASCII)
            val db = open(plain, "", SQLiteDatabase.OPEN_READWRITE)
            try {
                SearchIndexSchema.dropStatements.forEach(db::rawExecSQL)
                val version = db.compileStatement("PRAGMA user_version").simpleQueryForLong()
                db.rawExecSQL("ATTACH DATABASE '${target.path.replace("'", "''")}' AS encrypted KEY '$phrase'")
                db.rawExecSQL("SELECT sqlcipher_export('encrypted')")
                db.rawExecSQL("PRAGMA encrypted.user_version = $version")
                db.rawExecSQL("DETACH DATABASE encrypted")
            } finally {
                db.close()
            }
        }

        override fun verify(source: File?, encrypted: File, passphrase: ByteArray): Boolean {
            ensureLoaded()
            val phrase = String(passphrase, Charsets.US_ASCII)
            val copy = open(encrypted, phrase, SQLiteDatabase.OPEN_READONLY)
            try {
                val plain = source?.let { open(it, "", SQLiteDatabase.OPEN_READONLY) }
                try {
                    val sameVersion = plain == null ||
                        copy.compileStatement("PRAGMA user_version").simpleQueryForLong() ==
                        plain.compileStatement("PRAGMA user_version").simpleQueryForLong()
                    if (!sameVersion) return false
                    return plain == null || DURABLE.all { table -> rows(plain, table) == rows(copy, table) }
                } finally {
                    plain?.close()
                }
            } finally {
                copy.close()
            }
        }

        private fun rows(db: SQLiteDatabase, table: String): Long? = try {
            db.compileStatement("SELECT count(*) FROM `$table`").simpleQueryForLong()
        } catch (_: Exception) {
            null
        }

        private val DURABLE = listOf("outbox", "media_blob", "tus_upload_checkpoint", "sync_meta", "e2ee_plaintext_erasures", "messages", "conversations")
    }
}
