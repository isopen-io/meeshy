package me.meeshy.sdk.pack

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.mockk
import java.io.IOException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import me.meeshy.sdk.net.api.PackAssetsApi
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.assertThrows
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import retrofit2.HttpException
import retrofit2.Response

class PackAssetFetcherTest {

    @get:Rule val folder = TemporaryFolder()

    private fun http(code: Int) = HttpException(Response.error<Unit>(code, "{}".toResponseBody()))

    @Test
    fun `the body is read bounded to the declared size plus one`() = runBlocking<Unit> {
        val ref = packRef("abc")
        val api = mockk<PackAssetsApi>()
        coEvery { api.file(ref.src) } returns "abcdefgh".toResponseBody()

        assertThat(PackAssetHttpFetcher(api).fetch(ref).size).isEqualTo(4)
    }

    @Test
    fun `an oversized body fails the store digest check`() {
        val ref = packRef("abc")
        val api = mockk<PackAssetsApi>()
        coEvery { api.file(ref.src) } returns "abcdef".toResponseBody()
        val store = ContentAddressedStore(folder.newFolder(), PackAssetHttpFetcher(api), Dispatchers.IO)

        assertThrows(DigestMismatchException::class.java) { runBlocking { store.data(ref) } }
    }

    @Test
    fun `a 404 is not found`() {
        val ref = packRef("abc")
        val api = mockk<PackAssetsApi>()
        coEvery { api.file(ref.src) } throws http(404)

        assertThrows(PackAssetFetchException.NotFound::class.java) { runBlocking { PackAssetHttpFetcher(api).fetch(ref) } }
    }

    @Test
    fun `another status is an http failure carrying its code`() {
        val ref = packRef("abc")
        val api = mockk<PackAssetsApi>()
        coEvery { api.file(ref.src) } throws http(503)

        val error = assertThrows(PackAssetFetchException.Http::class.java) { runBlocking { PackAssetHttpFetcher(api).fetch(ref) } }
        assertThat(error.code).isEqualTo(503)
    }

    @Test
    fun `a cut connection is a network failure`() {
        val ref = packRef("abc")
        val api = mockk<PackAssetsApi>()
        coEvery { api.file(ref.src) } throws IOException("reset")

        assertThrows(PackAssetFetchException.Network::class.java) { runBlocking { PackAssetHttpFetcher(api).fetch(ref) } }
    }
}
