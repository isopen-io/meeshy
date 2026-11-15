package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import org.junit.Test

/**
 * Un objet de scène illisible ne coûte que LUI-MÊME : ni la story, ni la page de
 * stories qui la porte. iOS décode chaque famille élément par élément
 * (`decodeLossyArrayIfPresent`, StoryEffects.swift) ; sans cette tolérance un seul
 * trait sans `colorHex` faisait échouer `ApiPost`, donc toute la réponse
 * `posts/stories` : la barre restait vide et le lecteur se refermait aussitôt.
 */
class StoryEffectsLossyDecodeTest {

    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        explicitNulls = false
        coerceInputValues = true
    }

    private fun post(effects: String): ApiPost =
        json.decodeFromString(ApiPost.serializer(), """{ "id": "p1", "type": "STORY", "storyEffects": $effects }""")

    @Test
    fun `a stroke missing its colour drops alone and keeps its neighbours`() {
        val effects = post(
            """{ "drawingStrokes": [
                  { "id": "ok", "colorHex": "#FFFFFF", "width": 4, "points": [] },
                  { "id": "broken", "points": [] } ],
                "textObjects": [ { "id": "t1", "text": "Salut" } ] }""",
        ).storyEffects

        assertThat(effects?.drawingStrokes?.map { it.id }).containsExactly("ok")
        assertThat(effects?.textObjects?.map { it.text }).containsExactly("Salut")
    }

    @Test
    fun `an unreadable text object drops alone`() {
        val effects = post(
            """{ "textObjects": [ { "text": "sans id" }, { "id": "t2", "text": "Bonjour" } ] }""",
        ).storyEffects

        assertThat(effects?.textObjects?.map { it.id }).containsExactly("t2")
    }

    @Test
    fun `an unreadable media, sound or sticker object drops alone`() {
        val effects = post(
            """{ "mediaObjects": [ { "x": 1 }, { "id": "m1", "postMediaId": "pm1", "mediaType": "image" } ],
                "audioPlayerObjects": [ { "volume": "fort" }, { "id": "a1", "postMediaId": "pa1" } ],
                "stickerObjects": [ { "emoji": 3 }, { "id": "s1", "emoji": "🔥" } ] }""",
        ).storyEffects

        assertThat(effects?.mediaObjects?.map { it.id }).containsExactly("m1")
        assertThat(effects?.audioPlayerObjects?.map { it.id }).containsExactly("a1")
        assertThat(effects?.stickerObjects?.map { it.id }).containsExactly("s1")
    }

    @Test
    fun `a v2 marked document with an unreadable object still reads the rest`() {
        val effects = post(
            """{ "v": 2, "background": "#112233",
                "drawingStrokes": [ { "id": "broken" } ],
                "textObjects": [ { "id": "t1", "text": "Salut" } ] }""",
        ).storyEffects

        assertThat(effects?.background).isEqualTo("#112233")
        assertThat(effects?.textObjects?.map { it.text }).containsExactly("Salut")
        assertThat(effects?.drawingStrokes).isEmpty()
    }

    @Test
    fun `an effects document of the wrong shape leaves the post readable`() {
        val decoded = post("""{ "textObjects": "pas une liste", "background": { "x": 1 } }""")

        assertThat(decoded.id).isEqualTo("p1")
        assertThat(decoded.storyEffects?.textObjects).isEmpty()
    }

    @Test
    fun `absent families stay absent rather than becoming empty lists`() {
        val effects = post("""{ "background": "#112233" }""").storyEffects

        assertThat(effects?.mediaObjects).isNull()
        assertThat(effects?.drawingStrokes).isNull()
    }
}
