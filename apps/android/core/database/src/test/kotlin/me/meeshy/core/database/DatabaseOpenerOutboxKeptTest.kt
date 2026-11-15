package me.meeshy.core.database

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import androidx.sqlite.db.SupportSQLiteDatabase
import androidx.sqlite.db.SupportSQLiteOpenHelper
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import java.io.File
import java.io.RandomAccessFile
import kotlinx.coroutines.runBlocking
import me.meeshy.core.database.entity.OutboxEntity
import me.meeshy.core.database.entity.PendingIdEntity
import me.meeshy.core.database.entity.PlaintextErasureEntity
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class DatabaseOpenerOutboxKeptTest {

    private val context: Context get() = ApplicationProvider.getApplicationContext()

    private fun realBuild(ctx: Context, location: DatabaseLocation): MeeshyDatabase =
        DatabaseModule.meeshyDatabaseBuilder(ctx, location).allowMainThreadQueries().build()

    /**
     * Une base peuplée par l'app (outbox, effacements E2EE, identifiants en attente), puis close : le journal WAL est
     * versé dans le fichier, qui porte seul tout le contenu.
     */
    private fun seeded(name: String): File {
        DatabaseModule.meeshyDatabaseBuilder(context, name).allowMainThreadQueries().build().apply {
            runBlocking {
                outboxDao().upsert(
                    OutboxEntity(
                        cmid = "c-1", lane = "message:conv", kind = "SEND", targetId = "t", payload = "{}",
                        dependsOn = null, attempts = 1, state = "PENDING", createdAt = 1L, updatedAt = 2L, ownerId = "u1",
                    ),
                )
                plaintextErasureDao().recordMessages(
                    listOf(PlaintextErasureEntity("u1", "message", "m1", "cid_1", "u1", recordedAt = 3L)),
                )
                pendingIdDao().upsert(PendingIdEntity("cid_1", "srv-1", "conv", reconciledAt = null))
            }
            openHelper.writableDatabase.query("PRAGMA wal_checkpoint(TRUNCATE)").use { it.moveToFirst() }
            close()
        }
        return context.getDatabasePath(name)
    }

    /**
     * Écrase l'en-tête de la page racine de `room_master_table` dans le FICHIER : le catalogue (`sqlite_master`) reste
     * lisible, donc la sonde passe, et c'est Room qui découvre la corruption en vérifiant l'identité du schéma à
     * l'ouverture. Les pages de l'outbox, des effacements et des identifiants en attente sont intactes.
     */
    private fun corruptRoomMasterTable(file: File) {
        val (pageSize, rootPage) = SQLiteDatabase.openDatabase(file.path, null, SQLiteDatabase.OPEN_READONLY).use { db ->
            val size = db.rawQuery("PRAGMA page_size", null).use { it.moveToFirst(); it.getLong(0) }
            val root = db.rawQuery("SELECT rootpage FROM sqlite_master WHERE name = 'room_master_table'", null)
                .use { it.moveToFirst(); it.getLong(0) }
            size to root
        }
        listOf("-wal", "-shm").forEach { File(file.path + it).delete() }
        RandomAccessFile(file, "rw").use { raw ->
            raw.seek((rootPage - 1) * pageSize)
            raw.write(ByteArray(pageSize.toInt()) { 0xFF.toByte() })
        }
    }

    private fun corrupted(name: String): File = seeded(name).also(::corruptRoomMasterTable)

    /** Écrase la page racine de l'outbox seule : Room s'ouvre normalement, et c'est la lecture de l'outbox qui échoue. */
    private fun corruptOutboxPage(file: File) {
        val (pageSize, rootPage) = SQLiteDatabase.openDatabase(file.path, null, SQLiteDatabase.OPEN_READONLY).use { db ->
            val size = db.rawQuery("PRAGMA page_size", null).use { it.moveToFirst(); it.getLong(0) }
            val root = db.rawQuery("SELECT rootpage FROM sqlite_master WHERE name = 'outbox'", null)
                .use { it.moveToFirst(); it.getLong(0) }
            size to root
        }
        listOf("-wal", "-shm").forEach { File(file.path + it).delete() }
        RandomAccessFile(file, "rw").use { raw ->
            raw.seek((rootPage - 1) * pageSize)
            raw.write(ByteArray(pageSize.toInt()) { 0xFF.toByte() })
        }
    }

    private fun opener(name: String, diagnostics: DatabaseInitDiagnostics) = DatabaseOpener(
        context = context,
        diagnostics = diagnostics,
        health = StorageHealth(),
        primaryName = name,
        clock = { 99L },
        secondaryFile = File(context.cacheDir, "kept-secondary-$name"),
        build = ::realBuild,
    )

    @Test
    fun `la corruption que Room decouvre a l'ouverture laisse le fichier au sauvetage puis a la quarantaine`() {
        val name = "room-discovers.db"
        val file = corrupted(name)
        assertThat(DatabaseRecovery.isReadable(file)).isTrue()
        val diagnostics = DatabaseInitDiagnostics()

        val database = opener(name, diagnostics).open()

        assertThat(File(file.path + ".corrupted.99").exists()).isTrue()
        assertThat(diagnostics.events.value.map { it.stage }).containsAtLeast(
            DatabaseInitStage.FIRST_FAILURE,
            DatabaseInitStage.QUARANTINED,
            DatabaseInitStage.RECREATED,
        ).inOrder()
        database.close()
    }

    @Test
    fun `un cache inutilisable est reconstruit et l'outbox reste lisible`() {
        val name = "outbox-kept.db"
        val file = corrupted(name)
        val diagnostics = DatabaseInitDiagnostics()

        val database = opener(name, diagnostics).open()

        assertThat(File(file.path + ".corrupted.99").exists()).isTrue()
        assertThat(diagnostics.events.value.map { it.stage }).contains(DatabaseInitStage.OUTBOX_SALVAGED)
        assertThat(database.openHelper.readableDatabase.query("SELECT cmid, ownerId FROM outbox").use {
            it.moveToFirst()
            it.getString(0) to it.getString(1)
        }).isEqualTo("c-1" to "u1")
        database.close()
    }

    @Test
    fun `la reprise garde les clairs E2EE que le coffre doit encore effacer`() = runBlocking {
        val name = "erasures-kept.db"
        corrupted(name)
        val diagnostics = DatabaseInitDiagnostics()

        val database = opener(name, diagnostics).open()

        assertThat(database.plaintextErasureDao().pending("u1", 10).map { it.itemId to it.clientMessageId })
            .containsExactly("m1" to "cid_1")
        assertThat(diagnostics.events.value.map { it.stage }).contains(DatabaseInitStage.ERASURES_SALVAGED)
        database.close()
    }

    @Test
    fun `la reprise garde les identifiants en attente, et l'echo d'un envoi recupere se reconcilie`() = runBlocking {
        val name = "pending-kept.db"
        corrupted(name)
        val diagnostics = DatabaseInitDiagnostics()

        val database = opener(name, diagnostics).open()

        assertThat(database.pendingIdDao().byServerId("srv-1")?.localId).isEqualTo("cid_1")
        assertThat(diagnostics.events.value.map { it.stage }).contains(DatabaseInitStage.PENDING_IDS_SALVAGED)
        database.close()
    }

    private val inertCallback = object : SupportSQLiteOpenHelper.Callback(1) {
        override fun onCreate(db: SupportSQLiteDatabase) = Unit
        override fun onUpgrade(db: SupportSQLiteDatabase, oldVersion: Int, newVersion: Int) = Unit
    }

    @Test
    fun `une corruption signalee en cours d'usage est reparee au lancement suivant`() {
        val name = "corrupt-in-use.db"
        val file = seeded(name)
        opener(name, DatabaseInitDiagnostics()).open().apply {
            KeepFileOnCorruption(inertCallback).onCorruption(openHelper.writableDatabase)
            close()
        }
        assertThat(DatabaseRecovery.isMarkedCorrupted(file)).isTrue()
        val diagnostics = DatabaseInitDiagnostics()

        val database = opener(name, diagnostics).open()

        assertThat(File(file.path + ".corrupted.99").exists()).isTrue()
        assertThat(diagnostics.events.value.map { it.stage }).containsAtLeast(
            DatabaseInitStage.FIRST_FAILURE,
            DatabaseInitStage.QUARANTINED,
            DatabaseInitStage.RECREATED,
            DatabaseInitStage.OUTBOX_SALVAGED,
        ).inOrder()
        assertThat(database.openHelper.readableDatabase.query("SELECT cmid FROM outbox").use {
            it.moveToFirst()
            it.getString(0)
        }).isEqualTo("c-1")
        assertThat(DatabaseRecovery.isMarkedCorrupted(file)).isFalse()
        database.close()

        val afterRepair = DatabaseInitDiagnostics()
        opener(name, afterRepair).open().close()
        assertThat(afterRepair.events.value).isEmpty()
    }

    @Test
    fun `une page abimee lue en cours d'usage par la fabrique de production pose le marqueur`() {
        val name = "page-in-use.db"
        val file = seeded(name).also(::corruptOutboxPage)
        val database = DatabaseModule.meeshyDatabaseBuilder(context, name).allowMainThreadQueries().build()

        runCatching { database.openHelper.writableDatabase.query("SELECT * FROM outbox").use { it.moveToFirst() } }
        database.close()

        assertThat(DatabaseRecovery.isMarkedCorrupted(file)).isTrue()
    }
}
