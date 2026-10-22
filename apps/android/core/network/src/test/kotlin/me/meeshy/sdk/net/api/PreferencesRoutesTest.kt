package me.meeshy.sdk.net.api

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import me.meeshy.sdk.model.CategoryPatchBody
import me.meeshy.sdk.model.ConversationReorderBody
import me.meeshy.sdk.model.ConversationReorderItem
import org.junit.Test

/** Captures the request at the last link: verb, path and body of the preference routes. */
class PreferencesRoutesTest {

    @Test
    fun `patching a block hits the named block with the partial body`() = runTest {
        val http = RecordingHttp()

        http.serve(PreferencesApi::class.java)
            .patchBlock("privacy", JsonObject(mapOf("showOnlineStatus" to JsonPrimitive(false))))

        assertThat(http.only.method).isEqualTo("PATCH")
        assertThat(http.only.path).isEqualTo("/api/v1/me/preferences/privacy")
        assertThat(http.only.body).isEqualTo("""{"showOnlineStatus":false}""")
    }

    @Test
    fun `resetting a block is a DELETE on its route`() = runTest {
        val http = RecordingHttp()

        http.serve(PreferencesApi::class.java).resetBlock("audio")

        assertThat(http.only.method).isEqualTo("DELETE")
        assertThat(http.only.path).isEqualTo("/api/v1/me/preferences/audio")
    }

    @Test
    fun `folding a category patches only isExpanded`() = runTest {
        val http = RecordingHttp()

        http.serve(PreferencesApi::class.java).patchCategory("c1", CategoryPatchBody(isExpanded = false))

        assertThat(http.only.method).isEqualTo("PATCH")
        assertThat(http.only.path).isEqualTo("/api/v1/me/preferences/categories/c1")
        assertThat(http.only.body).isEqualTo("""{"isExpanded":false}""")
    }

    @Test
    fun `reading the aggregate is a GET on me preferences`() = runTest {
        val http = RecordingHttp()

        http.serve(PreferencesApi::class.java).getAll()

        assertThat(http.only.method).isEqualTo("GET")
        assertThat(http.only.path).isEqualTo("/api/v1/me/preferences")
    }

    @Test
    fun `reordering posts the updates batch`() = runTest {
        val http = RecordingHttp()

        http.serve(ConversationPreferencesApi::class.java)
            .reorder(ConversationReorderBody(listOf(ConversationReorderItem("a", 0))))

        assertThat(http.only.method).isEqualTo("POST")
        assertThat(http.only.path).isEqualTo("/api/v1/user-preferences/reorder")
        assertThat(http.only.body).isEqualTo("""{"updates":[{"conversationId":"a","orderInCategory":0}]}""")
    }

    @Test
    fun `a conversation row and the tag page are read from user-preferences`() = runTest {
        val row = RecordingHttp()
        row.serve(ConversationPreferencesApi::class.java).getPreferences("c1")
        val page = RecordingHttp(responseBody = """{"success":true,"data":[]}""")
        page.serve(ConversationPreferencesApi::class.java).listPreferences(offset = 0, limit = 200)

        assertThat(row.only.path).isEqualTo("/api/v1/user-preferences/conversations/c1")
        assertThat(page.only.path).isEqualTo("/api/v1/user-preferences/conversations")
        assertThat(page.only.query).isEqualTo("offset=0&limit=200")
    }
}
