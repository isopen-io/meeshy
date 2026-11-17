package me.meeshy.sdk.profile

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.profile.MyAddressWire
import me.meeshy.sdk.model.profile.MyAddressesPayload
import me.meeshy.sdk.net.api.MyAddressesApi
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Test
import retrofit2.HttpException
import retrofit2.Response
import java.io.IOException

class MyAddressesRepositoryTest {

    private class Served(var answer: () -> ApiResponse<MyAddressesPayload>) : MyAddressesApi {
        override suspend fun list(): ApiResponse<MyAddressesPayload> = answer()
    }

    private val one = MyAddressWire(id = "a", title = "Site", url = "https://aissandiaye.studio", glyph = "site", position = 0, isShown = true, clicks = 3)

    private fun served(vararg rows: MyAddressWire) = ApiResponse(success = true, data = MyAddressesPayload(addresses = rows.toList()))

    @Test
    fun `un serveur qui les sert les rend decodees et les garde pour la prochaine peinture`() = runTest {
        val repository = MyAddressesRepository(Served { served(one) })

        assertThat(repository.cached()).isNull()
        assertThat(repository.refresh()?.map { it.id }).containsExactly("a")
        assertThat(repository.cached()?.map { it.id }).containsExactly("a")
    }

    @Test
    fun `un serveur qui ne les sert pas encore rend une liste vide, jamais une erreur`() = runTest {
        val repository = MyAddressesRepository(Served { throw HttpException(Response.error<Any>(404, "".toResponseBody())) })

        assertThat(repository.refresh()).isEmpty()
    }

    @Test
    fun `hors ligne la derniere liste est gardee et rien n'est invente`() = runTest {
        val api = Served { served(one) }
        val repository = MyAddressesRepository(api)
        repository.refresh()
        api.answer = { throw IOException("offline") }

        assertThat(repository.refresh()).isNull()
        assertThat(repository.cached()?.map { it.id }).containsExactly("a")
    }

    @Test
    fun `la deconnexion vide la liste du compte`() = runTest {
        val repository = MyAddressesRepository(Served { served(one) })
        repository.refresh()

        repository.clear()

        assertThat(repository.cached()).isNull()
    }
}
