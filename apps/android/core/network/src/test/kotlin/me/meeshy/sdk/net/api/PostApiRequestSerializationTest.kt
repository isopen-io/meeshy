package me.meeshy.sdk.net.api

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import me.meeshy.sdk.model.DiscoverabilityPrecision
import me.meeshy.sdk.model.PostEditDraft
import me.meeshy.sdk.model.PostEditField
import me.meeshy.sdk.model.PostEditPayload
import me.meeshy.sdk.model.PostLocationUpdate
import me.meeshy.sdk.model.PostMentionInput
import me.meeshy.sdk.model.SharedPlace
import me.meeshy.sdk.net.MeeshyApi
import org.junit.Test

class PostApiRequestSerializationTest {
    private val json = MeeshyApi.json

    private fun wire(request: CreatePostRequest): JsonObject = json.parseToJsonElement(json.encodeToString(request)).jsonObject

    @Test
    fun `a bare post request carries no optional key`() {
        val keys = wire(CreatePostRequest(content = "salut")).keys
        assertThat(keys).containsExactly("content")
    }

    @Test
    fun `extended fields are serialized only when set`() {
        val body = wire(
            CreatePostRequest(
                content = "x",
                visibilityUserIds = listOf("u1"),
                allowSoundExtraction = true,
                mentions = listOf(PostMentionInput(username = "ana", display = "PINNED")),
                mediaCaption = mapOf("m1" to "légende"),
                discoverabilityPrecision = DiscoverabilityPrecision.CITY,
            ),
        )
        assertThat(body.keys).containsAtLeast(
            "visibilityUserIds", "allowSoundExtraction", "mentions", "mediaCaption", "discoverabilityPrecision",
        )
        assertThat(body["discoverabilityPrecision"].toString()).isEqualTo("\"CITY\"")
        assertThat(body.keys).doesNotContain("mediaAlt")
        assertThat(body.keys).doesNotContain("storyEffects")
    }

    @Test
    fun `mentions null is absent and never an empty list`() {
        assertThat(wire(CreatePostRequest(content = "x")).keys).doesNotContain("mentions")
    }

    @Test
    fun `story request carries the extended contract`() {
        val body = json.parseToJsonElement(
            json.encodeToString(CreateStoryRequest(mediaCaption = mapOf("a" to "b"), alsoAsReel = true)),
        ).jsonObject
        assertThat(body.keys).containsAtLeast("mediaCaption", "alsoAsReel")
        assertThat(body.keys).doesNotContain("mentions")
    }

    @Test
    fun `an edit sends only the known fields and a location removal is an explicit null`() {
        val draft = PostEditDraft(content = "c", visibility = "PUBLIC", location = PostLocationUpdate.Remove)
        val request = PostEditPayload.build(setOf(PostEditField.CONTENT, PostEditField.LOCATION), draft).toUpdateRequest()
        val body = json.parseToJsonElement(json.encodeToString(request)).jsonObject
        assertThat(body.keys).containsExactly("content", "location")
        assertThat(body["location"]).isEqualTo(JsonNull)
    }

    @Test
    fun `an edit location replacement is an object`() {
        val draft = PostEditDraft(location = PostLocationUpdate.Set(SharedPlace(1.0, 2.0, name = "Paris")))
        val body = json.parseToJsonElement(json.encodeToString(draft.toUpdateRequest())).jsonObject
        assertThat(body["location"]!!.jsonObject.keys).contains("latitude")
    }

    @Test
    fun `an empty mentions list on edit is kept as the clear gesture`() {
        val body = json.parseToJsonElement(json.encodeToString(PostEditDraft(mentions = emptyList()).toUpdateRequest())).jsonObject
        assertThat(body.keys).containsExactly("mentions")
    }
}
