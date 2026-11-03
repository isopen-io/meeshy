package me.meeshy.core.database

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import java.io.File
import kotlinx.coroutines.runBlocking
import me.meeshy.core.database.entity.OutboxEntity
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class DatabaseOpenerOutboxKeptTest {

    private val context: Context get() = ApplicationProvider.getApplicationContext()

    private fun realBuild(ctx: Context, location: DatabaseLocation): MeeshyDatabase =
        DatabaseModule.meeshyDatabaseBuilder(ctx, location).allowMainThreadQueries().build()

    @Test
    fun `un cache inutilisable est reconstruit et l'outbox reste lisible`() = runBlocking {
        val name = "outbox-kept.db"
        DatabaseModule.meeshyDatabaseBuilder(context, name).allowMainThreadQueries().build().apply {
            outboxDao().upsert(
                OutboxEntity(
                    cmid = "c-1", lane = "message:conv", kind = "SEND", targetId = "t", payload = "{}", dependsOn = null,
                    attempts = 1, state = "PENDING", createdAt = 1L, updatedAt = 2L, ownerId = "u1",
                ),
            )
            close()
        }
        val file = context.getDatabasePath(name)
        SQLiteDatabase.openDatabase(file.path, null, SQLiteDatabase.OPEN_READWRITE).use {
            it.execSQL("UPDATE room_master_table SET identity_hash = 'tampered'")
        }
        val diagnostics = DatabaseInitDiagnostics()

        val database = DatabaseOpener(
            context = context,
            diagnostics = diagnostics,
            health = StorageHealth(),
            primaryName = name,
            clock = { 99L },
            secondaryFile = File(context.cacheDir, "kept-secondary.db"),
            build = ::realBuild,
        ).open()

        val kept = database.outboxDao().observeAll()
        assertThat(File(file.path + ".corrupted.99").exists()).isTrue()
        assertThat(diagnostics.events.value.map { it.stage }).contains(DatabaseInitStage.OUTBOX_SALVAGED)
        assertThat(database.openHelper.readableDatabase.query("SELECT cmid, ownerId FROM outbox").use {
            it.moveToFirst()
            it.getString(0) to it.getString(1)
        }).isEqualTo("c-1" to "u1")
        assertThat(kept).isNotNull()
        database.close()
    }
}
