package me.meeshy.sdk.audio

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.Pagination
import me.meeshy.sdk.model.composer.sound.ApiSound
import me.meeshy.sdk.model.composer.sound.RenameSoundRequest
import me.meeshy.sdk.model.composer.sound.SoundRemoval
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.SoundLibraryApi
import org.junit.Test

class SoundLibraryRepositoryTest {
    private val api: SoundLibraryApi = mockk()
    private val repository = SoundLibraryRepository(api)
    private fun sound(id: String, title: String = "", user: String = "ana") =
        ApiSound(id = id, title = title, fileUrl = "u", uploader = me.meeshy.sdk.model.composer.sound.ApiSoundUploader("x", user))

    @Test
    fun `my sounds come with the cursor of the next page and are searched locally`() = runTest {
        coEvery { api.mine(null, 30) } returns ApiResponse(
            success = true,
            data = listOf(sound("a", "Été"), sound("b", "Autre", user = "belva")),
            pagination = Pagination(hasMore = true, nextCursor = "2026-10-20T10:00:00.000Z"),
        )

        val page = (repository.mine(query = "ete", cursor = null) as NetworkResult.Success).data

        assertThat(page.sounds.map { it.id }).containsExactly("a")
        assertThat(page.nextCursor).isEqualTo("2026-10-20T10:00:00.000Z")
    }

    @Test
    fun `the last page has no cursor`() = runTest {
        coEvery { api.mine("c1", 30) } returns ApiResponse(
            success = true, data = listOf(sound("a")), pagination = Pagination(hasMore = false, nextCursor = "ignored"),
        )
        val page = (repository.mine(query = null, cursor = "c1") as NetworkResult.Success).data
        assertThat(page.nextCursor).isNull()
    }

    @Test
    fun `trending sends a trimmed server search and nothing when empty`() = runTest {
        coEvery { api.trending("ana", 30) } returns ApiResponse(success = true, data = listOf(sound("a")))
        coEvery { api.trending(null, 30) } returns ApiResponse(success = true, data = emptyList())

        assertThat((repository.trending(" ana ") as NetworkResult.Success).data).hasSize(1)
        assertThat((repository.trending("  ") as NetworkResult.Success).data).isEmpty()
    }

    @Test
    fun `rename and remove return the server truth`() = runTest {
        coEvery { api.rename("a", RenameSoundRequest("Nouveau")) } returns ApiResponse(success = true, data = sound("a", "Nouveau"))
        coEvery { api.remove("a") } returns ApiResponse(success = true, data = SoundRemoval("a", "2026-10-27T00:00:00Z", 3))

        assertThat((repository.rename("a", "Nouveau") as NetworkResult.Success).data.title).isEqualTo("Nouveau")
        assertThat((repository.remove("a") as NetworkResult.Success).data.postCount).isEqualTo(3)
    }

    @Test
    fun `a refused call is a failure, never an exception`() = runTest {
        coEvery { api.remove("a") } returns ApiResponse(success = false, code = "NOT_SOUND_OWNER", error = "no")
        assertThat(repository.remove("a")).isInstanceOf(NetworkResult.Failure::class.java)
    }
}
