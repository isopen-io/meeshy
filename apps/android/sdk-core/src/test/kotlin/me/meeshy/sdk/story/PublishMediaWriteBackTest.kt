package me.meeshy.sdk.story

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.net.api.CreateStoryRequest
import org.junit.Test

class PublishMediaWriteBackTest {

    private fun payloadOf(mediaIds: List<String>?, content: String? = "hi"): String =
        MeeshyApi.json.encodeToString(
            CreateStoryRequest(content = content, mediaIds = mediaIds),
        )

    private fun mediaIdsIn(payload: String): List<String>? =
        MeeshyApi.json.decodeFromString<CreateStoryRequest>(payload).mediaIds

    @Test
    fun `grafts the real id in place of the placeholder`() {
        val payload = payloadOf(listOf("upload-cmid"))

        val rewritten = PublishMediaWriteBack.graft(payload, placeholder = "upload-cmid", realId = "real-99")

        assertThat(rewritten).isNotNull()
        assertThat(mediaIdsIn(rewritten!!)).containsExactly("real-99")
    }

    @Test
    fun `preserves the order and the other ids around the placeholder`() {
        val payload = payloadOf(listOf("a", "upload-cmid", "b"))

        val rewritten = PublishMediaWriteBack.graft(payload, placeholder = "upload-cmid", realId = "real-99")

        assertThat(mediaIdsIn(rewritten!!)).containsExactly("a", "real-99", "b").inOrder()
    }

    @Test
    fun `replaces every occurrence of the placeholder`() {
        val payload = payloadOf(listOf("upload-cmid", "x", "upload-cmid"))

        val rewritten = PublishMediaWriteBack.graft(payload, placeholder = "upload-cmid", realId = "real-99")

        assertThat(mediaIdsIn(rewritten!!)).containsExactly("real-99", "x").inOrder()
    }

    @Test
    fun `dedupes when the real id already sits in the list`() {
        val payload = payloadOf(listOf("real-99", "upload-cmid"))

        val rewritten = PublishMediaWriteBack.graft(payload, placeholder = "upload-cmid", realId = "real-99")

        assertThat(mediaIdsIn(rewritten!!)).containsExactly("real-99")
    }

    @Test
    fun `keeps the rest of the request intact`() {
        val payload = MeeshyApi.json.encodeToString(
            CreateStoryRequest(content = "caption", visibility = "FRIENDS", mediaIds = listOf("upload-cmid")),
        )

        val rewritten = PublishMediaWriteBack.graft(payload, placeholder = "upload-cmid", realId = "real-99")

        val decoded = MeeshyApi.json.decodeFromString<CreateStoryRequest>(rewritten!!)
        assertThat(decoded.content).isEqualTo("caption")
        assertThat(decoded.visibility).isEqualTo("FRIENDS")
        assertThat(decoded.mediaIds).containsExactly("real-99")
    }

    @Test
    fun `is inert when the placeholder is absent`() {
        val payload = payloadOf(listOf("other-1", "other-2"))

        val rewritten = PublishMediaWriteBack.graft(payload, placeholder = "upload-cmid", realId = "real-99")

        assertThat(rewritten).isNull()
    }

    @Test
    fun `is inert when there are no media ids`() {
        val payload = payloadOf(mediaIds = null)

        val rewritten = PublishMediaWriteBack.graft(payload, placeholder = "upload-cmid", realId = "real-99")

        assertThat(rewritten).isNull()
    }

    @Test
    fun `is inert when the media list is empty`() {
        val payload = payloadOf(mediaIds = emptyList())

        val rewritten = PublishMediaWriteBack.graft(payload, placeholder = "upload-cmid", realId = "real-99")

        assertThat(rewritten).isNull()
    }

    @Test
    fun `is inert when the real id equals the placeholder`() {
        val payload = payloadOf(listOf("upload-cmid"))

        val rewritten = PublishMediaWriteBack.graft(payload, placeholder = "upload-cmid", realId = "upload-cmid")

        assertThat(rewritten).isNull()
    }

    @Test
    fun `is inert on an undecodable payload`() {
        val rewritten = PublishMediaWriteBack.graft("not json", placeholder = "upload-cmid", realId = "real-99")

        assertThat(rewritten).isNull()
    }
}
