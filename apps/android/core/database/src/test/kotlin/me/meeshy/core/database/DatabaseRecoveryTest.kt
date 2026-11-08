package me.meeshy.core.database

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteDatabaseCorruptException
import android.database.sqlite.SQLiteDiskIOException
import android.database.sqlite.SQLiteException
import android.database.sqlite.SQLiteFullException
import android.database.sqlite.SQLiteOutOfMemoryException
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import java.io.File
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class DatabaseRecoveryTest {

    private fun file(name: String): File =
        ApplicationProvider.getApplicationContext<Context>().getDatabasePath(name).also { it.parentFile?.mkdirs() }

    private fun garbage(target: File) = target.writeBytes(ByteArray(8192) { (it * 31 + 7).toByte() })

    @Test
    fun `un fichier de garbage n'est pas lisible et reste en place pour la quarantaine`() {
        val target = file("garbage.db").also(::garbage)

        assertThat(DatabaseRecovery.isReadable(target)).isFalse()
        assertThat(target.exists()).isTrue()
    }

    @Test
    fun `un fichier absent est lisible puisqu'il sera cree`() {
        assertThat(DatabaseRecovery.isReadable(file("absent.db"))).isTrue()
    }

    @Test
    fun `la quarantaine deplace la base et ses fichiers compagnons sous un nom date`() {
        val target = file("q.db").also(::garbage)
        File(target.path + "-wal").writeText("wal")
        File(target.path + "-shm").writeText("shm")

        val moved = DatabaseRecovery.quarantine(target, atMillis = 1234L)

        assertThat(target.exists()).isFalse()
        assertThat(File(target.path + "-wal").exists()).isFalse()
        assertThat(moved.map { it.name }).containsExactly(
            "q.db.corrupted.1234",
            "q.db.corrupted.1234-wal",
            "q.db.corrupted.1234-shm",
        )
        assertThat(moved.all { it.exists() }).isTrue()
    }

    @Test
    fun `le sauvetage de l'outbox d'un fichier illisible rend une liste vide sans lever`() {
        assertThat(DatabaseRecovery.salvageOutbox(file("g2.db").also(::garbage))).isEmpty()
    }

    @Test
    fun `le sauvetage relit les envois d'une base lisible`() {
        val target = file("salvage.db")
        SQLiteDatabase.openOrCreateDatabase(target, null).use { db ->
            db.execSQL(
                "CREATE TABLE outbox (cmid TEXT PRIMARY KEY, lane TEXT, kind TEXT, targetId TEXT, payload TEXT, " +
                    "dependsOn TEXT, attempts INTEGER, state TEXT, createdAt INTEGER, updatedAt INTEGER)",
            )
            db.execSQL("INSERT INTO outbox VALUES ('c1','message:x','SEND','t','{}',NULL,2,'PENDING',10,11)")
        }

        val rows = DatabaseRecovery.salvageOutbox(target)

        assertThat(rows.map { it.cmid }).containsExactly("c1")
        assertThat(rows.single().attempts).isEqualTo(2)
        assertThat(rows.single().ownerId).isNull()
    }

    @Test
    fun `seule une corruption justifie la quarantaine`() {
        assertThat(DatabaseRecovery.classify(SQLiteDatabaseCorruptException("malformed")))
            .isEqualTo(OpenFailureKind.CORRUPTION)
        assertThat(DatabaseRecovery.classify(RuntimeException("wrapped", SQLiteDatabaseCorruptException("malformed"))))
            .isEqualTo(OpenFailureKind.CORRUPTION)
    }

    @Test
    fun `un disque qui refuse n'est pas une corruption`() {
        assertThat(DatabaseRecovery.classify(SQLiteFullException("full"))).isEqualTo(OpenFailureKind.UNAVAILABLE)
        assertThat(DatabaseRecovery.classify(SQLiteDiskIOException("io"))).isEqualTo(OpenFailureKind.UNAVAILABLE)
    }

    @Test
    fun `un echec de migration ou de schema est un bug de code, jamais un stockage abime`() {
        val missing = IllegalStateException("A migration from 15 to 16 was required but not found.")
        val mishandled = IllegalStateException("Migration didn't properly handle: messages")

        assertThat(DatabaseRecovery.classify(missing)).isEqualTo(OpenFailureKind.DEFECT)
        assertThat(DatabaseRecovery.classify(mishandled)).isEqualTo(OpenFailureKind.DEFECT)
        assertThat(DatabaseRecovery.classify(SQLiteException("no such column: x"))).isEqualTo(OpenFailureKind.DEFECT)
        assertThat(DatabaseRecovery.isStorageFailure(missing)).isFalse()
    }

    @Test
    fun `le sauvetage relit les clairs a effacer et les identifiants en attente`() {
        val target = file("rescue.db")
        SQLiteDatabase.openOrCreateDatabase(target, null).use { db ->
            db.execSQL(
                "CREATE TABLE e2ee_plaintext_erasures (account TEXT, kind TEXT, itemId TEXT, clientMessageId TEXT, " +
                    "senderId TEXT, recordedAt INTEGER, acknowledgedAt INTEGER)",
            )
            db.execSQL("INSERT INTO e2ee_plaintext_erasures VALUES ('a','message','m1','cid_1','a',5,NULL)")
            db.execSQL("CREATE TABLE pending_ids (localId TEXT, serverId TEXT, conversationId TEXT, reconciledAt INTEGER)")
            db.execSQL("INSERT INTO pending_ids VALUES ('cid_1','srv1','c1',NULL)")
        }

        val salvage = DatabaseRecovery.salvage(target)

        assertThat(salvage.outbox).isEmpty()
        assertThat(salvage.plaintextErasures.map { it.itemId }).containsExactly("m1")
        assertThat(salvage.pendingIds.map { it.localId to it.serverId }).containsExactly("cid_1" to "srv1")
    }

    @Test
    fun `la sonde ne declare illisible qu'un fichier corrompu`() {
        val target = file("probe.db").also { SQLiteDatabase.openOrCreateDatabase(it, null).close() }
        fun probeFailingWith(failure: Throwable) = DatabaseRecovery.isReadable(target) { throw failure }

        assertThat(probeFailingWith(SQLiteDatabaseCorruptException("database disk image is malformed"))).isFalse()
        assertThat(probeFailingWith(SQLiteException("file is not a database (code 26 SQLITE_NOTADB)"))).isFalse()
        assertThat(probeFailingWith(SQLiteException("malformed (code 779 SQLITE_CORRUPT_INDEX)"))).isFalse()
        assertThat(probeFailingWith(SQLiteOutOfMemoryException("out of memory"))).isTrue()
        assertThat(probeFailingWith(SQLiteFullException("database or disk is full"))).isTrue()
        assertThat(probeFailingWith(SQLiteDiskIOException("disk I/O error"))).isTrue()
        assertThat(probeFailingWith(SQLiteException("x"))).isTrue()
    }

    @Test
    fun `seules les quarantaines les plus recentes sont gardees, avec leurs fichiers compagnons`() {
        val target = file("bounded.db")
        listOf("1", "1-wal", "1-shm", "20", "20-wal", "300").forEach { File("${target.path}.corrupted.$it").writeText("old") }

        val removed = DatabaseRecovery.pruneQuarantines(target, keep = 2)

        assertThat(removed.map { it.name }).containsExactly(
            "bounded.db.corrupted.1",
            "bounded.db.corrupted.1-wal",
            "bounded.db.corrupted.1-shm",
        )
        assertThat(File("${target.path}.corrupted.20-wal").exists()).isTrue()
        assertThat(File("${target.path}.corrupted.300").exists()).isTrue()
    }
}
