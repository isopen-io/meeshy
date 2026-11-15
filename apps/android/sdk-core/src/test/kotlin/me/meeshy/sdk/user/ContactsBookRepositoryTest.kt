package me.meeshy.sdk.user

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.contacts.ContactMatchEntry
import me.meeshy.sdk.model.contacts.ContactMatchResponse
import me.meeshy.sdk.model.contacts.DirectorySyncMode
import me.meeshy.sdk.model.contacts.DirectorySyncResult
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.ContactDirectoryApi
import me.meeshy.sdk.net.api.ContactMatchApi
import me.meeshy.sdk.net.api.ContactResolveResponse
import me.meeshy.sdk.net.api.ContactsApi
import me.meeshy.sdk.net.api.PublicContactAccount
import org.junit.Test

class ContactsBookRepositoryTest {

    private fun entries(n: Int) = List(n) { ContactMatchEntry(displayName = "c$it", phoneNumbers = listOf("+33$it")) }

    private fun sync(token: String? = "T") = ApiResponse(
        success = true,
        data = DirectorySyncResult(totalContacts = 1, processedContacts = 1, syncedCount = 1, syncStartedAt = token),
    )

    @Test
    fun `matching sends bounded batches and keeps only the matches`() = runTest {
        val matchApi = mockk<ContactMatchApi>()
        coEvery { matchApi.match(any()) } returns ApiResponse(success = true, data = ContactMatchResponse())
        val repo = ContactsBookRepository(mockk(), matchApi, mockk())

        val result = repo.findRegistered(entries(5), "FR", batchSize = 2)

        assertThat(result.getOrNull()).isEmpty()
        coVerify(exactly = 3) { matchApi.match(match { it.contacts.size <= 2 && it.defaultCountry == "FR" }) }
    }

    @Test
    fun `entries without any identifier are never sent`() = runTest {
        val matchApi = mockk<ContactMatchApi>()
        val repo = ContactsBookRepository(mockk(), matchApi, mockk())

        val result = repo.findRegistered(listOf(ContactMatchEntry(displayName = "Sans rien")), "FR")

        assertThat(result.getOrNull()).isEmpty()
        coVerify(exactly = 0) { matchApi.match(any()) }
    }

    @Test
    fun `a single batch replaces with a PUT, a split book only merges with PATCHes`() = runTest {
        val api = mockk<ContactDirectoryApi>()
        coEvery { api.replace(any()) } returns sync()
        coEvery { api.merge(any()) } returns sync()
        val repo = ContactsBookRepository(api, mockk(), mockk())

        repo.syncDirectory(entries(1), DirectorySyncMode.Replace, "FR")
        coVerify(exactly = 1) { api.replace(any()) }

        repo.syncDirectory(entries(3), DirectorySyncMode.Replace, "FR", batchSize = 2)
        coVerify(exactly = 2) { api.merge(any()) }
        coVerify(exactly = 1) { api.replace(any()) }
    }

    @Test
    fun `a failing batch aborts the sync and surfaces the failure`() = runTest {
        val api = mockk<ContactDirectoryApi>()
        coEvery { api.merge(any()) } returns sync() andThen ApiResponse(success = false, error = "boom")
        val repo = ContactsBookRepository(api, mockk(), mockk())

        val result = repo.syncDirectory(entries(3), DirectorySyncMode.Replace, "FR", batchSize = 2)

        assertThat(result).isInstanceOf(NetworkResult.Failure::class.java)
        coVerify(exactly = 2) { api.merge(any()) }
    }

    @Test
    fun `resolve batches identifiers by ten and returns each registered account once`() = runTest {
        val contactsApi = mockk<ContactsApi>()
        val alice = PublicContactAccount(userId = "u1", username = "alice")
        coEvery { contactsApi.resolve(any()) } returns ApiResponse(success = true, data = ContactResolveResponse(listOf(alice)))
        val repo = ContactsBookRepository(mockk(), mockk(), contactsApi)

        val result = repo.resolveRegistered(List(25) { "+3361$it" }, emptyList(), "FR")

        assertThat(result.getOrNull()).containsExactly(alice)
        coVerify(exactly = 3) { contactsApi.resolve(match { it.phones.size <= 10 }) }
    }
}
