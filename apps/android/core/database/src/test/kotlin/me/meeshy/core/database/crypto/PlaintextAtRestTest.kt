package me.meeshy.core.database.crypto

import com.google.common.truth.Truth.assertThat
import java.io.File
import me.meeshy.sdk.model.security.InMemorySecureStore
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

/**
 * Contre-audit de #15880 : un disque presque plein ne met plus l'app en mémoire pour de bon (la base en clair reste
 * ouvrable tant que l'export ne tient pas sur le disque), et aucune copie en clair ne survit à la préparation.
 */
class PlaintextAtRestTest {

    @get:Rule
    val folder = TemporaryFolder()

    private val plainHeader = "SQLite format 3\u0000".toByteArray(Charsets.US_ASCII)

    private class FakeEngine : PlaintextExportEngine {
        var exports = 0
        override fun export(plain: File, target: File, passphrase: ByteArray) {
            exports++
            target.writeBytes(ByteArray(2048) { (it * 13 + 5).toByte() })
        }

        override fun verify(source: File?, encrypted: File, passphrase: ByteArray) = true
    }

    private fun main() = File(folder.root, "meeshy.db")

    private fun writePlain(bytes: Int = 4096) = main().writeBytes(plainHeader + ByteArray(bytes))

    private fun encryptedBytes(size: Int = 4096) = ByteArray(size) { (it * 7 + 3).toByte() }

    private fun bootstrap(
        engine: FakeEngine,
        free: Long,
        events: MutableList<String> = mutableListOf(),
        store: InMemorySecureStore = InMemorySecureStore(),
    ) = EncryptedDatabaseBootstrap(
        databaseFile = main(),
        keys = DatabaseKeyProvider(store),
        migrator = PlaintextDatabaseMigrator(engine),
        onEvent = events::add,
        freeBytes = { free },
    )

    @Test
    fun `un disque qui ne peut pas porter la copie chiffree differe la migration et laisse la base en clair ouvrable`() {
        writePlain()
        val engine = FakeEngine()
        val events = mutableListOf<String>()
        val bootstrap = bootstrap(engine, free = 1024, events = events)

        bootstrap.prepare()

        assertThat(engine.exports).isEqualTo(0)
        assertThat(bootstrap.plaintextDeferred).isTrue()
        assertThat(bootstrap.passphrase()).isEmpty()
        assertThat(DatabaseFileStates.of(main())).isEqualTo(DatabaseFileState.PLAINTEXT)
        assertThat(events.single()).startsWith(EncryptedDatabaseBootstrap.DEFERRED)
    }

    @Test
    fun `la migration differee reprend au lancement suivant des que la place est revenue`() {
        writePlain()
        val store = InMemorySecureStore()
        bootstrap(FakeEngine(), free = 1024, store = store).prepare()
        val engine = FakeEngine()

        val next = bootstrap(engine, free = Long.MAX_VALUE, store = store)
        next.prepare()

        assertThat(engine.exports).isEqualTo(1)
        assertThat(next.plaintextDeferred).isFalse()
        assertThat(next.passphrase()).isNotEmpty()
        assertThat(DatabaseFileStates.of(main())).isEqualTo(DatabaseFileState.ENCRYPTED)
    }

    @Test
    fun `une sauvegarde en clair seule est remise en place avant de differer, jamais remplacee par une base vide`() {
        PlaintextDatabaseMigrator.backup(main()).writeBytes(plainHeader + ByteArray(4096))

        val bootstrap = bootstrap(FakeEngine(), free = 1024)
        bootstrap.prepare()

        assertThat(bootstrap.plaintextDeferred).isTrue()
        assertThat(DatabaseFileStates.of(main())).isEqualTo(DatabaseFileState.PLAINTEXT)
        assertThat(PlaintextDatabaseMigrator.backup(main()).exists()).isFalse()
    }

    @Test
    fun `la place exigee couvre la base, son journal et une marge`() {
        writePlain(bytes = 10 * 1024 * 1024)
        File(main().path + "-wal").writeBytes(ByteArray(1024 * 1024))
        val needed = EncryptedDatabaseBootstrap.requiredFreeBytes(main())

        assertThat(needed).isGreaterThan(main().length() + 1024 * 1024)

        val engine = FakeEngine()
        bootstrap(engine, free = needed - 1).prepare()
        assertThat(engine.exports).isEqualTo(0)

        bootstrap(engine, free = needed).prepare()
        assertThat(engine.exports).isEqualTo(1)
    }

    @Test
    fun `une base deja chiffree ne differe rien, quelle que soit la place`() {
        val store = InMemorySecureStore()
        bootstrap(FakeEngine(), free = Long.MAX_VALUE, store = store).prepare()
        main().writeBytes(encryptedBytes())

        val bootstrap = bootstrap(FakeEngine(), free = 0, store = store)
        bootstrap.prepare()

        assertThat(bootstrap.plaintextDeferred).isFalse()
        assertThat(bootstrap.passphrase()).isNotEmpty()
    }

    @Test
    fun `les quarantaines en clair laissees par une version precedente sont supprimees, les chiffrees restent`() {
        val plainCopy = File(main().path + ".corrupted.5").apply { writeBytes(plainHeader + ByteArray(4096)) }
        val plainWal = File(main().path + ".corrupted.5-wal").apply { writeBytes(ByteArray(64)) }
        val orphanWal = File(main().path + ".corrupted.6-wal").apply { writeBytes(ByteArray(64)) }
        val encryptedCopy = File(main().path + ".corrupted.7").apply { writeBytes(encryptedBytes()) }
        val encryptedWal = File(main().path + ".corrupted.7-wal").apply { writeBytes(ByteArray(64)) }

        bootstrap(FakeEngine(), free = Long.MAX_VALUE).prepare()

        assertThat(plainCopy.exists()).isFalse()
        assertThat(plainWal.exists()).isFalse()
        assertThat(orphanWal.exists()).isFalse()
        assertThat(encryptedCopy.exists()).isTrue()
        assertThat(encryptedWal.exists()).isTrue()
    }

    @Test
    fun `une quarantaine en clair disparait meme quand la preparation est differee`() {
        writePlain()
        val plainCopy = File(main().path + ".corrupted.5").apply { writeBytes(plainHeader + ByteArray(4096)) }

        bootstrap(FakeEngine(), free = 1024).prepare()

        assertThat(plainCopy.exists()).isFalse()
    }
}
