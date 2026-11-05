package me.meeshy.sdk.thread

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.Pagination
import me.meeshy.sdk.model.thread.ThreadReplyStatus
import me.meeshy.sdk.net.MeeshyApi
import org.junit.Assert.assertThrows
import org.junit.Test

class ThreadRepliesLoaderTest {

    private fun message(id: String, parent: String?, at: String, content: String = "c-$id", deletedAt: String? = null) =
        ApiMessage(
            id = id, conversationId = "c1", senderId = "u1", content = content,
            originalLanguage = "fr", replyToId = parent, createdAt = at, deletedAt = deletedAt,
        )

    private fun row(m: ApiMessage, state: String? = null) =
        CachedMessageRow(MeeshyApi.json.encodeToString(ApiMessage.serializer(), m), state)

    private fun loader(
        pages: List<ApiMessage> = emptyList(),
        hasMore: Boolean = false,
        cache: List<CachedMessageRow> = emptyList(),
        calls: MutableList<List<Any>> = mutableListOf(),
        fail: Boolean = false,
    ) = ThreadRepliesLoader(
        fetch = { cid, parent, limit, offset ->
            calls += listOf(cid, parent, limit, offset)
            if (fail) error("offline")
            ApiResponse(success = true, data = pages, pagination = Pagination(hasMore = hasMore))
        },
        cachedRows = { cache },
    )

    @Test
    fun `charge cinquante reponses par page sur le filtre replyToId`() = runTest {
        val calls = mutableListOf<List<Any>>()
        loader(calls = calls).load("c1", "p1", "me", listOf("fr"))
        assertThat(calls.single()).containsExactly("c1", "p1", 50, 0).inOrder()
    }

    @Test
    fun `une page rend les reponses triees et dit s'il en reste`() = runTest {
        val page = loader(
            pages = listOf(
                message("b", "p1", "2026-01-01T10:05:00Z"),
                message("a", "p1", "2026-01-01T10:00:00Z"),
                message("x", "other", "2026-01-01T10:01:00Z"),
                message("d", "p1", "2026-01-01T10:02:00Z", deletedAt = "2026-01-01T11:00:00Z"),
            ),
            hasMore = true,
        ).load("c1", "p1", "me", listOf("fr"), offset = 50)
        assertThat(page.replies.map { it.id }).containsExactly("a", "b").inOrder()
        assertThat(page.hasMore).isTrue()
    }

    @Test
    fun `un echec reseau remonte pour que l'appelant garde l'existant`() = runTest {
        assertThrows(IllegalStateException::class.java) {
            kotlinx.coroutines.runBlocking { loader(fail = true).load("c1", "p1", "me", listOf("fr")) }
        }
    }

    @Test
    fun `le cache ne rend que les reponses du parent avec leur etat d'envoi`() = runTest {
        val cached = loader(
            cache = listOf(
                row(message("a", "p1", "2026-01-01T10:00:00Z")),
                row(message("cid_1", "p1", "2026-01-01T10:09:00Z"), state = "SENDING"),
                row(message("z", "p2", "2026-01-01T10:01:00Z")),
                row(message("p1", null, "2026-01-01T09:00:00Z")),
            ),
        ).cached("c1", "p1", "me", listOf("fr"))
        assertThat(cached.map { it.id }).containsExactly("a", "cid_1").inOrder()
        assertThat(cached.last().status).isEqualTo(ThreadReplyStatus.SENDING)
    }

    @Test
    fun `une ligne de cache illisible est ignoree`() = runTest {
        val cached = loader(cache = listOf(CachedMessageRow("{nope", null))).cached("c1", "p1", "me", listOf("fr"))
        assertThat(cached).isEmpty()
    }
}
