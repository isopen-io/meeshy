package me.meeshy.core.database.migration

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import me.meeshy.core.database.MeeshyDatabase
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class TableRebuildTest {

    @Test
    fun `un changement de cle primaire ne perd aucune ligne et recree les index`() {
        val room = Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext(), MeeshyDatabase::class.java).build()
        val db = room.openHelper.writableDatabase
        db.execSQL("CREATE TABLE scratch (`a` TEXT NOT NULL, `b` INTEGER NOT NULL, `v` TEXT, PRIMARY KEY(`a`))")
        db.execSQL("INSERT INTO scratch VALUES ('x', 1, 'un'), ('y', 2, NULL), ('z', 1, 'trois')")

        db.rebuildTable(
            table = "scratch",
            createSql = { name -> "CREATE TABLE `$name` (`a` TEXT NOT NULL, `b` INTEGER NOT NULL, `v` TEXT, PRIMARY KEY(`a`, `b`))" },
            columnSources = mapOf("a" to "`a`", "b" to "`b`", "v" to "`v`"),
            indexSql = listOf("CREATE INDEX `index_scratch_v` ON `scratch` (`v`)"),
        )

        assertThat(db.rows("SELECT * FROM scratch ORDER BY a"))
            .containsExactly(listOf("x", "1", "un"), listOf("y", "2", null), listOf("z", "1", "trois")).inOrder()
        assertThat(db.rows("SELECT name FROM pragma_table_info('scratch') WHERE pk > 0 ORDER BY pk").flatten())
            .containsExactly("a", "b").inOrder()
        assertThat(db.rows("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'scratch'").flatten())
            .contains("index_scratch_v")
        assertThat(db.rows("SELECT name FROM sqlite_master WHERE name = 'scratch_rebuild'")).isEmpty()
        room.close()
    }
}
