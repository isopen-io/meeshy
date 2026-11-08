package me.meeshy.sdk.e2ee.libsignal

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import java.io.File
import me.meeshy.core.e2ee.vault.RecordBackend
import me.meeshy.core.e2ee.vault.RecordId
import me.meeshy.core.e2ee.vault.RecordKind

/**
 * Le stockage durable du coffre E2EE (#14591) : une base SQLite DÉDIÉE (`noBackupFilesDir/e2ee/vault.db`), jamais la
 * base Room des messages, qui n'est pas chiffrée. Elle ne reçoit que des valeurs déjà scellées par
 * `SealedRecordBackend` ; un lot s'applique dans UNE transaction SQLite, et `secure_delete` met à zéro les octets d'une
 * ligne effacée.
 */
internal class SqliteRecordBackend(context: Context, file: File) : RecordBackend {

    private val helper = object : SQLiteOpenHelper(context, file.absolutePath, null, SCHEMA_VERSION) {
        override fun onConfigure(db: SQLiteDatabase) {
            db.execSQL("PRAGMA secure_delete = ON")
        }

        override fun onCreate(db: SQLiteDatabase) {
            db.execSQL("CREATE TABLE records (kind TEXT NOT NULL, key TEXT NOT NULL, value BLOB NOT NULL, PRIMARY KEY (kind, key))")
        }

        override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) = Unit
    }

    override fun load(kind: RecordKind, key: String): ByteArray? =
        helper.readableDatabase.query("records", arrayOf("value"), "kind = ? AND key = ?", arrayOf(kind.tag, key), null, null, null)
            .use { cursor -> if (cursor.moveToFirst()) cursor.getBlob(0) else null }

    override fun keys(kind: RecordKind): List<String> =
        helper.readableDatabase.query("records", arrayOf("key"), "kind = ?", arrayOf(kind.tag), null, null, null)
            .use { cursor -> buildList { while (cursor.moveToNext()) add(cursor.getString(0)) } }

    override fun commit(changes: Map<RecordId, ByteArray?>, clearFirst: Boolean) {
        val db = helper.writableDatabase
        db.beginTransaction()
        try {
            if (clearFirst) db.delete("records", null, null)
            changes.forEach { (id, value) ->
                if (value == null) {
                    db.delete("records", "kind = ? AND key = ?", arrayOf(id.kind.tag, id.key))
                } else {
                    val row = ContentValues().apply {
                        put("kind", id.kind.tag)
                        put("key", id.key)
                        put("value", value)
                    }
                    db.insertWithOnConflict("records", null, row, SQLiteDatabase.CONFLICT_REPLACE)
                }
            }
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }
    }

    private companion object {
        const val SCHEMA_VERSION = 1
    }
}
