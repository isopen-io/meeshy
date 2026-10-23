package me.meeshy.core.database.search

import android.database.sqlite.SQLiteDatabase
import com.google.common.truth.Truth.assertThat
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class FtsTokenizerFallbackTest {

    @Test
    fun `un SQLite d'avant 3 27 prend le repli remove_diacritics=1`() {
        assertThat(SearchIndexSchema.removeDiacriticsFor("3.22.0")).isEqualTo(1)
        assertThat(SearchIndexSchema.removeDiacriticsFor("3.26.9")).isEqualTo(1)
        assertThat(SearchIndexSchema.removeDiacriticsFor("")).isEqualTo(1)
    }

    @Test
    fun `un SQLite recent prend remove_diacritics=2`() {
        assertThat(SearchIndexSchema.removeDiacriticsFor("3.27.0")).isEqualTo(2)
        assertThat(SearchIndexSchema.removeDiacriticsFor("3.45.1")).isEqualTo(2)
        assertThat(SearchIndexSchema.removeDiacriticsFor("4.0.0")).isEqualTo(2)
    }

    @Test
    fun `les deux formes du tokenizer replient les accents`() {
        listOf(1, 2).forEach { option ->
            val db = SQLiteDatabase.create(null)
            db.execSQL("CREATE TABLE messages (id TEXT PRIMARY KEY, contentText TEXT)")
            db.execSQL(SearchIndexSchema.statements(option).first())
            db.execSQL("INSERT INTO message_fts(docid, contentText) VALUES (1, 'Un été à l''ÉCOLE')")

            val hits = db.rawQuery("SELECT docid FROM message_fts WHERE message_fts MATCH 'ete* ecole*'", null).use { it.count }

            assertThat(hits).isEqualTo(1)
            db.close()
        }
    }
}
