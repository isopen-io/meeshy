package me.meeshy.core.database.crypto

import com.google.common.truth.Truth.assertThat
import java.io.File
import me.meeshy.core.database.DatabaseRecovery
import me.meeshy.core.database.OpenFailureKind
import me.meeshy.sdk.model.security.InMemorySecureStore
import org.junit.Assert.assertThrows
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class EncryptedDatabaseBootstrapTest {

    @get:Rule
    val folder = TemporaryFolder()

    private val plainHeader = "SQLite format 3\u0000".toByteArray(Charsets.US_ASCII)

    private class FakeEngine(var verifies: Boolean = true, var failExport: Boolean = false) : PlaintextExportEngine {
        var exports = 0
        override fun export(plain: File, target: File, passphrase: ByteArray) {
            exports++
            if (failExport) error("export failed")
            target.writeBytes(ByteArray(2048) { (it * 13 + 5).toByte() })
        }

        override fun verify(source: File?, encrypted: File, passphrase: ByteArray) = verifies
    }

    private fun bootstrap(engine: FakeEngine, store: InMemorySecureStore = InMemorySecureStore(), events: MutableList<String> = mutableListOf()) =
        EncryptedDatabaseBootstrap(File(folder.root, "meeshy.db"), DatabaseKeyProvider(store), PlaintextDatabaseMigrator(engine), events::add)

    private fun main() = File(folder.root, "meeshy.db")

    private fun writePlain() = main().writeBytes(plainHeader + ByteArray(4096))

    @Test
    fun `une base en clair est remplacee par une base chiffree et la sauvegarde disparait`() {
        writePlain()
        val engine = FakeEngine()

        bootstrap(engine).prepare()

        assertThat(DatabaseFileStates.of(main())).isEqualTo(DatabaseFileState.ENCRYPTED)
        assertThat(PlaintextDatabaseMigrator.backup(main()).exists()).isFalse()
        assertThat(engine.exports).isEqualTo(1)
    }

    @Test
    fun `une verification qui echoue garde l'ancienne base et leve`() {
        writePlain()

        assertThrows(PlaintextMigrationException::class.java) { bootstrap(FakeEngine(verifies = false)).prepare() }

        assertThat(DatabaseFileStates.of(main())).isEqualTo(DatabaseFileState.PLAINTEXT)
        assertThat(PlaintextDatabaseMigrator.temp(main()).exists()).isFalse()
    }

    @Test
    fun `un export qui echoue leve sans toucher a la base en clair puis la reprise reussit`() {
        writePlain()
        val store = InMemorySecureStore()

        assertThrows(PlaintextMigrationException::class.java) { bootstrap(FakeEngine(failExport = true), store).prepare() }
        assertThat(DatabaseFileStates.of(main())).isEqualTo(DatabaseFileState.PLAINTEXT)

        bootstrap(FakeEngine(), store).prepare()
        assertThat(DatabaseFileStates.of(main())).isEqualTo(DatabaseFileState.ENCRYPTED)
    }

    @Test
    fun `une base chiffree dont la cle a disparu est purgee`() {
        main().writeBytes(ByteArray(4096) { (it * 7 + 3).toByte() })
        val events = mutableListOf<String>()

        bootstrap(FakeEngine(), InMemorySecureStore(), events).prepare()

        assertThat(main().exists()).isFalse()
        assertThat(events.single()).startsWith("purge:")
    }

    @Test
    fun `une base chiffree avec la cle relue reste intacte`() {
        val store = InMemorySecureStore()
        bootstrap(FakeEngine(), store).prepare()
        val bytes = ByteArray(4096) { (it * 7 + 3).toByte() }
        main().writeBytes(bytes)

        bootstrap(FakeEngine(), store).prepare()

        assertThat(main().readBytes()).isEqualTo(bytes)
    }

    @Test
    fun `la preparation ne s'execute qu'une fois`() {
        writePlain()
        val engine = FakeEngine()
        val bootstrap = bootstrap(engine)

        bootstrap.prepare()
        bootstrap.prepare()

        assertThat(engine.exports).isEqualTo(1)
    }

    @Test
    fun `un fichier que le disque refuse de lire leve une indisponibilite sans rien purger`() {
        val unreadable = main().also { it.mkdirs() }
        val events = mutableListOf<String>()

        val failure = assertThrows(DatabaseStorageUnavailableException::class.java) {
            bootstrap(FakeEngine(), InMemorySecureStore(), events).prepare()
        }

        assertThat(DatabaseRecovery.classify(failure)).isEqualTo(OpenFailureKind.UNAVAILABLE)
        assertThat(unreadable.exists()).isTrue()
        assertThat(events).isEmpty()
    }

    @Test
    fun `un export refuse par un disque plein est une indisponibilite, pas une corruption`() {
        writePlain()
        val engine = object : PlaintextExportEngine {
            override fun export(plain: File, target: File, passphrase: ByteArray) =
                throw java.io.IOException("write failed: ENOSPC (No space left on device)")

            override fun verify(source: File?, encrypted: File, passphrase: ByteArray) = true
        }
        val keys = DatabaseKeyProvider(InMemorySecureStore())

        val failure = assertThrows(PlaintextMigrationException::class.java) {
            EncryptedDatabaseBootstrap(main(), keys, PlaintextDatabaseMigrator(engine)).prepare()
        }

        assertThat(DatabaseRecovery.classify(failure)).isEqualTo(OpenFailureKind.UNAVAILABLE)
        assertThat(DatabaseFileStates.of(main())).isEqualTo(DatabaseFileState.PLAINTEXT)
    }

    @Test
    fun `la cle de sauvetage se lit sans rejouer la migration qui a echoue`() {
        writePlain()
        val store = InMemorySecureStore()
        val engine = FakeEngine(failExport = true)
        val bootstrap = bootstrap(engine, store)
        assertThrows(PlaintextMigrationException::class.java) { bootstrap.prepare() }

        val key = bootstrap.salvageKey()

        assertThat(key?.hex()).isEqualTo(DatabaseKeyProvider(store).obtain().hex())
        assertThat(engine.exports).isEqualTo(1)
    }
}
