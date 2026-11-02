package me.meeshy.sdk.user

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.Pagination
import me.meeshy.sdk.model.contacts.DirectoryContact
import me.meeshy.sdk.net.api.ContactDirectoryApi
import me.meeshy.sdk.net.api.DirectoryApi
import me.meeshy.sdk.net.api.PresenceEntry
import me.meeshy.sdk.net.api.PresenceSnapshot
import org.junit.Test

class DirectoryRepositoryTest {

    private fun contact(id: String) = DirectoryContact(id = id)

    @Test
    fun `presence served for some ids leaves the others absent`() = runTest {
        val api = mockk<DirectoryApi>()
        coEvery { api.presence("a,b") } returns ApiResponse(
            success = true,
            data = PresenceSnapshot(listOf(PresenceEntry("a", isOnline = true))),
        )
        val served = DirectoryRepository(mockk(), api).presence(listOf("a", "b", "a")).getOrNull()!!

        assertThat(served.keys).containsExactly("a")
        assertThat(served["b"]).isNull()
    }

    @Test
    fun `presence without ids asks nothing`() = runTest {
        val api = mockk<DirectoryApi>()
        val served = DirectoryRepository(mockk(), api).presence(emptyList()).getOrNull()!!

        assertThat(served).isEmpty()
        coVerify(exactly = 0) { api.presence(any()) }
    }

    @Test
    fun `listAll follows the cursor until the server says there is no more`() = runTest {
        val api = mockk<ContactDirectoryApi>()
        coEvery { api.page(limit = 2, filter = "all", cursor = null, query = null, updatedSince = null) } returns
            ApiResponse(true, listOf(contact("1"), contact("2")), pagination = Pagination(hasMore = true, nextCursor = "2"))
        coEvery { api.page(limit = 2, filter = "all", cursor = "2", query = null, updatedSince = null) } returns
            ApiResponse(true, listOf(contact("3")), pagination = Pagination(hasMore = false))

        val all = DirectoryRepository(api, mockk()).listAll(pageSize = 2).getOrNull()!!

        assertThat(all.map { it.id }).containsExactly("1", "2", "3").inOrder()
    }

    @Test
    fun `hasMore trusts the server and falls back on a full page`() {
        assertThat(DirectoryRepository.hasMore(0, 100, true)).isFalse()
        assertThat(DirectoryRepository.hasMore(10, 100, true)).isTrue()
        assertThat(DirectoryRepository.hasMore(100, 100, null)).isTrue()
        assertThat(DirectoryRepository.hasMore(99, 100, null)).isFalse()
    }
}
