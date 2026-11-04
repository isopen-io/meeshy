package me.meeshy.core.database.crypto

import android.database.Cursor
import androidx.sqlite.db.SupportSQLiteOpenHelper
import java.io.File
import me.meeshy.core.database.DatabaseRecovery
import me.meeshy.core.database.KeepCorruptFileOpenHelperFactory
import me.meeshy.core.database.OpenFailureKind
import me.meeshy.core.database.SalvageConnection
import me.meeshy.core.database.SalvageOpener
import me.meeshy.core.database.search.SearchIndexSchema
import net.zetetic.database.DatabaseErrorHandler
import net.zetetic.database.sqlcipher.SQLiteDatabase
import net.zetetic.database.sqlcipher.SQLiteOpenHelper

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
            delegateFor = { phrase -> KeepCorruptFileOpenHelperFactory(CorruptionReportingFactory(phrase)) },
        )

    /**
     * Le `SupportHelper` de SQLCipher (4.6.1 compris) ne transmet pas `onCorruption` au callback de Room : il remet `null`
     * comme gestionnaire d'erreurs à son `SQLiteOpenHelper`. Le marqueur de corruption ([KeepCorruptFileOpenHelperFactory])
     * ne se posait donc plus. Cette fabrique est le même helper, avec un gestionnaire qui relaie la corruption au callback ;
     * le gestionnaire par défaut de SQLCipher n'aurait de toute façon rien supprimé (`hasCodec`), il n'y a rien à garder.
     */
    private class CorruptionReportingFactory(private val password: ByteArray) : SupportSQLiteOpenHelper.Factory {
        override fun create(configuration: SupportSQLiteOpenHelper.Configuration): SupportSQLiteOpenHelper {
            val callback = configuration.callback
            return object : SQLiteOpenHelper(
                configuration.context,
                configuration.name,
                password,
                null,
                callback.version,
                0,
                DatabaseErrorHandler { db -> callback.onCorruption(db) },
                null,
                false,
            ) {
                override fun onConfigure(db: SQLiteDatabase) = callback.onConfigure(db)
                override fun onCreate(db: SQLiteDatabase) = callback.onCreate(db)
                override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) =
                    callback.onUpgrade(db, oldVersion, newVersion)
                override fun onDowngrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) =
                    callback.onDowngrade(db, oldVersion, newVersion)
                override fun onOpen(db: SQLiteDatabase) = callback.onOpen(db)
            }
        }
    }

    /**
     * L'ouvreur du sauvetage pour la base principale : SQLCipher avec la clé de [bootstrap] (sans rejouer la migration),
     * le framework si le fichier est encore en clair. Lecture seule, gestionnaire d'erreurs inerte : le fichier reste en
     * place pour la quarantaine.
     */
    fun salvageOpener(bootstrap: EncryptedDatabaseBootstrap): SalvageOpener = DatabaseRecovery.byFileState { file ->
        ensureLoaded()
        val key = bootstrap.salvageKey() ?: throw DatabaseKeyUnavailableException("no key to salvage the encrypted database")
        val db = SQLiteDatabase.openDatabase(
            file.path,
            key.passphrase(),
            null,
            SQLiteDatabase.OPEN_READONLY,
            DatabaseErrorHandler { },
            null,
        )
        object : SalvageConnection {
            override fun query(sql: String): Cursor = db.query(sql)
            override fun close() = db.close()
        }
    }

    /**
     * Le fichier chiffré s'ouvre avec la clé et son catalogue se lit. Seule une vraie corruption (dont « file is not a
     * database » : clé qui ne convient plus) rend `false` ; un échec passager ne prouve rien contre le fichier.
     */
    fun isReadable(file: File, bootstrap: EncryptedDatabaseBootstrap): Boolean {
        if (!file.exists()) return true
        return try {
            ensureLoaded()
            val phrase = String(bootstrap.passphrase(), Charsets.US_ASCII)
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
                db.rawExecSQL("ATTACH DATABASE ? AS encrypted KEY ?", target.path, phrase)
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
