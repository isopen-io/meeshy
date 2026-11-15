package me.meeshy.core.database

import android.content.Context
import android.database.sqlite.SQLiteFullException
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import java.io.File
import kotlinx.coroutines.runBlocking
import me.meeshy.core.database.crypto.DatabaseKeyProvider
import me.meeshy.core.database.crypto.DatabaseKeyUnavailableException
import me.meeshy.core.database.crypto.EncryptedDatabaseBootstrap
import me.meeshy.core.database.crypto.PlaintextDatabaseMigrator
import me.meeshy.core.database.crypto.PlaintextExportEngine
import me.meeshy.core.database.entity.MessageEntity
import me.meeshy.core.database.entity.OutboxEntity
import me.meeshy.core.database.entity.PendingIdEntity
import me.meeshy.core.database.entity.PlaintextErasureEntity
import me.meeshy.sdk.model.security.InMemorySecureStore
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * Troisième contre-audit de #15880 : une session close pendant un lancement EN MÉMOIRE ne vidait que la mémoire, et la
 * base sur disque du compte A se rouvrait au lancement suivant sous le compte B. La purge reste due ([PendingDiskPurge])
 * et s'applique avant toute ouverture sur disque ; les clairs E2EE que le coffre doit retirer pour A survivent, comme
 * après une purge de session ordinaire.
 */
@RunWith(RobolectricTestRunner::class)
class PendingDiskPurgeTest {

    private val context: Context get() = ApplicationProvider.getApplicationContext()

    private fun realBuild(ctx: Context, location: DatabaseLocation): MeeshyDatabase =
        DatabaseModule.meeshyDatabaseBuilder(ctx, location).allowMainThreadQueries().build()

    private fun outbox(cmid: String) = OutboxEntity(
        cmid = cmid, lane = "message:conv", kind = "SEND", targetId = "t", payload = "{\"content\":\"secret de A\"}",
        dependsOn = null, attempts = 0, state = "PENDING", createdAt = 1L, updatedAt = 2L, ownerId = "user-A",
    )

    private val owed = PlaintextErasureEntity("user-A", "message", "m-erased", "cid_e", "user-A", recordedAt = 3L)

    private val unstamped = PlaintextErasureEntity(PlaintextErasureEntity.SESSION_ACCOUNT, "message", "m-anon", recordedAt = 4L)

    /** La base sur disque du compte A : un message, un envoi en attente, un pont d'identifiant, deux inscriptions d'effacement. */
    private fun seededByA(name: String): File {
        realBuild(context, DatabaseLocation.Named(name)).apply {
            runBlocking {
                messageDao().upsertAll(listOf(MessageEntity("m-A", "conv-A", null, "{}", 1L, 1L, contentText = "bonjour de A")))
                outboxDao().upsert(outbox("c-A"))
                pendingIdDao().upsert(PendingIdEntity("cid_A", "srv-A", "conv-A", reconciledAt = null))
                plaintextErasureDao().recordMessages(listOf(owed, unstamped))
            }
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

    private fun opener(
        name: String,
        health: StorageHealth,
        prepare: () -> Unit,
        leftovers: DatabaseLeftovers? = null,
        built: MutableList<DatabaseLocation> = mutableListOf(),
        salvageOpener: SalvageOpener = DatabaseRecovery.frameworkSalvage,
        diagnostics: DatabaseInitDiagnostics = DatabaseInitDiagnostics(),
    ) = DatabaseOpener(
        context = context,
        diagnostics = diagnostics,
        health = health,
        primaryName = name,
        clock = { 42L },
        secondaryFile = File(context.cacheDir, "secondary-${File(name).name}"),
        leftovers = leftovers,
        prepare = prepare,
        salvageOpener = salvageOpener,
        allowsSecondary = false,
        build = { ctx, location ->
            built += location
            realBuild(ctx, location)
        },
    )

    private fun leftoversOf(file: File) = DatabaseLeftovers(file, File(context.cacheDir, "secondary-${file.name}"))

    private fun count(database: MeeshyDatabase, table: String): Long =
        database.openHelper.readableDatabase.query("SELECT count(*) FROM $table").use { it.moveToFirst(); it.getLong(0) }

    /** Un lancement EN MÉMOIRE (le disque ne peut pas porter la copie chiffrée), puis la purge de session du compte A. */
    private fun memoryLaunchThenSessionPurge(name: String, file: File): MeeshyDatabase {
        val encryption = EncryptedDatabaseBootstrap(file, DatabaseKeyProvider(InMemorySecureStore()), PlaintextDatabaseMigrator(DiskFull))
        val health = StorageHealth()
        val leftovers = leftoversOf(file)
        val memory = opener(name, health, prepare = { encryption.prepare() }, leftovers = leftovers).open()
        assertThat(health.isEphemeral).isTrue()
        leftovers.purge()
        return memory
    }

    @Test
    fun `une session close pendant un lancement en memoire ne laisse aucune ligne de A a l'ouverture disque suivante`() = runBlocking<Unit> {
        val name = "purge-due-memory.db"
        val file = seededByA(name)

        memoryLaunchThenSessionPurge(name, file).close()
        assertThat(PendingDiskPurge.isDue(file)).isTrue()

        val health = StorageHealth()
        val built = mutableListOf<DatabaseLocation>()
        val disk = opener(name, health, prepare = {}, built = built).open()

        assertThat(built).containsExactly(DatabaseLocation.Named(name))
        assertThat(count(disk, "messages")).isEqualTo(0)
        assertThat(count(disk, "outbox")).isEqualTo(0)
        assertThat(count(disk, "pending_ids")).isEqualTo(0)
        assertThat(disk.plaintextErasureDao().all()).containsExactly(owed)
        assertThat(PendingDiskPurge.isDue(file)).isFalse()
        assertThat(File(file.path + DiskOutboxSettlement.SUFFIX).exists()).isFalse()
        assertThat(File(file.path + EncryptedDatabaseBootstrap.DEFERRALS_SUFFIX).exists()).isFalse()
        disk.close()
    }

    @Test
    fun `une base ouverte sur disque n'inscrit aucune purge due, sa purge de session l'a videe`() {
        val name = "purge-not-due-disk.db"
        val file = seededByA(name)
        val leftovers = leftoversOf(file)

        leftovers.markInUse(file)
        leftovers.purge()

        assertThat(PendingDiskPurge.isDue(file)).isFalse()
    }

    @Test
    fun `un lancement en memoire sans base sur disque n'inscrit aucune purge`() {
        val file = context.getDatabasePath("purge-nothing-on-disk.db").also { it.parentFile?.mkdirs() }
        val leftovers = leftoversOf(file)

        leftovers.markInUse(null)
        leftovers.purge()

        assertThat(PendingDiskPurge.isDue(file)).isFalse()
    }

    @Test
    fun `une purge due que la cle ne permet pas d'appliquer garde le fichier et ouvre en memoire sans rien en recopier`() {
        val name = "purge-due-no-key.db"
        val file = seededByA(name)
        PendingDiskPurge.schedule(file)
        val before = file.readBytes()
        val health = StorageHealth()
        val built = mutableListOf<DatabaseLocation>()
        val noKey = SalvageOpener { throw DatabaseKeyUnavailableException("keystore unavailable") }

        val database = opener(name, health, prepare = {}, built = built, salvageOpener = noKey).open()

        assertThat(built).containsExactly(DatabaseLocation.Memory)
        assertThat(health.current.value).isEqualTo(StorageState.Ephemeral(DatabaseOpener.PURGE_PENDING))
        assertThat(count(database, "outbox")).isEqualTo(0)
        assertThat(count(database, "messages")).isEqualTo(0)
        assertThat(file.readBytes()).isEqualTo(before)
        assertThat(PendingDiskPurge.isDue(file)).isTrue()
        database.close()
    }

    @Test
    fun `une purge due dont la cle ne vient qu'avec la preparation du chiffrement s'applique quand meme`() = runBlocking<Unit> {
        val name = "purge-due-key-after-prepare.db"
        val file = seededByA(name)
        PendingDiskPurge.schedule(file)
        var prepared = false
        val keyAfterPrepare = SalvageOpener { candidate ->
            if (!prepared) throw DatabaseKeyUnavailableException("key not read yet")
            DatabaseRecovery.frameworkSalvage.open(candidate)
        }
        val built = mutableListOf<DatabaseLocation>()

        val disk = opener(name, StorageHealth(), prepare = { prepared = true }, built = built, salvageOpener = keyAfterPrepare).open()

        assertThat(built).containsExactly(DatabaseLocation.Named(name))
        assertThat(count(disk, "outbox")).isEqualTo(0)
        assertThat(count(disk, "messages")).isEqualTo(0)
        assertThat(disk.plaintextErasureDao().all()).containsExactly(owed)
        assertThat(PendingDiskPurge.isDue(file)).isFalse()
        disk.close()
    }

    @Test
    fun `une purge due sur un fichier corrompu le supprime et ouvre une base neuve`() {
        val name = "purge-due-corrupt.db"
        val file = context.getDatabasePath(name).also { it.parentFile?.mkdirs() }
        file.writeText("ceci n'est pas une base, historique de A")
        PendingDiskPurge.schedule(file)
        val health = StorageHealth()

        val database = opener(name, health, prepare = {}).open()

        assertThat(health.current.value).isEqualTo(StorageState.Normal)
        assertThat(count(database, "outbox")).isEqualTo(0)
        assertThat(PendingDiskPurge.isDue(file)).isFalse()
        database.close()
    }

    @Test
    fun `une purge due que le disque refuse d'appliquer n'ouvre jamais la base disque`() {
        val directory = File(context.cacheDir, "purge-readonly").apply { mkdirs() }
        val file = File(directory, "purge-due-readonly.db")
        realBuild(context, DatabaseLocation.Named(file.absolutePath)).apply {
            runBlocking { outboxDao().upsert(outbox("c-A")) }
            openHelper.writableDatabase.query("PRAGMA wal_checkpoint(TRUNCATE)").use { it.moveToFirst() }
            close()
        }
        PendingDiskPurge.schedule(file)
        val probe = File(directory, "probe").apply { writeText("") }
        directory.setWritable(false)
        try {
            assumeTrue("le système de fichiers refuse la suppression", !probe.delete())
            val health = StorageHealth()
            val built = mutableListOf<DatabaseLocation>()

            val database = opener(file.absolutePath, health, prepare = {}, built = built).open()

            assertThat(built).containsExactly(DatabaseLocation.Memory)
            assertThat(health.current.value).isEqualTo(StorageState.Ephemeral(DatabaseOpener.PURGE_PENDING))
            assertThat(count(database, "outbox")).isEqualTo(0)
            assertThat(PendingDiskPurge.isDue(file)).isTrue()
            database.close()
        } finally {
            directory.setWritable(true)
        }
    }
}
