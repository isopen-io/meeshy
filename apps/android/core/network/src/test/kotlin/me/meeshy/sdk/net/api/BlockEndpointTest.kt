package me.meeshy.sdk.net.api

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.net.JsonConverterFactory
import me.meeshy.sdk.net.MeeshyApi
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Protocol
import okhttp3.Request
import okhttp3.Response
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Test
import retrofit2.Retrofit

/**
 * Le blocage Android parle aux adresses CANONIQUES de l'annuaire (#4164) :
 * `PUT` / `DELETE /directory/blocks/:userId` et `GET /directory/blocks`.
 *
 * ## Pourquoi la requete est CAPTUREE au dernier maillon
 *
 * Lire l'annotation `@PUT` prouve ce qui est ecrit, pas ce qui part. Le verbe,
 * la concatenation avec le chemin de base et le decodage de la reponse vivent
 * dans Retrofit et dans le `Json` de [MeeshyApi] : la suite remonte donc toute
 * la chaine reelle (modele : `PublicProfileEndpointTest`).
 *
 * ## Pourquoi cela touche la file hors ligne
 *
 * Les lignes `BLOCK_USER` / `UNBLOCK_USER` deja en file au moment de la mise a
 * jour de l'app ne portent que l'identifiant de la cible : le chemin n'est
 * jamais grave dans la ligne. Rejouees par [BlockApi], elles partent donc sur
 * les nouvelles routes sans migration de la file — c'est ce que ces temoins
 * etablissent.
 */
class BlockEndpointTest {

    private val baseUrl = "https://gate.staging.meeshy.me/api/v1/"

    private class Capture {
        var request: Request? = null
    }

    private fun apiServing(body: String, capture: Capture, status: Int = 200): BlockApi {
        val client = OkHttpClient.Builder()
            .addInterceptor { chain ->
                capture.request = chain.request()
                Response.Builder()
                    .request(chain.request())
                    .protocol(Protocol.HTTP_1_1)
                    .code(status)
                    .message("OK")
                    .body(body.toResponseBody("application/json".toMediaType()))
                    .build()
            }
            .build()

        return Retrofit.Builder()
            .baseUrl(baseUrl)
            .client(client)
            .addConverterFactory(
                JsonConverterFactory(MeeshyApi.json, "application/json".toMediaType()),
            )
            .build()
            .create(BlockApi::class.java)
    }

    private val blockedPage = """
        {
          "success": true,
          "data": [
            { "id": "68b0000000000000000000a1", "username": "alice", "displayName": "Alice", "avatar": null },
            { "id": "68b0000000000000000000a2", "username": "bob", "displayName": null, "avatar": "https://cdn.meeshy.me/b.jpg" }
          ],
          "pagination": { "hasMore": true, "nextCursor": "68b0000000000000000000a2", "limit": 100 }
        }
    """.trimIndent()

    // --- La liste -----------------------------------------------------------

    @Test
    fun `listing the blocked users is a GET on the canonical directory address`() = runTest {
        val capture = Capture()
        apiServing(blockedPage, capture).listBlocked()

        assertThat(capture.request!!.method).isEqualTo("GET")
        assertThat(capture.request!!.url.encodedPath).isEqualTo("/api/v1/directory/blocks")
    }

    @Test
    fun `a listing page forwards its cursor and its limit`() = runTest {
        val capture = Capture()
        apiServing(blockedPage, capture).listBlocked(cursor = "68b0000000000000000000a2", limit = 100)

        assertThat(capture.request!!.url.queryParameter("cursor")).isEqualTo("68b0000000000000000000a2")
        assertThat(capture.request!!.url.queryParameter("limit")).isEqualTo("100")
    }

    @Test
    fun `the first listing page sends neither a cursor nor a limit it was not given`() = runTest {
        val capture = Capture()
        apiServing(blockedPage, capture).listBlocked()

        assertThat(capture.request!!.url.queryParameterNames).isEmpty()
    }

    @Test
    fun `a served page decodes its rows and the cursor to the next one`() = runTest {
        val capture = Capture()
        val response = apiServing(blockedPage, capture).listBlocked()

        assertThat(response.data!!.map { it.id })
            .containsExactly("68b0000000000000000000a1", "68b0000000000000000000a2").inOrder()
        assertThat(response.data!!.last().avatar).isEqualTo("https://cdn.meeshy.me/b.jpg")
        assertThat(response.pagination!!.hasMore).isTrue()
        assertThat(response.pagination!!.nextCursor).isEqualTo("68b0000000000000000000a2")
    }

    // --- Les deux gestes ----------------------------------------------------

    @Test
    fun `blocking is a PUT on the target's membership, never a POST action`() = runTest {
        val capture = Capture()
        apiServing("""{"success":true,"data":{"message":"User blocked","blocked":true}}""", capture)
            .block("68b0000000000000000000a1")

        assertThat(capture.request!!.method).isEqualTo("PUT")
        assertThat(capture.request!!.url.encodedPath)
            .isEqualTo("/api/v1/directory/blocks/68b0000000000000000000a1")
    }

    @Test
    fun `the block answer decodes although it carries a flag the model ignores`() = runTest {
        val capture = Capture()
        val response = apiServing(
            """{"success":true,"data":{"message":"User blocked","blocked":true}}""",
            capture,
        ).block("68b0000000000000000000a1")

        assertThat(response.success).isTrue()
        assertThat(response.data!!.message).isEqualTo("User blocked")
    }

    @Test
    fun `unblocking is a DELETE on the same address`() = runTest {
        val capture = Capture()
        apiServing("""{"success":true,"data":{"message":"User unblocked"}}""", capture)
            .unblock("68b0000000000000000000a1")

        assertThat(capture.request!!.method).isEqualTo("DELETE")
        assertThat(capture.request!!.url.encodedPath)
            .isEqualTo("/api/v1/directory/blocks/68b0000000000000000000a1")
    }

    @Test
    fun `the unblock answer decodes - a too strict type would turn a server success into a client failure`() = runTest {
        val capture = Capture()
        val response = apiServing("""{"success":true,"data":{"message":"User unblocked"}}""", capture)
            .unblock("68b0000000000000000000a1")

        assertThat(response.success).isTrue()
        assertThat(response.data!!.message).isEqualTo("User unblocked")
    }
}
