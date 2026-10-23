package me.meeshy.core.database.migration

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.sqlite.db.SupportSQLiteDatabase
import com.google.common.truth.Truth.assertThat
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.core.database.search.SearchIndexSchema
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.io.File

private fun SupportSQLiteDatabase.userTables(): Set<String> =
    rows("SELECT name FROM sqlite_master WHERE type = 'table'").flatten().filterNotNull()
        .filterNot { it.startsWith("sqlite_") || it.startsWith("android_") || it == "room_master_table" }
        .toSet()

private fun SupportSQLiteDatabase.shape(table: String): List<List<String?>> =
    rows("SELECT name, type, \"notnull\", pk FROM pragma_table_info('$table') ORDER BY cid") +
        rows("SELECT name FROM pragma_index_list('$table') ORDER BY name")

@RunWith(RobolectricTestRunner::class)
class DurableTablesGuardTest {

    private fun freshDatabase() =
        Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext(), MeeshyDatabase::class.java).build()

    @Test
    fun `chaque table du schema est classee durable ou cache, jamais les deux`() {
        val room = freshDatabase()
        val tables = room.openHelper.writableDatabase.userTables()
        room.close()

        val unclassified = (tables - DurableTables.names - CacheTables.names).filterNot(SearchIndexSchema::owns)
        assertThat(unclassified).isEmpty()
        assertThat(DurableTables.names intersect CacheTables.names).isEmpty()
        assertThat(tables).containsAtLeastElementsIn(DurableTables.names + CacheTables.names)
    }

    @Test
    fun `la reconstruction des caches redonne exactement la forme que Room valide`() {
        val room = freshDatabase()
        val db = room.openHelper.writableDatabase
        val before = CacheTables.names.associateWith(db::shape)

        CacheReset.run(db)

        assertThat(CacheTables.names.associateWith(db::shape)).isEqualTo(before)
        room.close()
    }

    @Test
    fun `la reinitialisation des caches laisse les tables durables intactes`() {
        val room = freshDatabase()
        val db = room.openHelper.writableDatabase
        db.seedV16()

        CacheReset.run(db)

        assertThat(db.rows("SELECT cmid, state FROM outbox ORDER BY cmid"))
            .containsExactly(listOf("c1", "PENDING"), listOf("c2", "INFLIGHT")).inOrder()
        assertThat(db.rows("SELECT COUNT(*) FROM messages")).containsExactly(listOf("0"))
        room.close()
    }

    @Test
    fun `le module de base de donnees n'utilise plus de repli destructif global`() {
        val source = File("src/main/kotlin/me/meeshy/core/database/DatabaseModule.kt").readText()

        assertThat(source).doesNotContain("fallbackToDestructiveMigration()")
        assertThat(source).doesNotContain("fallbackToDestructiveMigrationOnDowngrade")
    }
}
