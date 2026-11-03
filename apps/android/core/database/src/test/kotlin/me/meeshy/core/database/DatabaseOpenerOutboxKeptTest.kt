package me.meeshy.core.database

import android.content.Context
import android.database.sqlite.SQLiteDatabaseCorruptException
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import java.io.File
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
            close()
        }
        return context.getDatabasePath(name)
    }

    /** La première ouverture du fichier principal découvre une corruption ; la recréation, elle, réussit. */
    private fun corruptOnFirstOpen(primaryName: String): (Context, DatabaseLocation) -> MeeshyDatabase {
        var primaryOpens = 0
        return { ctx, location ->
            if (location == DatabaseLocation.Named(primaryName) && primaryOpens++ == 0) {
                throw SQLiteDatabaseCorruptException("database disk image is malformed")
            }
            realBuild(ctx, location)
        }
    }

    private fun opener(name: String, diagnostics: DatabaseInitDiagnostics) = DatabaseOpener(
        context = context,
        diagnostics = diagnostics,
        health = StorageHealth(),
        primaryName = name,
        clock = { 99L },
        secondaryFile = File(context.cacheDir, "kept-secondary-$name"),
        build = corruptOnFirstOpen(name),
    )

    @Test
    fun `un cache inutilisable est reconstruit et l'outbox reste lisible`() {
        val name = "outbox-kept.db"
        val file = seeded(name)
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
        seeded(name)
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
        seeded(name)
        val diagnostics = DatabaseInitDiagnostics()

        val database = opener(name, diagnostics).open()

        assertThat(database.pendingIdDao().byServerId("srv-1")?.localId).isEqualTo("cid_1")
        assertThat(diagnostics.events.value.map { it.stage }).contains(DatabaseInitStage.PENDING_IDS_SALVAGED)
        database.close()
    }
}
