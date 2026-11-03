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

/**
 * La base de repli ne rend jamais deux fois une même ligne : ce qui a été repris la quitte aussitôt, et une ligne déjà
 * présente dans l'outbox principale n'est jamais écrasée par sa copie ancienne.
 */
@RunWith(RobolectricTestRunner::class)
class DatabaseOpenerFallbackReplayTest {

    private val context: Context get() = ApplicationProvider.getApplicationContext()

    private fun realBuild(ctx: Context, location: DatabaseLocation): MeeshyDatabase =
        DatabaseModule.meeshyDatabaseBuilder(ctx, location).allowMainThreadQueries().build()

    private fun secondary(name: String) = File(context.cacheDir, "replay-secondary-$name")

    private fun opener(name: String, health: StorageHealth = StorageHealth()) = DatabaseOpener(
        context = context,
        diagnostics = DatabaseInitDiagnostics(),
        health = health,
        primaryName = name,
        clock = { 7L },
        secondaryFile = secondary(name),
        build = ::realBuild,
    )

    private fun row(cmid: String, updatedAt: Long = 1L, cancelRequestedAt: Long? = null) = OutboxEntity(
        cmid = cmid, lane = "message:conv", kind = "EDIT_MESSAGE", targetId = "t", payload = "{}", dependsOn = null,
        attempts = 0, state = "PENDING", createdAt = 1L, updatedAt = updatedAt, cancelRequestedAt = cancelRequestedAt,
        ownerId = "u1",
    )

    private fun seed(location: DatabaseLocation, vararg rows: OutboxEntity) {
        realBuild(context, location).apply {
            runBlocking { rows.forEach { outboxDao().upsert(it) } }
            openHelper.writableDatabase
            close()
        }
    }

    private fun MeeshyDatabase.cmids(): List<String> =
        openHelper.readableDatabase.query("SELECT cmid FROM outbox ORDER BY cmid").use { cursor ->
            buildList { while (cursor.moveToNext()) add(cursor.getString(0)) }
        }

    private fun rawPrimary(name: String, sql: String) = raw(context.getDatabasePath(name), sql)

    private fun raw(file: File, sql: String) {
        SQLiteDatabase.openDatabase(file.path, null, SQLiteDatabase.OPEN_READWRITE).use { it.execSQL(sql) }
    }

    @Test
    fun `une reprise partielle ne rejoue pas au lancement suivant les lignes deja reprises`() {
        val name = "partial-replay.db"
        seed(DatabaseLocation.Named(secondary(name).absolutePath), row("c-1"), row("c-2"))
        seed(DatabaseLocation.Named(name))
        rawPrimary(
            name,
            "CREATE TRIGGER refuse_c2 BEFORE INSERT ON outbox WHEN NEW.cmid = 'c-2' " +
                "BEGIN SELECT RAISE(ABORT, 'disk full'); END",
        )

        opener(name).open().apply {
            assertThat(cmids()).containsExactly("c-1")
            openHelper.writableDatabase.execSQL("DELETE FROM outbox WHERE cmid = 'c-1'")
            close()
        }
        assertThat(secondary(name).exists()).isTrue()
        rawPrimary(name, "DROP TRIGGER refuse_c2")

        val relaunched = opener(name).open()

        assertThat(relaunched.cmids()).containsExactly("c-2")
        assertThat(secondary(name).exists()).isFalse()
        relaunched.close()
    }

    @Test
    fun `une ligne deja presente dans l'outbox n'est pas ecrasee par sa copie de repli`() {
        val name = "no-overwrite.db"
        seed(DatabaseLocation.Named(secondary(name).absolutePath), row("c-9", updatedAt = 1L))
        seed(DatabaseLocation.Named(name), row("c-9", updatedAt = 50L, cancelRequestedAt = 50L))

        val database = opener(name).open()

        val kept = database.openHelper.readableDatabase
            .query("SELECT updatedAt, cancelRequestedAt FROM outbox WHERE cmid = 'c-9'")
            .use { it.moveToFirst(); it.getLong(0) to it.getLong(1) }
        assertThat(kept).isEqualTo(50L to 50L)
        assertThat(secondary(name).exists()).isFalse()
        database.close()
    }

    @Test
    fun `quand ni l'insertion ni le retrait ne passent, aucune ligne de repli n'est perdue et l'utilisateur est prevenu`() {
        val name = "disk-full-keeps.db"
        seed(DatabaseLocation.Named(secondary(name).absolutePath), row("c-1"), row("c-2"))
        seed(DatabaseLocation.Named(name))
        raw(
            secondary(name),
            "CREATE TRIGGER keep_c1 BEFORE DELETE ON outbox WHEN OLD.cmid = 'c-1' " +
                "BEGIN SELECT RAISE(ABORT, 'disk full'); END",
        )
        rawPrimary(
            name,
            "CREATE TRIGGER refuse_c2 BEFORE INSERT ON outbox WHEN NEW.cmid = 'c-2' " +
                "BEGIN SELECT RAISE(ABORT, 'disk full'); END",
        )
        val health = StorageHealth()

        opener(name, health).open().apply {
            assertThat(cmids()).isEmpty()
            close()
        }

        assertThat(secondary(name).exists()).isTrue()
        assertThat(health.current.value).isEqualTo(StorageState.Degraded("fallback-kept:2"))
        raw(secondary(name), "DROP TRIGGER keep_c1")
        rawPrimary(name, "DROP TRIGGER refuse_c2")

        val relaunched = opener(name).open()

        assertThat(relaunched.cmids()).containsExactly("c-1", "c-2")
        assertThat(secondary(name).exists()).isFalse()
        relaunched.close()
    }
}
