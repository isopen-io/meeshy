package me.meeshy.core.database.crypto

import com.google.common.truth.Truth.assertThat
import java.io.File
import me.meeshy.core.database.DatabaseInitDiagnostics
import me.meeshy.core.database.DatabaseRecovery
import me.meeshy.core.database.OpenFailureKind
import me.meeshy.core.database.StorageHealth
import me.meeshy.core.database.StorageState
import me.meeshy.sdk.model.security.InMemorySecureStore
import org.junit.Assert.assertThrows
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

/**
 * Contre-audit de #15880 : un report de la migration faute de place fait ÉCRIRE la base en clair (nouveaux messages
 * compris). Il est donc compté, journalisé, signalé et borné ; au-delà, la base en clair ne s'ouvre plus. Une base
 * recréée pendant un report naît chiffrée.
 */
class DeferredMigrationBoundTest {

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

    private fun counter() = File(main().path + EncryptedDatabaseBootstrap.DEFERRALS_SUFFIX)

    private fun writePlain() = main().writeBytes(plainHeader + ByteArray(4096))

    private fun bootstrap(
        free: Long,
        store: InMemorySecureStore,
        events: MutableList<String> = mutableListOf(),
        engine: FakeEngine = FakeEngine(),
        onEvent: (String) -> Unit = events::add,
    ) = EncryptedDatabaseBootstrap(
        databaseFile = main(),
        keys = DatabaseKeyProvider(store),
        migrator = PlaintextDatabaseMigrator(engine),
        onEvent = onEvent,
        freeBytes = { free },
    )

    @Test
    fun `chaque report est compte et journalise, puis la base en clair ne s'ouvre plus`() {
        writePlain()
        val store = InMemorySecureStore()
        val events = mutableListOf<String>()
        val max = EncryptedDatabaseBootstrap.MAX_DEFERRALS

        (1..max).forEach { launch ->
            val bootstrap = bootstrap(free = 1024, store = store, events = events)
            bootstrap.prepare()
            assertThat(bootstrap.plaintextDeferred).isTrue()
            assertThat(events.last()).isEqualTo("${EncryptedDatabaseBootstrap.DEFERRED}disk-full,launch=$launch/$max")
        }

        val failure = assertThrows(MigrationDeferralExhaustedException::class.java) {
            bootstrap(free = 1024, store = store, events = events).prepare()
        }

        assertThat(DatabaseRecovery.classify(failure)).isEqualTo(OpenFailureKind.UNAVAILABLE)
        assertThat(events.last())
            .startsWith("${EncryptedDatabaseBootstrap.DEFERRED}${EncryptedDatabaseBootstrap.EXHAUSTED}")
        assertThat(DatabaseFileStates.of(main())).isEqualTo(DatabaseFileState.PLAINTEXT)
    }

    @Test
    fun `une migration reussie remet le compte des reports a zero`() {
        writePlain()
        val store = InMemorySecureStore()
        bootstrap(free = 1024, store = store).prepare()
        bootstrap(free = 1024, store = store).prepare()
        assertThat(counter().readText()).isEqualTo("2")

        bootstrap(free = Long.MAX_VALUE, store = store).prepare()

        assertThat(DatabaseFileStates.of(main())).isEqualTo(DatabaseFileState.ENCRYPTED)
        assertThat(counter().exists()).isFalse()
    }

    @Test
    fun `un compteur qui ne s'ecrit pas vaut un report de trop, jamais une ouverture en clair`() {
        writePlain()
        counter().mkdirs()

        assertThrows(MigrationDeferralExhaustedException::class.java) {
            bootstrap(free = 1024, store = InMemorySecureStore()).prepare()
        }
    }

    @Test
    fun `une sauvegarde en clair seule est remise en place meme quand les reports sont epuises`() {
        PlaintextDatabaseMigrator.backup(main()).writeBytes(plainHeader + ByteArray(4096))
        counter().writeText("${EncryptedDatabaseBootstrap.MAX_DEFERRALS}")

        assertThrows(MigrationDeferralExhaustedException::class.java) {
            bootstrap(free = 1024, store = InMemorySecureStore()).prepare()
        }

        assertThat(DatabaseFileStates.of(main())).isEqualTo(DatabaseFileState.PLAINTEXT)
        assertThat(PlaintextDatabaseMigrator.backup(main()).exists()).isFalse()
    }

    @Test
    fun `une base recreee pendant un report nait chiffree, jamais en clair`() {
        writePlain()
        val bootstrap = bootstrap(free = 1024, store = InMemorySecureStore())
        bootstrap.prepare()
        assertThat(bootstrap.passphrase()).isEmpty()

        main().renameTo(File(main().path + ".corrupted.9"))

        assertThat(bootstrap.passphrase()).isNotEmpty()
        assertThat(bootstrap.plaintextDeferred).isFalse()
        assertThat(File(main().path + ".corrupted.9").exists()).isFalse()
    }

    @Test
    fun `un report degrade le stockage pour que l'interface le dise`() {
        writePlain()
        val diagnostics = DatabaseInitDiagnostics()
        val health = StorageHealth()

        bootstrap(free = 1024, store = InMemorySecureStore(), onEvent = EncryptionEventSink(diagnostics, health)).prepare()

        assertThat(health.current.value).isEqualTo(StorageState.Degraded(EncryptionEventSink.ENCRYPTION_DEFERRED))
    }
}
