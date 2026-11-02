package me.meeshy.sdk.net.api

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.composer.sound.RenameSoundRequest
import org.junit.Test

class SoundLibraryApiRoutesTest {
    private val sound = """{"id":"s1","title":"T","fileUrl":"https://x/a.m4a","postCount":2}"""

    @Test
    fun `my sounds page by cursor`() = runTest {
        val http = RecordingHttp(responseBody = """{"success":true,"data":[$sound],"pagination":{"limit":30,"hasMore":true,"nextCursor":"2026-10-20T10:00:00.000Z"}}""")

        val page = http.serve(SoundLibraryApi::class.java).mine(cursor = "2026-10-21T00:00:00.000Z", limit = 30)

        assertThat(http.only.method).isEqualTo("GET")
        assertThat(http.only.path).isEqualTo("/api/v1/sounds/mine")
        assertThat(http.only.queryParameter("cursor")).isEqualTo("2026-10-21T00:00:00.000Z")
        assertThat(http.only.queryParameter("limit")).isEqualTo("30")
        assertThat(page.data!!.single().postCount).isEqualTo(2)
        assertThat(page.pagination!!.nextCursor).isEqualTo("2026-10-20T10:00:00.000Z")
    }

    @Test
    fun `trending searches title or handle on the server`() = runTest {
        val http = RecordingHttp(responseBody = """{"success":true,"data":[$sound]}""")

        http.serve(SoundLibraryApi::class.java).trending(query = "ana", limit = 30)

        assertThat(http.only.path).isEqualTo("/api/v1/stories/audio")
        assertThat(http.only.queryParameter("q")).isEqualTo("ana")
    }

    @Test
    fun `an empty search sends no q`() = runTest {
        val http = RecordingHttp(responseBody = """{"success":true,"data":[]}""")

        http.serve(SoundLibraryApi::class.java).trending(query = null, limit = 30)

        assertThat(http.only.hasQueryParameter("q")).isFalse()
    }

    @Test
    fun `renaming patches the title and removal deletes logically`() = runTest {
        val http = RecordingHttp(responseBody = """{"success":true,"data":$sound}""")
        http.serve(SoundLibraryApi::class.java).rename("s1", RenameSoundRequest(""))
        assertThat(http.only.method).isEqualTo("PATCH")
        assertThat(http.only.path).isEqualTo("/api/v1/sounds/s1")

        val gone = RecordingHttp(responseBody = """{"success":true,"data":{"id":"s1","deletedAt":"2026-10-27T00:00:00.000Z","postCount":3}}""")
        val removal = gone.serve(SoundLibraryApi::class.java).remove("s1")
        assertThat(gone.only.method).isEqualTo("DELETE")
        assertThat(removal.data!!.postCount).isEqualTo(3)
    }
}
