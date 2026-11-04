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

    /**
     * Les connexions de maintenance (lecture, export, vérification) : gestionnaire d'erreurs INERTE, pour qu'une corruption
     * rencontrée ici lève sans que le gestionnaire par défaut ne supprime le fichier — la base en clair abîmée doit rester
     * en place pour être sauvée puis mise en quarantaine par [DatabaseRecovery].
     */
    private fun open(file: File, phrase: String, flags: Int): SQLiteDatabase =
        SQLiteDatabase.openDatabase(file.path, phrase, null, flags, DatabaseErrorHandler { }, null)

    /**
     * `sqlcipher_export` : copie intégrale, schéma et `user_version` compris, vers un fichier chiffré neuf. La base en clair
     * s'ouvre en écriture ET en création : une base attachée hérite des drapeaux de la connexion, et sans
     * `CREATE_IF_NECESSARY` l'`ATTACH` ne peut pas créer la copie (`unable to open database`, run 41818032184). Rien n'est
     * écrit dans la base en clair, qui existe déjà : elle reste la source de la vérification et de la reprise.
     * Chaque instruction passe par [SQLiteDatabase.execSQL] ou une requête compilée, qui LÈVENT sur échec : `rawExecSQL`
     * avale l'erreur d'exécution, et un `ATTACH` ou un export avorté passait pour réussi, ce qui privait une base en clair
     * corrompue de sa recréation chiffrée. L'index des messages est retiré de la COPIE, sur une connexion neuve qui en relit
     * le schéma : la copie renumérote les `rowid` de `messages`, sur lesquels il est indexé, et [SearchIndexSchema.ensure]
     * le reconstruit à l'ouverture. L'index des conversations, autonome, est gardé.
     */
    object Engine : PlaintextExportEngine {
        override fun export(plain: File, target: File, passphrase: ByteArray) {
            ensureLoaded()
            val phrase = String(passphrase, Charsets.US_ASCII)
            val db = open(plain, "", PLAINTEXT_EXPORT_FLAGS)
            try {
                val version = db.compileStatement("PRAGMA user_version").use { it.simpleQueryForLong() }
                db.execSQL("ATTACH DATABASE ? AS encrypted KEY ?", arrayOf<Any?>(target.path, phrase))
                db.compileStatement("SELECT sqlcipher_export('encrypted')").use { it.simpleQueryForString() }
                db.execSQL("PRAGMA encrypted.user_version = $version")
                db.execSQL("DETACH DATABASE encrypted")
            } finally {
                db.close()
            }
            val copy = open(target, phrase, SQLiteDatabase.OPEN_READWRITE)
            try {
                SearchIndexSchema.messageIndexDropStatements.forEach(copy::execSQL)
            } finally {
                copy.close()
            }
        }

        /** Les drapeaux de la connexion en clair, hérités par la copie attachée : il faut pouvoir CRÉER celle-ci. */
        internal const val PLAINTEXT_EXPORT_FLAGS: Int = SQLiteDatabase.OPEN_READWRITE or SQLiteDatabase.CREATE_IF_NECESSARY

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
