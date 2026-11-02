package me.meeshy.sdk.net.api

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import org.junit.Test

class DirectoryApiRoutesTest {

    @Test
    fun `presence asks the canonical address and keeps an absent entry absent`() = runTest {
        val http = RecordingHttp(
            responseBody = """{"success":true,"data":{"users":[{"userId":"a","isOnline":true,"lastActiveAt":"2026-10-23T10:00:00.000Z"}]}}""",
        )
        val response = http.serve(DirectoryApi::class.java).presence("a,b")

        assertThat(http.only.method).isEqualTo("GET")
        assertThat(http.only.path).isEqualTo("/api/v1/directory/presence")
        assertThat(http.only.queryParameter("ids")).isEqualTo("a,b")
        assertThat(response.data!!.users.map { it.userId }).containsExactly("a")
    }

    @Test
    fun `the legacy presence alias is still a GET on users presence`() = runTest {
        val http = RecordingHttp(responseBody = """{"success":true,"data":{"users":[]}}""")
        http.serve(DirectoryApi::class.java).legacyPresence("a")

        assertThat(http.only.path).isEqualTo("/api/v1/users/presence")
    }
}
