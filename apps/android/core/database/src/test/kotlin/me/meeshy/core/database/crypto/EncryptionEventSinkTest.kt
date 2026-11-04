package me.meeshy.core.database.crypto

import com.google.common.truth.Truth.assertThat
import java.io.File
import me.meeshy.core.database.DatabaseInitDiagnostics
import me.meeshy.core.database.DatabaseInitStage
import me.meeshy.core.database.StorageHealth
import me.meeshy.core.database.StorageState
import me.meeshy.sdk.model.security.InMemorySecureStore
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class EncryptionEventSinkTest {

    @get:Rule
    val folder = TemporaryFolder()

    private object NoEngine : PlaintextExportEngine {
        override fun export(plain: File, target: File, passphrase: ByteArray) = error("no export expected")
        override fun verify(source: File?, encrypted: File, passphrase: ByteArray) = true
    }

    @Test
    fun `une base chiffree purgee faute de cle est consignee et degrade le stockage en key-lost`() {
        val main = File(folder.root, "meeshy.db").apply { writeBytes(ByteArray(4096) { (it * 7 + 3).toByte() }) }
        val diagnostics = DatabaseInitDiagnostics()
        val health = StorageHealth()

        EncryptedDatabaseBootstrap(
            main,
            DatabaseKeyProvider(InMemorySecureStore()),
            PlaintextDatabaseMigrator(NoEngine),
            EncryptionEventSink(diagnostics, health),
        ).prepare()

        assertThat(diagnostics.events.value.map { it.stage }).containsExactly(DatabaseInitStage.COLD_START_PURGE)
        assertThat(health.current.value).isEqualTo(StorageState.Degraded(EncryptionEventSink.KEY_LOST))
    }

    @Test
    fun `un fichier tronque purge est consigne sans pretendre que la cle est perdue`() {
        val diagnostics = DatabaseInitDiagnostics()
        val health = StorageHealth()

        EncryptionEventSink(diagnostics, health)("purge:origin=EXISTING,state=TRUNCATED")

        assertThat(diagnostics.events.value.map { it.stage }).containsExactly(DatabaseInitStage.COLD_START_PURGE)
        assertThat(health.current.value).isEqualTo(StorageState.Degraded(EncryptionEventSink.PURGED))
    }

    @Test
    fun `une migration en clair vers chiffre est consignee sans degrader le stockage`() {
        val diagnostics = DatabaseInitDiagnostics()
        val health = StorageHealth()

        EncryptionEventSink(diagnostics, health)("migration:EXPORT,VERIFY_TEMP")

        assertThat(diagnostics.events.value.map { it.stage }).containsExactly(DatabaseInitStage.ENCRYPTION_MIGRATED)
        assertThat(health.current.value).isEqualTo(StorageState.Normal)
    }
}
