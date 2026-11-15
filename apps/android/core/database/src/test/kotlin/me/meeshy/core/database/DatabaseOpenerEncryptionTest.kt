package me.meeshy.core.database

import android.content.Context
import android.database.sqlite.SQLiteDatabaseCorruptException
import android.database.sqlite.SQLiteFullException
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import java.io.File
import kotlinx.coroutines.runBlocking
import me.meeshy.core.database.crypto.DatabaseFileState
import me.meeshy.core.database.crypto.DatabaseFileStates
import me.meeshy.core.database.crypto.DatabaseKeyProvider
import me.meeshy.core.database.crypto.EncryptedDatabaseBootstrap
import me.meeshy.core.database.crypto.PlaintextDatabaseMigrator
import me.meeshy.core.database.crypto.PlaintextExportEngine
import me.meeshy.core.database.entity.OutboxEntity
import me.meeshy.core.database.entity.PendingIdEntity
import me.meeshy.core.database.entity.PlaintextErasureEntity
import me.meeshy.sdk.model.security.InMemorySecureStore
import me.meeshy.sdk.model.security.SecureRead
import me.meeshy.sdk.model.security.SecureStore
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * Le démarrage chiffré ne fait jamais planter l'app en boucle, et ne se replie jamais en clair (#15908, audit adversarial).
 *
 * Limite assumée : SQLCipher n'a pas de bibliothèque native pour la JVM hôte (l'AAR ne porte que des `.so` Android liés à
 * bionic), donc Room s'ouvre ici sur le framework et le « chiffrement » des fichiers est un double (XOR) qui rend le
 * fichier illisible à SQLite sans la clé. Ce qui est prouvé : l'ARBRE de décision de [DatabaseOpener] et le fait que le
 * sauvetage passe par l'ouvreur qui détient la clé ; pas le format SQLCipher lui-même.
 */
@RunWith(RobolectricTestRunner::class)
class DatabaseOpenerEncryptionTest {

    private val context: Context get() = ApplicationProvider.getApplicationContext()

    private fun realBuild(ctx: Context, location: DatabaseLocation): MeeshyDatabase =
        DatabaseModule.meeshyDatabaseBuilder(ctx, location).allowMainThreadQueries().build()

    private fun secondary(name: String) = File(context.cacheDir, "secondary-$name")

    private fun corruptedCopies(file: File): List<String> =
        file.parentFile?.listFiles().orEmpty().map { it.name }.filter { it.startsWith("${file.name}.corrupted.") }

    /** Une base en clair peuplée par l'app d'avant le chiffrement, journal WAL versé dans le fichier. */
    private fun seeded(name: String): File {
        realBuild(context, DatabaseLocation.Named(name)).apply {
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

    private fun xor(bytes: ByteArray): ByteArray = ByteArray(bytes.size) { (bytes[it].toInt() xor CIPHER_BYTE).toByte() }

    /** Le double du fichier SQLCipher : illisible pour SQLite sans la clé, relu par [cipherSalvage] qui la détient. */
    private fun encryptInPlace(file: File) {
        listOf("-wal", "-shm").forEach { File(file.path + it).delete() }
        file.writeBytes(xor(file.readBytes()))
    }

    private val cipherSalvage = SalvageOpener { file ->
        val clear = File.createTempFile("salvage", ".db", context.cacheDir).apply { writeBytes(xor(file.readBytes())) }
        val inner = DatabaseRecovery.frameworkSalvage.open(clear)
        object : SalvageConnection {
            override fun query(sql: String) = inner.query(sql)
            override fun close() {
                inner.close()
                clear.delete()
            }
        }
    }

    private class FailingEngine(private val failure: () -> Throwable) : PlaintextExportEngine {
        var exports = 0
        override fun export(plain: File, target: File, passphrase: ByteArray) {
            exports++
            if (exports == 1) throw failure()
            error("a second export is not expected")
        }

        override fun verify(source: File?, encrypted: File, passphrase: ByteArray) = true
    }

    /** Le coffre Keystore qui a renoncé (`gaveUp`) : lectures illisibles, écritures refusées. */
    private class GaveUpVault : SecureStore {
        var writes = 0
        override fun get(key: String, account: String?): String? = null
        override fun read(key: String, account: String?): SecureRead = SecureRead.Unreadable
        override fun put(key: String, value: String, account: String?): Boolean {
            writes++
            return false
        }
        override fun remove(key: String, account: String?) = Unit
        override fun keys(account: String?): Set<String> = emptySet()
        override fun clearAccount(account: String) = Unit
        override fun clearAll() = Unit
    }

    private fun bootstrap(file: File, engine: PlaintextExportEngine, vault: SecureStore = InMemorySecureStore()) =
        EncryptedDatabaseBootstrap(file, DatabaseKeyProvider(vault), PlaintextDatabaseMigrator(engine))

    private fun opener(
        name: String,
        diagnostics: DatabaseInitDiagnostics,
        health: StorageHealth,
        prepare: () -> Unit,
        built: MutableList<DatabaseLocation> = mutableListOf(),
        salvageOpener: SalvageOpener = DatabaseRecovery.byFileState(cipherSalvage),
        build: (Context, DatabaseLocation) -> MeeshyDatabase = ::realBuild,
    ) = DatabaseOpener(
        context = context,
        diagnostics = diagnostics,
        health = health,
        primaryName = name,
        clock = { 42L },
        secondaryFile = secondary(name),
        prepare = prepare,
        salvageOpener = salvageOpener,
        allowsSecondary = false,
        build = { ctx, location ->
            built += location
            build(ctx, location)
        },
    )

    @Test
    fun `une base en clair dont une page est corrompue part en quarantaine et son outbox survit a la recreation`() = runBlocking {
        val name = "plain-corrupt.db"
        val file = seeded(name)
        val engine = FailingEngine { SQLiteDatabaseCorruptException("database disk image is malformed (code 11 SQLITE_CORRUPT)") }
        val encryption = bootstrap(file, engine)
        val health = StorageHealth()
        val diagnostics = DatabaseInitDiagnostics()

        val database = opener(name, diagnostics, health, prepare = { encryption.prepare() }).open()

        assertThat(corruptedCopies(file)).isEmpty()
        assertThat(database.outboxDao().pendingCount()).isEqualTo(1)
        assertThat(database.pendingIdDao().byLocalId("cid_1")?.serverId).isEqualTo("srv-1")
        assertThat(diagnostics.events.value.map { it.stage }).containsAtLeast(
            DatabaseInitStage.FIRST_FAILURE,
            DatabaseInitStage.QUARANTINED,
            DatabaseInitStage.RECREATED,
        ).inOrder()
        assertThat(health.current.value).isEqualTo(StorageState.Degraded("recreated"))
        assertThat(engine.exports).isEqualTo(1)
        database.close()
    }

    @Test
    fun `un disque plein pendant la migration ouvre en memoire sans jamais ouvrir ni deplacer la base en clair`() {
        val name = "plain-full.db"
        val file = seeded(name)
        val encryption = bootstrap(file, FailingEngine { SQLiteFullException("database or disk is full (code 13 SQLITE_FULL)") })
        val health = StorageHealth()
        val diagnostics = DatabaseInitDiagnostics()
        val built = mutableListOf<DatabaseLocation>()

        val database = opener(name, diagnostics, health, prepare = { encryption.prepare() }, built = built).open()

        assertThat(health.current.value).isEqualTo(StorageState.Ephemeral("${DatabaseOpener.ENCRYPTION_UNAVAILABLE}unavailable"))
        assertThat(built).containsExactly(DatabaseLocation.Memory)
        assertThat(DatabaseFileStates.of(file)).isEqualTo(DatabaseFileState.PLAINTEXT)
        assertThat(corruptedCopies(file)).isEmpty()
        assertThat(secondary(name).exists()).isFalse()
        assertThat(diagnostics.events.value.map { it.stage }).contains(DatabaseInitStage.FELL_BACK_MEMORY)
        database.close()
    }

    @Test
    fun `un coffre qui a abandonne ouvre en memoire sans rien ecrire ni toucher au fichier, meme signale corrompu`() {
        val name = "vault-gave-up.db"
        val file = seeded(name).also(::encryptInPlace)
        DatabaseRecovery.markCorrupted(file)
        val before = file.readBytes()
        val vault = GaveUpVault()
        val encryption = bootstrap(file, FailingEngine { error("no export expected") }, vault)
        val health = StorageHealth()
        val built = mutableListOf<DatabaseLocation>()

        val database = opener(name, DatabaseInitDiagnostics(), health, prepare = { encryption.prepare() }, built = built).open()

        assertThat(health.current.value).isEqualTo(StorageState.Ephemeral("${DatabaseOpener.ENCRYPTION_UNAVAILABLE}key"))
        assertThat(built).containsExactly(DatabaseLocation.Memory)
        assertThat(file.readBytes()).isEqualTo(before)
        assertThat(corruptedCopies(file)).isEmpty()
        assertThat(DatabaseRecovery.isMarkedCorrupted(file)).isTrue()
        assertThat(vault.writes).isEqualTo(0)
        database.close()
    }

    @Test
    fun `une base chiffree signalee corrompue est sauvee par l'ouvreur qui detient la cle`() = runBlocking {
        val name = "encrypted-corrupt.db"
        val file = seeded(name).also(::encryptInPlace)
        DatabaseRecovery.markCorrupted(file)
        assertThat(DatabaseRecovery.salvage(file).isEmpty).isTrue()

        val database = opener(name, DatabaseInitDiagnostics(), StorageHealth(), prepare = {}).open()

        assertThat(database.outboxDao().pendingCount()).isEqualTo(1)
        assertThat(database.plaintextErasureDao().all().map { it.itemId }).containsExactly("m1")
        assertThat(database.pendingIdDao().byLocalId("cid_1")?.serverId).isEqualTo("srv-1")
        assertThat(corruptedCopies(file)).contains("$name.corrupted.42")
        database.close()
    }

    @Test
    fun `un disque qui refuse la base principale mene en memoire, jamais a une base de repli en clair`() {
        val name = "no-secondary.db"
        val health = StorageHealth()
        val build = { ctx: Context, location: DatabaseLocation ->
            if (location is DatabaseLocation.Named) throw SQLiteFullException("database or disk is full")
            realBuild(ctx, location)
        }

        val database = opener(name, DatabaseInitDiagnostics(), health, prepare = {}, build = build).open()

        assertThat(health.isEphemeral).isTrue()
        assertThat(secondary(name).exists()).isFalse()
        database.close()
    }

    @Test
    fun `une base en memoire faute de chiffrement montre l'outbox du disque, avec ses identifiants d'origine`() = runBlocking {
        val name = "memory-keeps-outbox.db"
        val file = seeded(name)
        val before = file.readBytes()
        val encryption = bootstrap(file, FailingEngine { SQLiteFullException("database or disk is full (code 13 SQLITE_FULL)") })
        val health = StorageHealth()

        val database = opener(name, DatabaseInitDiagnostics(), health, prepare = { encryption.prepare() }).open()

        assertThat(health.isEphemeral).isTrue()
        assertThat(database.outboxDao().pendingCount()).isEqualTo(1)
        assertThat(database.pendingIdDao().byLocalId("cid_1")?.serverId).isEqualTo("srv-1")
        assertThat(database.plaintextErasureDao().all().map { it.itemId }).containsExactly("m1")
        assertThat(file.readBytes()).isEqualTo(before)
        database.close()
    }

    @Test
    fun `un ouvreur de sauvetage qui leve une erreur native n'empeche pas la base en memoire`() = runBlocking {
        val name = "memory-native-missing.db"
        val file = seeded(name).also(::encryptInPlace)
        val vault = GaveUpVault()
        val encryption = bootstrap(file, FailingEngine { error("no export expected") }, vault)
        val health = StorageHealth()
        val nativeMissing = SalvageOpener { throw UnsatisfiedLinkError("dlopen failed: libsqlcipher.so") }

        val database = opener(
            name, DatabaseInitDiagnostics(), health, prepare = { encryption.prepare() },
            salvageOpener = DatabaseRecovery.byFileState(nativeMissing),
        ).open()

        assertThat(health.isEphemeral).isTrue()
        assertThat(database.outboxDao().pendingCount()).isEqualTo(0)
        database.close()
    }

    @Test
    fun `une migration differee faute de place ouvre la base en clair sur le disque, cache et outbox compris`() = runBlocking {
        val name = "plain-deferred.db"
        val file = seeded(name)
        val engine = FailingEngine { error("no export expected when the disk cannot hold the copy") }
        val encryption = EncryptedDatabaseBootstrap(
            databaseFile = file,
            keys = DatabaseKeyProvider(InMemorySecureStore()),
            migrator = PlaintextDatabaseMigrator(engine),
            freeBytes = { 0L },
        )
        val health = StorageHealth()
        val built = mutableListOf<DatabaseLocation>()

        val database = opener(name, DatabaseInitDiagnostics(), health, prepare = { encryption.prepare() }, built = built).open()

        assertThat(built).containsExactly(DatabaseLocation.Named(name))
        assertThat(health.isEphemeral).isFalse()
        assertThat(database.outboxDao().pendingCount()).isEqualTo(1)
        assertThat(engine.exports).isEqualTo(0)
        assertThat(DatabaseFileStates.of(file)).isEqualTo(DatabaseFileState.PLAINTEXT)
        database.close()
    }

    private companion object {
        const val CIPHER_BYTE = 0x5A
    }
}
