package me.meeshy.sdk.model.cache

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** The cursor is persisted next to the cached list so a cold start resumes scrolling where it stopped. */
class PaginationCursorTest {

    @Test
    fun `a cursor survives a persistence round trip`() {
        val cursor = PaginationCursor(nextCursor = "65f1c0ffee", hasMore = true)

        assertThat(PaginationCursor.fromJson(cursor.toJson())).isEqualTo(cursor)
    }

    @Test
    fun `an exhausted cursor with no handle survives a round trip`() {
        val cursor = PaginationCursor(nextCursor = null, hasMore = false)

        assertThat(PaginationCursor.fromJson(cursor.toJson())).isEqualTo(cursor)
    }

    @Test
    fun `the wire keys match the iOS PaginationCursor`() {
        val json = PaginationCursor(nextCursor = "abc", hasMore = true).toJson()

        assertThat(json).contains("\"nextCursor\":\"abc\"")
        assertThat(json).contains("\"hasMore\":true")
    }

    @Test
    fun `an iOS-shaped payload decodes`() {
        val decoded = PaginationCursor.fromJson("""{"nextCursor":"m9","hasMore":false}""")

        assertThat(decoded).isEqualTo(PaginationCursor(nextCursor = "m9", hasMore = false))
    }

    @Test
    fun `a payload without a handle decodes to a null handle`() {
        assertThat(PaginationCursor.fromJson("""{"hasMore":false}"""))
            .isEqualTo(PaginationCursor(nextCursor = null, hasMore = false))
    }

    @Test
    fun `unknown keys written by a newer build are tolerated`() {
        assertThat(PaginationCursor.fromJson("""{"nextCursor":"a","hasMore":true,"pageSize":50}"""))
            .isEqualTo(PaginationCursor(nextCursor = "a", hasMore = true))
    }

    @Test
    fun `a corrupt or missing payload restores to no cursor instead of throwing`() {
        assertThat(PaginationCursor.fromJson(null)).isNull()
        assertThat(PaginationCursor.fromJson("")).isNull()
        assertThat(PaginationCursor.fromJson("not json")).isNull()
        assertThat(PaginationCursor.fromJson("""{"nextCursor":"a"}""")).isNull()
    }
}
