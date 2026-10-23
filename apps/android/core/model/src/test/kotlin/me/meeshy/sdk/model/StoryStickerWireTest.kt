package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import org.junit.Test

/**
 * Un sticker importé est une IMAGE INTÉGRÉE au post (même espace d'ids que
 * tout média du post), pas une référence externe — port de
 * `StorySticker.postMediaId`/`.provider` (StoryModels.swift, côté iOS).
 *
 * Le modèle Android a déjà rendu son document ENTIER injoignable pour un champ
 * absent sur un objet imbriqué (keyframes sans identifiant, transition
 * inconnue) : la même classe de défaut guette tout ajout de champ qui ne
 * serait pas déclaré optionnel avec un défaut. Ces tests figent la tolérance
 * pour `postMediaId`/`provider`, y compris quand le document porte des clés
 * que ce décodeur ne connaît pas encore.
 */
class StoryStickerWireTest {

    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        explicitNulls = false
        coerceInputValues = true
    }

    private fun decode(raw: String): StoryEffects =
        json.decodeFromString(StoryEffects.serializer(), raw)

    @Test
    fun `un sticker image avec des cles inconnues se decode quand meme`() {
        val effects = decode(
            """
            { "stickerObjects": [ { "id": "s1", "emoji": "🖼️",
                "postMediaId": "64f0a1b2c3d4e5f6a7b8c9d0", "provider": "library",
                "champInconnuFutur": "ignore-par-android",
                "nested": { "x": 1 } } ] }
            """.trimIndent(),
        )
        val sticker = effects.stickerObjects!!.single()

        assertThat(sticker.postMediaId).isEqualTo("64f0a1b2c3d4e5f6a7b8c9d0")
        assertThat(sticker.provider).isEqualTo("library")
        assertThat(sticker.hasImage).isTrue()
    }

    @Test
    fun `un sticker emoji sans postMediaId reste un sticker emoji`() {
        val effects = decode(
            """{ "stickerObjects": [ { "id": "s1", "emoji": "😀" } ] }""",
        )
        val sticker = effects.stickerObjects!!.single()

        assertThat(sticker.postMediaId).isEmpty()
        assertThat(sticker.provider).isNull()
        assertThat(sticker.hasImage).isFalse()
    }

    @Test
    fun `un sticker sans provider ne fait pas echouer le document`() {
        val effects = decode(
            """{ "stickerObjects": [ { "id": "s1", "postMediaId": "64f0a1b2c3d4e5f6a7b8c9d0" } ] }""",
        )
        val sticker = effects.stickerObjects!!.single()

        assertThat(sticker.provider).isNull()
        assertThat(sticker.hasImage).isTrue()
    }

    @Test
    fun `un sticker gabarit ecrit par iOS fait l aller retour sans perte`() {
        val raw = """{ "stickerObjects": [ { "id": "g1", "emoji": "", "templateId": "love.heart",
            "slots": { "title": "Je t'aime", "name": "Léa" }, "animation": "heartbeat",
            "sourceLanguage": "fr", "x": 0.4, "y": 0.6 } ] }"""
        val sticker = decode(raw).stickerObjects!!.single()

        assertThat(sticker.templateId).isEqualTo("love.heart")
        assertThat(sticker.slots).containsExactly("title", "Je t'aime", "name", "Léa")
        assertThat(sticker.stickerAnimation).isEqualTo(StickerAnimation.HEARTBEAT)
        assertThat(sticker.sourceLanguage).isEqualTo("fr")

        val relu = decode(json.encodeToString(StoryEffects.serializer(), decode(raw))).stickerObjects!!.single()
        assertThat(relu).isEqualTo(sticker)
    }

    @Test
    fun `un ancien sticker a les defauts neutres et ne republie aucun champ neuf`() {
        val sticker = decode("""{ "stickerObjects": [ { "id": "s", "emoji": "😀" } ] }""").stickerObjects!!.single()
        assertThat(sticker.templateId).isEmpty()
        assertThat(sticker.slots).isEmpty()
        assertThat(sticker.animation).isNull()
        val wire = json.encodeToString(StoryEffects.serializer(), StoryEffects(stickerObjects = listOf(sticker)))
        assertThat(wire).doesNotContain("templateId")
        assertThat(wire).doesNotContain("slots")
        assertThat(wire).doesNotContain("animation")
    }

    @Test
    fun `une animation inconnue ne fait pas echouer le document et voyage intacte`() {
        val sticker = decode("""{ "stickerObjects": [ { "id": "s", "emoji": "x", "animation": "levitate" } ] }""")
            .stickerObjects!!.single()
        assertThat(sticker.stickerAnimation).isNull()
        assertThat(sticker.animation).isEqualTo("levitate")
    }

    @Test
    fun `l echelle de pose vaut 2,2 comme sur iOS`() {
        assertThat(StorySticker.POSED_SCALE).isEqualTo(2.2)
    }

    @Test
    fun `l emoji de fil suit le rang emoji puis gabarit puis image`() {
        assertThat(StorySticker(id = "a", emoji = "😀").wireEmoji()).isEqualTo("😀")
        val template = StorySticker(id = "b", templateId = "place.pin")
        assertThat(template.wireEmoji { "📍" }).isEqualTo("📍")
        assertThat(template.wireEmoji()).isEqualTo("🖼️")
        assertThat(StorySticker(id = "c", postMediaId = "m").wireEmoji()).isEqualTo("🖼️")
    }
}
