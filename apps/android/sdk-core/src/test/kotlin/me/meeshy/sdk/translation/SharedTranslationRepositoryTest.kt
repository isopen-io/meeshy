package me.meeshy.sdk.translation

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.translation.ShareTranslationBody
import me.meeshy.sdk.model.translation.SharedTranslationEnvelope
import me.meeshy.sdk.model.translation.SharedTranslationKdf
import me.meeshy.sdk.model.translation.SharedTranslationShareRefusal
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.SharedTranslationApi
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Test
import retrofit2.HttpException
import retrofit2.Response

class SharedTranslationRepositoryTest {
    private fun oid(n: Int): String = n.toString(16).padStart(24, '0')

    private fun body() = ShareTranslationBody(
        messageId = oid(1),
        targetLanguage = "fr",
        sourceVersion = "original",
        envelope = SharedTranslationEnvelope.of(SharedTranslationKdf.MESSAGE_CONTENT, "A".repeat(44)),
    )

    private fun listing(vararg ids: String): ApiResponse<JsonElement> {
        val items = ids.joinToString(",") {
            """{"id":"$it","conversationId":"c","messageId":"$it","targetLanguage":"fr",
               "envelope":{"v":1,"alg":"A256GCM","kdf":"message-content","payload":"${"A".repeat(44)}"},
               "sharedBy":"u","sharedAt":"2026-10-01T00:00:00.000Z"}"""
        }
        return ApiResponse(success = true, data = Json.parseToJsonElement("""{"sharedTranslations":[$items]}"""))
    }

    private fun refusal(status: Int, code: String): HttpException {
        val json = """{"success":false,"error":"x","code":"$code"}"""
        return HttpException(Response.error<Any>(status, json.toResponseBody("application/json".toMediaType())))
    }

    @Test
    fun `un partage refuse parce que les accusés sont coupés remonte comme refus type`() = runTest {
        val api = mockk<SharedTranslationApi>()
        coEvery { api.share(any(), any()) } throws refusal(403, "SHARED_TRANSLATION_READ_RECEIPTS_OFF")
        val outcome = SharedTranslationRepository(api).share("c", body())
        assertThat(outcome).isEqualTo(ShareTranslationOutcome.Refused(SharedTranslationShareRefusal.READ_RECEIPTS_OFF))
    }

    @Test
    fun `un partage refuse parce que la source a change remonte comme refus type`() = runTest {
        val api = mockk<SharedTranslationApi>()
        coEvery { api.share(any(), any()) } throws refusal(409, "SHARED_TRANSLATION_STALE_SOURCE")
        val outcome = SharedTranslationRepository(api).share("c", body())
        assertThat(outcome).isEqualTo(ShareTranslationOutcome.Refused(SharedTranslationShareRefusal.STALE_SOURCE))
    }

    @Test
    fun `un autre refus reste une erreur`() = runTest {
        val api = mockk<SharedTranslationApi>()
        coEvery { api.share(any(), any()) } throws refusal(500, "BOOM")
        val outcome = SharedTranslationRepository(api).share("c", body())
        assertThat(outcome).isInstanceOf(ShareTranslationOutcome.Failed::class.java)
    }

    @Test
    fun `la liste vide, sans langue valable ou sans id valide ne produit aucun appel`() = runTest {
        val api = mockk<SharedTranslationApi>()
        val repo = SharedTranslationRepository(api)
        assertThat(repo.fetch("c", emptyList(), listOf("fr")).getOrNull()).isEmpty()
        assertThat(repo.fetch("c", listOf("zz"), listOf("fr")).getOrNull()).isEmpty()
        assertThat(repo.fetch("c", listOf(oid(1)), listOf("x", "")).getOrNull()).isEmpty()
        coVerify(exactly = 0) { api.list(any(), any(), any()) }
    }

    @Test
    fun `les ids partent par cent avec les langues filtrees dans l'ordre`() = runTest {
        val api = mockk<SharedTranslationApi>()
        val ids = mutableListOf<String>()
        val langs = mutableListOf<String>()
        coEvery { api.list(any(), any(), any()) } answers {
            ids += secondArg<String>()
            langs += thirdArg<String>()
            listing(oid(1))
        }
        val result = SharedTranslationRepository(api)
            .fetch("c", (1..150).map(::oid) + "bad", listOf("fr", "bad!", "en", "fr"))
        assertThat(ids.map { it.split(",").size }).containsExactly(100, 50).inOrder()
        assertThat(langs.toSet()).containsExactly("fr,en")
        assertThat((result as NetworkResult.Success).data).hasSize(2)
    }

    @Test
    fun `une enveloppe illisible est ecartee sans perdre les autres`() = runTest {
        val api = mockk<SharedTranslationApi>()
        val mixed = Json.parseToJsonElement(
            """{"sharedTranslations":[{"id":"bad"},
               {"id":"a","conversationId":"c","messageId":"m","targetLanguage":"fr",
                "envelope":{"v":1,"alg":"A256GCM","kdf":"message-content","payload":"p"},
                "sharedBy":"u","sharedAt":"t"}]}""",
        )
        coEvery { api.list(any(), any(), any()) } returns ApiResponse(success = true, data = mixed)
        val result = SharedTranslationRepository(api).fetch("c", listOf(oid(1)), listOf("fr"))
        assertThat(result.getOrNull()!!.map { it.id }).containsExactly("a")
    }
}
