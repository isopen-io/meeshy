package me.meeshy.sdk.net.api

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.FriendRequestAction
import me.meeshy.sdk.net.JsonConverterFactory
import me.meeshy.sdk.net.MeeshyApi
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Protocol
import okhttp3.Request
import okhttp3.Response
import okhttp3.ResponseBody.Companion.toResponseBody
import okio.Buffer
import org.junit.Test
import retrofit2.Retrofit

/**
 * Les demandes d'amis Android parlent a l'adresse CANONIQUE de l'annuaire (#4162,
 * #4254) : un geste = un `PATCH /directory/friend-requests/{id}` portant une
 * ACTION, une lecture = `GET /directory/friend-requests` par CURSEUR.
 *
 * ## Pourquoi la requete est CAPTUREE au dernier maillon
 *
 * Lire l'annotation `@PATCH` prouve ce qui est ecrit, pas ce qui part : le verbe,
 * le chemin complet, les parametres de requete omis quand ils sont `null` et le
 * CORPS serialise par le `Json` de [MeeshyApi] vivent dans Retrofit. La requete est
 * donc retenue juste avant le reseau et son corps relu octet a octet (modele :
 * `PublicProfileEndpointTest`).
 */
class FriendEndpointTest {

    private val baseUrl = "https://gate.staging.meeshy.me/api/v1/"

    private class Capture {
        var request: Request? = null
        var body: String? = null
    }

    private fun apiServing(body: String, capture: Capture): FriendApi {
        val client = OkHttpClient.Builder()
            .addInterceptor { chain ->
                capture.request = chain.request()
                capture.body = chain.request().body?.let { sent ->
                    Buffer().also { sent.writeTo(it) }.readUtf8()
                }
                Response.Builder()
                    .request(chain.request())
                    .protocol(Protocol.HTTP_1_1)
                    .code(200)
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
            .create(FriendApi::class.java)
    }

    private val servedRequest = """
        {
          "success": true,
          "data": {
            "id": "68c0000000000000000000r1",
            "senderId": "68b0000000000000000000a1",
            "receiverId": "68b0000000000000000000a2",
            "message": null,
            "status": "accepted",
            "sender": { "id": "68b0000000000000000000a1", "username": "alice", "isOnline": true },
            "receiver": { "id": "68b0000000000000000000a2", "username": "me" },
            "createdAt": "2026-10-01T10:00:00.000Z",
            "conversation": { "id": "68d0000000000000000000c1", "identifier": "direct-alice-me", "type": "direct" }
          }
        }
    """.trimIndent()

    private val servedDeletion = """
        { "success": true, "data": { "id": "68c0000000000000000000r1", "deleted": true, "message": "Friend request removed" } }
    """.trimIndent()

    // --- 1. Les gestes : un verbe, une adresse, un corps -------------------

    @Test
    fun `accepting a request is a PATCH on the canonical address with action accept`() = runTest {
        val capture = Capture()
        apiServing(servedRequest, capture)
            .act("68c0000000000000000000r1", FriendRequestAction.Accept.body())

        assertThat(capture.request!!.method).isEqualTo("PATCH")
        assertThat(capture.request!!.url.encodedPath)
            .isEqualTo("/api/v1/directory/friend-requests/68c0000000000000000000r1")
        assertThat(capture.body).isEqualTo("""{"action":"accept"}""")
    }

    @Test
    fun `refusing a request sends action reject on the same address`() = runTest {
        val capture = Capture()
        apiServing(servedRequest, capture)
            .act("68c0000000000000000000r1", FriendRequestAction.Reject.body())

        assertThat(capture.request!!.url.encodedPath)
            .isEqualTo("/api/v1/directory/friend-requests/68c0000000000000000000r1")
        assertThat(capture.body).isEqualTo("""{"action":"reject"}""")
    }

    @Test
    fun `an accept answer decodes although it carries the conversation the model ignores`() = runTest {
        val capture = Capture()
        val answer = apiServing(servedRequest, capture)
            .act("68c0000000000000000000r1", FriendRequestAction.Accept.body())

        assertThat(answer.data!!.id).isEqualTo("68c0000000000000000000r1")
        assertThat(answer.data!!.status).isEqualTo("accepted")
        assertThat(answer.data!!.sender!!.username).isEqualTo("alice")
    }

    @Test
    fun `cancelling a sent request is the same PATCH with action dismiss, never a DELETE`() = runTest {
        val capture = Capture()
        apiServing(servedDeletion, capture)
            .actRemoving("68c0000000000000000000r1", FriendRequestAction.Dismiss.body())

        assertThat(capture.request!!.method).isEqualTo("PATCH")
        assertThat(capture.request!!.url.encodedPath)
            .isEqualTo("/api/v1/directory/friend-requests/68c0000000000000000000r1")
        assertThat(capture.body).isEqualTo("""{"action":"dismiss"}""")
    }

    @Test
    fun `a dismiss answer carries no request - it decodes as the deletion receipt`() = runTest {
        val capture = Capture()
        val answer = apiServing(servedDeletion, capture)
            .actRemoving("68c0000000000000000000r1", FriendRequestAction.Dismiss.body())

        assertThat(answer.success).isTrue()
        assertThat(answer.data!!.deleted).isTrue()
        assertThat(answer.data!!.id).isEqualTo("68c0000000000000000000r1")
    }

    // --- 2. La lecture par curseur -----------------------------------------

    private fun page(vararg ids: String, hasMore: Boolean, nextCursor: String?) = buildString {
        append("""{"success":true,"data":[""")
        append(
            ids.joinToString(",") {
                """{"id":"$it","senderId":"s","receiverId":"r","status":"accepted"}"""
            },
        )
        append("""],"pagination":{"hasMore":$hasMore,"nextCursor":""")
        append(if (nextCursor == null) "null" else "\"$nextCursor\"")
        append(""","limit":100}}""")
    }

    @Test
    fun `the accepted-friend read asks both directions, accepted only, a hundred at a time`() = runTest {
        val capture = Capture()
        apiServing(page("r1", hasMore = false, nextCursor = null), capture)
            .friendRequests(direction = "any", status = "accepted", limit = 100)

        assertThat(capture.request!!.method).isEqualTo("GET")
        assertThat(capture.request!!.url.encodedPath).isEqualTo("/api/v1/directory/friend-requests")
        assertThat(capture.request!!.url.queryParameter("direction")).isEqualTo("any")
        assertThat(capture.request!!.url.queryParameter("status")).isEqualTo("accepted")
        assertThat(capture.request!!.url.queryParameter("limit")).isEqualTo("100")
        assertThat(capture.request!!.url.queryParameter("cursor")).isNull()
    }

    @Test
    fun `the next page carries the cursor the previous page returned`() = runTest {
        val capture = Capture()
        apiServing(page("r1", hasMore = false, nextCursor = null), capture)
            .friendRequests(direction = "any", status = "accepted", cursor = "2026-10-01T10:00:00.000Z", limit = 100)

        assertThat(capture.request!!.url.queryParameter("cursor")).isEqualTo("2026-10-01T10:00:00.000Z")
    }

    @Test
    fun `parameters left unset are not sent at all`() = runTest {
        val capture = Capture()
        apiServing(page("r1", hasMore = false, nextCursor = null), capture)
            .friendRequests(direction = "received", status = "pending")

        assertThat(capture.request!!.url.queryParameterNames).containsExactly("direction", "status")
    }

    @Test
    fun `a served page decodes its rows and its cursor`() = runTest {
        val capture = Capture()
        val answer = apiServing(page("r1", "r2", hasMore = true, nextCursor = "cur-2"), capture)
            .friendRequests(direction = "any", status = "accepted", limit = 100)

        assertThat(answer.data!!.map { it.id }).containsExactly("r1", "r2").inOrder()
        assertThat(answer.pagination!!.hasMore).isTrue()
        assertThat(answer.pagination!!.nextCursor).isEqualTo("cur-2")
    }

    // --- 3. Le contour d'avatar servi avec la personne ----------------------

    @Test
    fun `a person's served avatar ring rides on the request`() = runTest {
        val capture = Capture()
        val body = """
            {"success":true,"data":[{"id":"r1","status":"pending",
              "sender":{"id":"u1","username":"alice",
                "profileDecor":{"avatarRing":{"pack":"p","item":"i","origin":"builtin"}}}}]}
        """.trimIndent()
        val answer = apiServing(body, capture).friendRequests(direction = "received", status = "pending")

        assertThat(answer.data!!.single().sender!!.profileDecor).isNotNull()
    }

    @Test
    fun `a malformed decor never sinks the request that carries it`() = runTest {
        val capture = Capture()
        val body = """
            {"success":true,"data":[{"id":"r1","status":"pending",
              "sender":{"id":"u1","username":"alice","profileDecor":"not-an-object"}}]}
        """.trimIndent()
        val answer = apiServing(body, capture).friendRequests(direction = "received", status = "pending")

        val sender = answer.data!!.single().sender!!
        assertThat(sender.id).isEqualTo("u1")
        assertThat(sender.username).isEqualTo("alice")
    }
}
