package me.meeshy.sdk.net.api

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.jsonObject
import me.meeshy.sdk.model.PreferenceCategoryCodecs
import me.meeshy.sdk.model.preferences.deletedConversationsFromJson
import me.meeshy.sdk.model.preferences.communityReorderOf
import org.junit.Test

/** Verbe, chemin et corps de chaque route ajoutée, capturés au dernier maillon. */
class PreferencesCategoryEndpointsTest {

    @Test
    fun `reading a block is a GET on its category and keeps the unknown keys`() = runTest {
        val http = RecordingHttp(
            responseBody = """{"success":true,"data":{"sendOnEnter":false,"holographicMode":{"depth":3}}}""",
        )

        val served = http.serve(PreferencesCategoryApi::class.java).getBlock("message").data

        assertThat(http.only.method).isEqualTo("GET")
        assertThat(http.only.path).isEqualTo("/api/v1/me/preferences/message")
        val block = PreferenceCategoryCodecs.message.decode(served)
        assertThat(block.sendOnEnter).isFalse()
        assertThat(PreferenceCategoryCodecs.message.snapshot(block)["holographicMode"]).isNotNull()
    }

    @Test
    fun `each of the five categories reads from its own route`() = runTest {
        listOf("audio", "message", "video", "document", "application").forEach { category ->
            val http = RecordingHttp()
            http.serve(PreferencesCategoryApi::class.java).getBlock(category)
            assertThat(http.only.path).isEqualTo("/api/v1/me/preferences/$category")
        }
    }

    @Test
    fun `patching sends the full snapshot with the extras flattened`() = runTest {
        val http = RecordingHttp()
        val codec = PreferenceCategoryCodecs.video
        val block = codec.decode(
            kotlinx.serialization.json.Json.parseToJsonElement("""{"videoQuality":"high","futureKnob":1}"""),
        )

        http.serve(PreferencesApi::class.java).patchBlock("video", codec.snapshot(block))

        assertThat(http.only.method).isEqualTo("PATCH")
        assertThat(http.only.path).isEqualTo("/api/v1/me/preferences/video")
        val sent = kotlinx.serialization.json.Json.parseToJsonElement(http.only.body!!).jsonObject
        assertThat(sent["videoQuality"].toString()).isEqualTo("\"high\"")
        assertThat(sent["futureKnob"].toString()).isEqualTo("1")
        assertThat(sent.keys).contains("mirrorLocalVideo")
    }

    @Test
    fun `reordering communities posts the complete order`() = runTest {
        val http = RecordingHttp()

        http.serve(CommunityPreferencesApi::class.java).reorder(communityReorderOf(listOf("a", "b")))

        assertThat(http.only.method).isEqualTo("POST")
        assertThat(http.only.path).isEqualTo("/api/v1/user-preferences/communities/reorder")
        assertThat(http.only.body).isEqualTo(
            """{"updates":[{"communityId":"a","orderInCategory":0},{"communityId":"b","orderInCategory":1}]}""",
        )
    }

    @Test
    fun `deleted conversations are a GET on the canonical user route`() = runTest {
        val http = RecordingHttp(
            responseBody = """{"success":true,"data":[{"conversationId":"c1","deletedAt":"2026-10-01T10:00:00.000Z"}]}""",
        )

        val rows = http.serve(DeletedConversationsApi::class.java).deletedConversations().data

        assertThat(http.only.method).isEqualTo("GET")
        assertThat(http.only.path).isEqualTo("/api/v1/user/deleted-conversations")
        assertThat(deletedConversationsFromJson(rows).map { it.conversationId }).containsExactly("c1")
    }
}
