package me.meeshy.core.database

import android.content.Context
import android.database.sqlite.SQLiteFullException
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import java.io.File
import kotlinx.coroutines.runBlocking
import me.meeshy.core.database.crypto.DatabaseKeyProvider
import me.meeshy.core.database.crypto.EncryptedDatabaseBootstrap
import me.meeshy.core.database.crypto.PlaintextDatabaseMigrator
import me.meeshy.core.database.crypto.PlaintextExportEngine
import me.meeshy.core.database.entity.OutboxEntity
import me.meeshy.sdk.model.security.InMemorySecureStore
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * Contre-audit de #15880 : un lancement EN MÉMOIRE reçoit une copie de l'outbox du disque, que le fichier garde. Ce que
 * l'auteur y annule ou retire ne repart pas depuis le disque au lancement suivant ; ce qui reste en attente y reste.
 * Une migration différée trop souvent ouvre en mémoire avec l'outbox recopiée, et une base recréée pendant un report
 * quitte le mode en clair.
 */
@RunWith(RobolectricTestRunner::class)
class MemoryLaunchSettlementTest {

    private val context: Context get() = ApplicationProvider.getApplicationContext()

    private fun realBuild(ctx: Context, location: DatabaseLocation): MeeshyDatabase =
        DatabaseModule.meeshyDatabaseBuilder(ctx, location).allowMainThreadQueries().build()

    private fun row(cmid: String) = OutboxEntity(
        cmid = cmid, lane = "message:conv", kind = "SEND", targetId = "t", payload = "{}",
        dependsOn = null, attempts = 0, state = "PENDING", createdAt = 1L, updatedAt = 2L, ownerId = "u1",
    )

    private fun seeded(name: String, cmids: List<String>): File {
        realBuild(context, DatabaseLocation.Named(name)).apply {
            runBlocking { cmids.forEach { outboxDao().upsert(row(it)) } }
            openHelper.writableDatabase.query("PRAGMA wal_checkpoint(TRUNCATE)").use { it.moveToFirst() }
            close()
        }
        return context.getDatabasePath(name)
    }

    private object DiskFull : PlaintextExportEngine {
        override fun export(plain: File, target: File, passphrase: ByteArray) =
            throw SQLiteFullException("database or disk is full (code 13 SQLITE_FULL)")

        override fun verify(source: File?, encrypted: File, passphrase: ByteArray) = true
    }

    private object NoExport : PlaintextExportEngine {
        override fun export(plain: File, target: File, passphrase: ByteArray) = error("no export expected")
        override fun verify(source: File?, encrypted: File, passphrase: ByteArray) = true
    }

    private fun opener(
        name: String,
        health: StorageHealth,
        prepare: () -> Unit,
        built: MutableList<DatabaseLocation> = mutableListOf(),
    ) = DatabaseOpener(
        context = context,
        diagnostics = DatabaseInitDiagnostics(),
        health = health,
        primaryName = name,
        clock = { 42L },
        secondaryFile = File(context.cacheDir, "secondary-$name"),
        prepare = prepare,
        allowsSecondary = false,
        build = { ctx, location ->
            built += location
            realBuild(ctx, location)
        },
    )

    private fun memoryLaunch(name: String, file: File): MeeshyDatabase {
        val encryption = EncryptedDatabaseBootstrap(file, DatabaseKeyProvider(InMemorySecureStore()), PlaintextDatabaseMigrator(DiskFull))
        val health = StorageHealth()
        val database = opener(name, health, prepare = { encryption.prepare() }).open()
        assertThat(health.isEphemeral).isTrue()
        return database
    }

    private fun settledFile(file: File) = File(file.path + DiskOutboxSettlement.SUFFIX)

    private fun awaitSettled(file: File, cmid: String) {
        val deadline = System.currentTimeMillis() + 10_000
        while (cmid !in DiskOutboxSettlement(file).settled() && System.currentTimeMillis() < deadline) Thread.sleep(20)
        assertThat(DiskOutboxSettlement(file).settled()).contains(cmid)
    }

    @Test
    fun `un envoi retire pendant un lancement en memoire ne repart pas depuis le disque`() = runBlocking<Unit> {
        val name = "settle-withdrawn.db"
        val file = seeded(name, listOf("c-1", "c-2"))

        val memory = memoryLaunch(name, file)
        assertThat(memory.outboxDao().find("c-1")).isNotNull()
        memory.outboxDao().deleteAll(listOf("c-1"))
        awaitSettled(file, "c-1")
        memory.close()

        val disk = opener(name, StorageHealth(), prepare = {}).open()
        assertThat(disk.outboxDao().find("c-1")).isNull()
        assertThat(disk.outboxDao().find("c-2")).isEqualTo(row("c-2"))
        assertThat(settledFile(file).exists()).isFalse()
        disk.close()
    }

    @Test
    fun `un envoi dont l'annulation est demandee en memoire est regle, l'autre reste en attente`() = runBlocking<Unit> {
        val name = "settle-cancel-requested.db"
        val file = seeded(name, listOf("c-1", "c-2"))

        val memory = memoryLaunch(name, file)
        memory.outboxDao().upsert(row("c-1").copy(state = "INFLIGHT", cancelRequestedAt = 5L))
        awaitSettled(file, "c-1")
        memory.close()

        assertThat(DiskOutboxSettlement(file).settled()).containsExactly("c-1")
    }

    @Test
    fun `un second lancement en memoire ne ressuscite pas une ligne deja reglee`() = runBlocking<Unit> {
        val name = "settle-twice.db"
        val file = seeded(name, listOf("c-1", "c-2"))
        val first = memoryLaunch(name, file)
        first.outboxDao().deleteAll(listOf("c-1"))
        awaitSettled(file, "c-1")
        first.close()

        val second = memoryLaunch(name, file)

        assertThat(second.outboxDao().find("c-1")).isNull()
        assertThat(second.outboxDao().find("c-2")).isNotNull()
        assertThat(DiskOutboxSettlement(file).settled()).containsExactly("c-1")
        second.close()
    }

    @Test
    fun `des reports epuises ouvrent en memoire avec l'outbox du disque, sans toucher au fichier`() = runBlocking<Unit> {
        val name = "deferral-exhausted.db"
        val file = seeded(name, listOf("c-1"))
        val before = file.readBytes()
        val encryption = EncryptedDatabaseBootstrap(
            databaseFile = file,
            keys = DatabaseKeyProvider(InMemorySecureStore()),
            migrator = PlaintextDatabaseMigrator(NoExport),
            freeBytes = { 0L },
            maxDeferrals = 0,
        )
        val health = StorageHealth()
        val built = mutableListOf<DatabaseLocation>()

        val database = opener(name, health, prepare = { encryption.prepare() }, built = built).open()

        assertThat(health.current.value).isEqualTo(StorageState.Ephemeral("${DatabaseOpener.ENCRYPTION_UNAVAILABLE}unavailable"))
        assertThat(built).containsExactly(DatabaseLocation.Memory)
        assertThat(database.outboxDao().find("c-1")).isEqualTo(row("c-1"))
        assertThat(file.readBytes()).isEqualTo(before)
        database.close()
    }

    @Test
    fun `une base recreee pendant un report quitte le mode en clair`() = runBlocking<Unit> {
        val name = "deferred-recreated.db"
        val file = seeded(name, listOf("c-1"))
        DatabaseRecovery.markCorrupted(file)
        val encryption = EncryptedDatabaseBootstrap(
            databaseFile = file,
            keys = DatabaseKeyProvider(InMemorySecureStore()),
            migrator = PlaintextDatabaseMigrator(NoExport),
            freeBytes = { 0L },
        )
        val health = StorageHealth()

        val database = opener(name, health, prepare = { encryption.prepare() }).open()

        assertThat(health.current.value).isEqualTo(StorageState.Degraded("recreated"))
        assertThat(encryption.plaintextDeferred).isFalse()
        assertThat(encryption.passphrase()).isNotEmpty()
        assertThat(database.outboxDao().find("c-1")).isNotNull()
        database.close()
    }
}
