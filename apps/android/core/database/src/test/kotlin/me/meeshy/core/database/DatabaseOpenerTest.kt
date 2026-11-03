package me.meeshy.core.database

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteException
import android.database.sqlite.SQLiteDiskIOException
import android.database.sqlite.SQLiteFullException
import android.database.sqlite.SQLiteOutOfMemoryException
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import java.io.File
import org.junit.Assert.assertThrows
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class DatabaseOpenerTest {

    private val context: Context get() = ApplicationProvider.getApplicationContext()

    private fun realBuild(ctx: Context, location: DatabaseLocation): MeeshyDatabase =
        DatabaseModule.meeshyDatabaseBuilder(ctx, location).allowMainThreadQueries().build()

    private fun opener(
        name: String,
        diagnostics: DatabaseInitDiagnostics,
        health: StorageHealth,
        build: (Context, DatabaseLocation) -> MeeshyDatabase = ::realBuild,
        leftovers: DatabaseLeftovers? = null,
        readable: (File) -> Boolean = DatabaseRecovery::isReadable,
    ) = DatabaseOpener(
        context = context,
        diagnostics = diagnostics,
        health = health,
        primaryName = name,
        clock = { 42L },
        secondaryFile = secondary(name),
        leftovers = leftovers,
        readable = readable,
        build = build,
    )

    private fun secondary(name: String) = File(context.cacheDir, "secondary-$name")

    private fun existing(name: String): File {
        realBuild(context, DatabaseLocation.Named(name)).apply {
            openHelper.writableDatabase
            close()
        }
        return context.getDatabasePath(name)
    }

    private fun corruptedCopies(file: File): List<String> =
        file.parentFile?.listFiles().orEmpty().map { it.name }.filter { it.startsWith("${file.name}.corrupted.") }

    private fun failingPrimary(name: String, failure: () -> Throwable) = { ctx: Context, location: DatabaseLocation ->
        if (location == DatabaseLocation.Named(name)) throw failure()
        realBuild(ctx, location)
    }

    @Test
    fun `un fichier illisible est mis en quarantaine puis la base est recreee`() {
        val file = context.getDatabasePath("unreadable.db").also { it.parentFile?.mkdirs() }
        file.writeBytes(ByteArray(8192) { (it * 13 + 5).toByte() })
        val diagnostics = DatabaseInitDiagnostics()
        val health = StorageHealth()

        val database = opener("unreadable.db", diagnostics, health).open()

        assertThat(File(file.path + ".corrupted.42").exists()).isTrue()
        assertThat(database.openHelper.writableDatabase.isOpen).isTrue()
        assertThat(diagnostics.events.value.map { it.stage }).containsAtLeast(
            DatabaseInitStage.FIRST_FAILURE,
            DatabaseInitStage.QUARANTINED,
            DatabaseInitStage.RECREATED,
        ).inOrder()
        assertThat(health.current.value).isInstanceOf(StorageState.Degraded::class.java)
        database.close()
    }

    @Test
    fun `une nouvelle quarantaine ne garde que les plus recentes`() {
        val file = context.getDatabasePath("repeated.db").also { it.parentFile?.mkdirs() }
        listOf("1", "2", "3").forEach { File("${file.path}.corrupted.$it").writeText("old") }
        file.writeBytes(ByteArray(8192) { (it * 13 + 5).toByte() })

        opener("repeated.db", DatabaseInitDiagnostics(), StorageHealth()).open().close()

        assertThat(corruptedCopies(file).filterNot { it.contains("-") }).containsExactly(
            "repeated.db.corrupted.42",
            "repeated.db.corrupted.3",
        )
    }

    @Test
    fun `une installation neuve ouvre normalement sans diagnostic`() {
        val diagnostics = DatabaseInitDiagnostics()
        val health = StorageHealth()

        opener("fresh.db", diagnostics, health).open().close()

        assertThat(diagnostics.events.value).isEmpty()
        assertThat(health.current.value).isEqualTo(StorageState.Normal)
    }

    @Test
    fun `quand le chemin principal echoue toujours la base se replie sur le chemin secondaire`() {
        val diagnostics = DatabaseInitDiagnostics()
        val health = StorageHealth()
        val build = { ctx: Context, location: DatabaseLocation ->
            if (location is DatabaseLocation.Named && !location.name.contains("secondary")) {
                throw SQLiteFullException("disk full")
            }
            realBuild(ctx, location)
        }

        val database = opener("primary-down.db", diagnostics, health, build).open()

        assertThat(diagnostics.events.value.map { it.stage }).contains(DatabaseInitStage.FELL_BACK_SECONDARY)
        assertThat(health.current.value).isInstanceOf(StorageState.Degraded::class.java)
        assertThat(health.isEphemeral).isFalse()
        database.close()
    }

    @Test
    fun `quand aucun fichier n'est ouvrable la base est en memoire avec le drapeau ephemere`() {
        val diagnostics = DatabaseInitDiagnostics()
        val health = StorageHealth()
        val build = { ctx: Context, location: DatabaseLocation ->
            if (location is DatabaseLocation.Named) throw SQLiteFullException("SQLITE_FULL")
            realBuild(ctx, location)
        }

        val database = opener("all-down.db", diagnostics, health, build).open()

        assertThat(health.isEphemeral).isTrue()
        assertThat(diagnostics.events.value.map { it.stage }).contains(DatabaseInitStage.FELL_BACK_MEMORY)
        assertThat(database.openHelper.writableDatabase.isOpen).isTrue()
        database.close()
    }

    @Test
    fun `le rapport de crash porte les jalons et le premier echec`() {
        val diagnostics = DatabaseInitDiagnostics()
        diagnostics.record(DatabaseInitStage.FIRST_FAILURE, SQLiteException("boom"))
        diagnostics.record(DatabaseInitStage.QUARANTINED, "meeshy.db")

        val attributes = diagnostics.crashReportAttributes()

        assertThat(attributes["db.init.stages"]).isEqualTo("FIRST_FAILURE,QUARANTINED")
        assertThat(attributes["db.init.first_failure"]).contains("boom")
        assertThat(DatabaseInitDiagnostics().crashReportAttributes()).isEmpty()
    }

    @Test
    fun `une migration absente remonte sans deplacer ni vider la base`() {
        val file = existing("migration-missing.db")
        val diagnostics = DatabaseInitDiagnostics()
        val build = failingPrimary("migration-missing.db") {
            IllegalStateException("A migration from 15 to 16 was required but not found.")
        }

        assertThrows(IllegalStateException::class.java) { opener("migration-missing.db", diagnostics, StorageHealth(), build).open() }

        assertThat(file.exists()).isTrue()
        assertThat(corruptedCopies(file)).isEmpty()
        assertThat(diagnostics.events.value.map { it.stage }).doesNotContain(DatabaseInitStage.QUARANTINED)
    }

    @Test
    fun `une migration dont le SQL echoue remonte sans deplacer la base`() {
        val file = existing("migration-sql.db")
        val build = failingPrimary("migration-sql.db") { SQLiteException("no such column: legacyField") }

        assertThrows(SQLiteException::class.java) {
            opener("migration-sql.db", DatabaseInitDiagnostics(), StorageHealth(), build).open()
        }

        assertThat(file.exists()).isTrue()
        assertThat(corruptedCopies(file)).isEmpty()
    }

    @Test
    fun `un schema incoherent remonte au lieu d'etre pris pour une corruption`() {
        val file = existing("tampered.db")
        SQLiteDatabase.openDatabase(file.path, null, SQLiteDatabase.OPEN_READWRITE).use {
            it.execSQL("UPDATE room_master_table SET identity_hash = 'tampered'")
        }

        assertThrows(IllegalStateException::class.java) {
            opener("tampered.db", DatabaseInitDiagnostics(), StorageHealth()).open()
        }

        assertThat(file.exists()).isTrue()
        assertThat(corruptedCopies(file)).isEmpty()
    }

    @Test
    fun `un disque plein laisse la base principale en place et se replie`() {
        val file = existing("full.db")
        val health = StorageHealth()
        val build = failingPrimary("full.db") { SQLiteFullException("database or disk is full") }

        opener("full.db", DatabaseInitDiagnostics(), health, build).open().close()

        assertThat(file.exists()).isTrue()
        assertThat(corruptedCopies(file)).isEmpty()
        assertThat(health.current.value).isEqualTo(StorageState.Degraded("secondary"))
    }

    @Test
    fun `une ouverture nominale reprend les envois de la base de repli puis la supprime`() = kotlinx.coroutines.runBlocking {
        val name = "adopts-fallback.db"
        realBuild(context, DatabaseLocation.Named(secondary(name).absolutePath)).apply {
            outboxDao().upsert(
                me.meeshy.core.database.entity.OutboxEntity(
                    cmid = "c-9", lane = "message:conv", kind = "SEND", targetId = "t", payload = "{}", dependsOn = null,
                    attempts = 0, state = "PENDING", createdAt = 1L, updatedAt = 1L, ownerId = "u1",
                ),
            )
            close()
        }

        val database = opener(name, DatabaseInitDiagnostics(), StorageHealth()).open()

        assertThat(database.outboxDao().pendingCount()).isEqualTo(1)
        assertThat(secondary(name).exists()).isFalse()
        database.close()
    }

    @Test
    fun `une reprise de la base de repli qui perd une ligne garde la base de repli pour le lancement suivant`() =
        kotlinx.coroutines.runBlocking {
            val name = "adopt-loses.db"
            realBuild(context, DatabaseLocation.Named(secondary(name).absolutePath)).apply {
                outboxDao().upsert(
                    me.meeshy.core.database.entity.OutboxEntity(
                        cmid = "c-9", lane = "message:conv", kind = "SEND", targetId = "t", payload = "{}", dependsOn = null,
                        attempts = 0, state = "PENDING", createdAt = 1L, updatedAt = 1L, ownerId = "u1",
                    ),
                )
                close()
            }
            val primary = existing(name)
            SQLiteDatabase.openDatabase(primary.path, null, SQLiteDatabase.OPEN_READWRITE).use {
                it.execSQL("CREATE TRIGGER refuse_outbox BEFORE INSERT ON outbox BEGIN SELECT RAISE(ABORT, 'disk full'); END")
            }

            val database = opener(name, DatabaseInitDiagnostics(), StorageHealth()).open()

            assertThat(database.outboxDao().pendingCount()).isEqualTo(0)
            assertThat(secondary(name).exists()).isTrue()
            database.close()
        }

    @Test
    fun `les copies de reprise sont purgees, sauf la base ouverte`() {
        val name = "leftovers.db"
        val primary = context.getDatabasePath(name).also { it.parentFile?.mkdirs() }
        File(primary.path + ".corrupted.1").writeText("old")
        File(primary.path + ".corrupted.1-wal").writeText("old")
        val secondary = secondary(name).also { it.parentFile?.mkdirs() }
        secondary.writeText("fallback")
        val leftovers = DatabaseLeftovers(primary, secondary)

        leftovers.markInUse(secondary)
        leftovers.purge()

        assertThat(corruptedCopies(primary)).isEmpty()
        assertThat(secondary.exists()).isTrue()

        leftovers.markInUse(primary)
        leftovers.purge()

        assertThat(secondary.exists()).isFalse()
    }

    @Test
    fun `la purge de session retire le marqueur de corruption, sauf celui de la base ouverte`() {
        val name = "marker-leftovers.db"
        val primary = context.getDatabasePath(name).also { it.parentFile?.mkdirs() }
        val secondary = secondary(name).also { it.parentFile?.mkdirs() }
        val primaryMarker = File(primary.path + DatabaseRecovery.CORRUPTION_MARKER_SUFFIX).apply { writeText("") }
        val secondaryMarker = File(secondary.path + DatabaseRecovery.CORRUPTION_MARKER_SUFFIX).apply { writeText("") }
        val leftovers = DatabaseLeftovers(primary, secondary)

        leftovers.markInUse(primary)
        leftovers.purge()

        assertThat(primaryMarker.exists()).isTrue()
        assertThat(secondaryMarker.exists()).isFalse()

        leftovers.markInUse(null)
        leftovers.purge()

        assertThat(primaryMarker.exists()).isFalse()
    }

    @Test
    fun `une sonde qui manque de memoire, de disque ou d'E-S ne met jamais la base en quarantaine`() {
        listOf<() -> Throwable>(
            { SQLiteOutOfMemoryException("out of memory") },
            { SQLiteFullException("database or disk is full") },
            { SQLiteDiskIOException("disk I/O error") },
            { SQLiteException("unknown error (code 1 SQLITE_ERROR)") },
        ).forEachIndexed { index, failure ->
            val name = "probe-transient-$index.db"
            val file = existing(name)
            val probe = { candidate: File -> DatabaseRecovery.isReadable(candidate) { throw failure() } }

            opener(name, DatabaseInitDiagnostics(), StorageHealth(), readable = probe).open().close()

            assertThat(file.exists()).isTrue()
            assertThat(corruptedCopies(file)).isEmpty()
        }
    }
}
