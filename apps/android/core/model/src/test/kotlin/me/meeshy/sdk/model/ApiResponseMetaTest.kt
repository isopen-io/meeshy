package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import org.junit.Test

class ApiResponseMetaTest {
    private val json = Json { ignoreUnknownKeys = true }
    private fun decode(s: String) = json.decodeFromString<ApiResponse<List<String>>>(s)

    @Test
    fun `toutes les cles du bloc meta sont decodees`() {
        val meta = decode(
            """{"success":true,"data":[],"meta":{"deletedConversationIds":["c1"],"deletedConversationIdsTruncated":true,
            "deletedStoryIds":["s1","s2"],"deletedStoryIdsTruncated":false,"feedRequestId":"f","searchId":"q"}}""",
        ).meta!!
        assertThat(meta.deletedConversationIds).containsExactly("c1")
        assertThat(meta.deletedConversationIdsTruncated).isTrue()
        assertThat(meta.deletedStoryIds).containsExactly("s1", "s2").inOrder()
        assertThat(meta.deletedStoryIdsTruncated).isFalse()
        assertThat(meta.feedRequestId).isEqualTo("f")
        assertThat(meta.searchId).isEqualTo("q")
    }

    @Test
    fun `un meta absent se lit null`() {
        assertThat(decode("""{"success":true,"data":[]}""").meta).isNull()
    }

    @Test
    fun `des cles inconnues ne font pas echouer`() {
        val meta = decode("""{"success":true,"data":[],"meta":{"futur":1,"searchId":"q"}}""").meta!!
        assertThat(meta.searchId).isEqualTo("q")
        assertThat(meta.conversationTombstones).isNull()
    }

    @Test
    fun `un drapeau Truncated vrai est une liste incomplete jamais exhaustive`() {
        val t = ApiResponseMeta(deletedStoryIds = listOf("s"), deletedStoryIdsTruncated = true).storyTombstones
        assertThat(t).isInstanceOf(DeletionTombstones.Incomplete::class.java)
        assertThat(t!!.ids).containsExactly("s")
    }

    @Test
    fun `sans drapeau les tombstones servis sont complets`() {
        val t = ApiResponseMeta(deletedConversationIds = listOf("c")).conversationTombstones
        assertThat(t).isEqualTo(DeletionTombstones.Complete(listOf("c")))
    }

    @Test
    fun `pagination curseur et offset sont distinguees`() {
        val p = Pagination(total = 40, offset = 20, limit = 20, hasMore = true, nextCursor = "abc")
        assertThat(p.cursorPage.nextCursor).isEqualTo("abc")
        assertThat(p.offsetPage!!.total).isEqualTo(40)
        assertThat(Pagination(hasMore = true, nextCursor = "x").offsetPage).isNull()
    }
}
