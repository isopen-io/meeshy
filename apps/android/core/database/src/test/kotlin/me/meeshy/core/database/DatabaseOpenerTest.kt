package me.meeshy.core.database

import android.content.Context
import android.database.sqlite.SQLiteException
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import java.io.File
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class DatabaseOpenerTest {

    private val context: Context get() = ApplicationProvider.getApplicationContext()

    private fun realBuild(ctx: Context, location: DatabaseLocation): MeeshyDatabase =
        DatabaseModule.meeshyDatabaseBuilder(ctx, location).allowMainThreadQueries().build()

    private fun opener(
        name: String,
        diagnostics: DatabaseInitDiagnostics,
        health: StorageHealth,
        build: (Context, DatabaseLocation) -> MeeshyDatabase = ::realBuild,
    ) = DatabaseOpener(
        context = context,
        diagnostics = diagnostics,
        health = health,
        primaryName = name,
        clock = { 42L },
        secondaryFile = File(context.cacheDir, "secondary-$name"),
        build = build,
    )

    @Test
    fun `un fichier illisible est mis en quarantaine puis la base est recreee`() {
        val file = context.getDatabasePath("unreadable.db").also { it.parentFile?.mkdirs() }
        file.writeBytes(ByteArray(8192) { (it * 13 + 5).toByte() })
        val diagnostics = DatabaseInitDiagnostics()
        val health = StorageHealth()

        val database = opener("unreadable.db", diagnostics, health).open()

        assertThat(File(file.path + ".corrupted.42").exists()).isTrue()
        assertThat(database.openHelper.writableDatabase.isOpen).isTrue()
        assertThat(diagnostics.events.value.map { it.stage }).containsAtLeast(
            DatabaseInitStage.FIRST_FAILURE,
            DatabaseInitStage.QUARANTINED,
            DatabaseInitStage.RECREATED,
        ).inOrder()
        assertThat(health.current.value).isInstanceOf(StorageState.Degraded::class.java)
        database.close()
    }

    @Test
    fun `une installation neuve ouvre normalement sans diagnostic`() {
        val diagnostics = DatabaseInitDiagnostics()
        val health = StorageHealth()

        opener("fresh.db", diagnostics, health).open().close()

        assertThat(diagnostics.events.value).isEmpty()
        assertThat(health.current.value).isEqualTo(StorageState.Normal)
    }

    @Test
    fun `quand le chemin principal echoue toujours la base se replie sur le chemin secondaire`() {
        val diagnostics = DatabaseInitDiagnostics()
        val health = StorageHealth()
        val build = { ctx: Context, location: DatabaseLocation ->
            if (location is DatabaseLocation.Named && !location.name.contains("secondary")) {
                throw SQLiteException("disk full")
            }
            realBuild(ctx, location)
        }

        val database = opener("primary-down.db", diagnostics, health, build).open()

        assertThat(diagnostics.events.value.map { it.stage }).contains(DatabaseInitStage.FELL_BACK_SECONDARY)
        assertThat(health.current.value).isInstanceOf(StorageState.Degraded::class.java)
        assertThat(health.isEphemeral).isFalse()
        database.close()
    }

    @Test
    fun `quand aucun fichier n'est ouvrable la base est en memoire avec le drapeau ephemere`() {
        val diagnostics = DatabaseInitDiagnostics()
        val health = StorageHealth()
        val build = { ctx: Context, location: DatabaseLocation ->
            if (location is DatabaseLocation.Named) throw SQLiteException("SQLITE_FULL")
            realBuild(ctx, location)
        }

        val database = opener("all-down.db", diagnostics, health, build).open()

        assertThat(health.isEphemeral).isTrue()
        assertThat(diagnostics.events.value.map { it.stage }).contains(DatabaseInitStage.FELL_BACK_MEMORY)
        assertThat(database.openHelper.writableDatabase.isOpen).isTrue()
        database.close()
    }

    @Test
    fun `le rapport de crash porte les jalons et le premier echec`() {
        val diagnostics = DatabaseInitDiagnostics()
        diagnostics.record(DatabaseInitStage.FIRST_FAILURE, SQLiteException("boom"))
        diagnostics.record(DatabaseInitStage.QUARANTINED, "meeshy.db")

        val attributes = diagnostics.crashReportAttributes()

        assertThat(attributes["db.init.stages"]).isEqualTo("FIRST_FAILURE,QUARANTINED")
        assertThat(attributes["db.init.first_failure"]).contains("boom")
        assertThat(DatabaseInitDiagnostics().crashReportAttributes()).isEmpty()
    }
}
