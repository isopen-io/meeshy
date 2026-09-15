package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import org.junit.Test

/**
 * L'agencement d'une publication est choisi par son AUTEUR (#6514) : iOS
 * l'écrit dans `Post.storyEffects` (document canvas v3, `layout`), et deux
 * lecteurs doivent voir la même mise en page. Android le perdait deux fois :
 * `CanvasV3` ne déclarait pas `layout`, et le pont v3 → v1 n'avait aucun champ
 * pour le porter jusqu'à `ApiPost.storyEffects`.
 *
 * Tout passe ici par le PONT de production (`StoryEffectsWireSerializer`, posé
 * sur `ApiPost.storyEffects`), jamais par le sérialiseur généré.
 */
class MosaicLayoutTransportTest {

    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        explicitNulls = false
        coerceInputValues = true
    }

    private fun v3Post(layout: String?): String {
        val layoutField = layout?.let { """, "layout": $it""" }.orEmpty()
        return """
            { "id": "p1", "storyEffects": { "v": 3$layoutField, "scenes": [ { "id": "s1", "objects": [
                { "id": "t1", "kind": "text", "plane": "fg", "z": 1,
                  "anchor": { "t": "free", "x": 0.5, "y": 0.2 },
                  "transform": { "scale": 1, "rotation": 0, "opacity": 1 },
                  "payload": { "text": "Salut" } } ] } ] } }
        """.trimIndent()
    }

    private fun decode(raw: String): ApiPost = json.decodeFromString(ApiPost.serializer(), raw)

    @Test
    fun `une valeur connue sur un document v3 arrive jusqu'a ApiPost`() {
        val post = decode(v3Post("\"hero\""))

        assertThat(post.storyEffects!!.layout).isEqualTo(MosaicLayoutMode.HERO)
        assertThat(post.storyEffects.resolvedLayout).isEqualTo(MosaicLayoutMode.HERO)
    }

    @Test
    fun `les cinq valeurs du fil sont celles de MosaicLayoutMode (Swift et canvas-v3 ts)`() {
        val served = listOf("wave", "hero", "reel", "sine", "carousel")
            .map { decode(v3Post("\"$it\"")).storyEffects.resolvedLayout }

        assertThat(served).containsExactly(
            MosaicLayoutMode.WAVE,
            MosaicLayoutMode.HERO,
            MosaicLayoutMode.REEL,
            MosaicLayoutMode.SINE,
            MosaicLayoutMode.CAROUSEL,
        ).inOrder()
    }

    /** Tout le corpus antérieur au 2026-09-06 : aucune publication n'a de `layout`. */
    @Test
    fun `layout absent retombe sur le carrousel`() {
        val post = decode(v3Post(layout = null))

        assertThat(post.storyEffects!!.layout).isNull()
        assertThat(post.storyEffects.resolvedLayout).isEqualTo(MosaicLayoutMode.CAROUSEL)
    }

    /**
     * Une valeur écrite par un client plus récent ne doit ni vider la
     * publication ni faire échouer le document : iOS décode l'inconnu en
     * `.fallback` (`MosaicLayoutMode.init(from:)`).
     */
    @Test
    fun `layout inconnu retombe sur le carrousel sans vider la publication`() {
        listOf("\"spiral\"", "7", "\"\"", "{}").forEach { raw ->
            val effects = decode(v3Post(raw)).storyEffects!!

            assertThat(effects.resolvedLayout).isEqualTo(MosaicLayoutMode.CAROUSEL)
            assertThat(effects.textObjects.map { it.text }).containsExactly("Salut")
        }
    }

    @Test
    fun `layout inconnu reste tolere par un decodeur strict`() {
        val strict = Json {}
        val effects = strict.decodeFromString(
            StoryEffectsWireSerializer,
            """{ "v": 3, "layout": "spiral", "scenes": [] }""",
        )

        assertThat(effects.resolvedLayout).isEqualTo(MosaicLayoutMode.CAROUSEL)
    }

    @Test
    fun `aucun storyEffects servi retombe sur le carrousel`() {
        val post = decode("""{ "id": "p1" }""")

        assertThat(post.storyEffects).isNull()
        assertThat(post.storyEffects.resolvedLayout).isEqualTo(MosaicLayoutMode.CAROUSEL)
    }

    /**
     * La MARQUE décide : un document qui se déclare antérieur au canvas v3 ne
     * peut pas porter un attribut du canvas v3, et un blob v1 servi par la
     * passerelle n'en a jamais eu.
     */
    @Test
    fun `un document qui n'est pas en v3 ne porte aucun agencement`() {
        val legacy = decode(
            """{ "id": "p1", "storyEffects": { "background": "color:#000",
                "textObjects": [ { "id": "t1", "text": "Salut" } ] } }""",
        )
        val markedBelowV3 = decode(
            """{ "id": "p1", "storyEffects": { "v": 2, "layout": "hero", "background": "color:#000" } }""",
        )

        assertThat(legacy.storyEffects.resolvedLayout).isEqualTo(MosaicLayoutMode.CAROUSEL)
        assertThat(markedBelowV3.storyEffects.resolvedLayout).isEqualTo(MosaicLayoutMode.CAROUSEL)
        assertThat(markedBelowV3.storyEffects!!.background).isEqualTo("color:#000")
    }

    /** Un rang SUPÉRIEUR se lit : un champ additif v3.x ne renvoie pas au legacy. */
    @Test
    fun `un rang superieur a v3 se lit`() {
        val effects = json.decodeFromString(
            StoryEffectsWireSerializer,
            """{ "v": 4, "layout": "sine", "scenes": [] }""",
        )

        assertThat(effects.resolvedLayout).isEqualTo(MosaicLayoutMode.SINE)
    }

    /**
     * L'aller-retour : Android réécrit `storyEffects` en v1 (cache Room des
     * stories, `StoryEntity`), et iOS garde l'agencement de l'auteur quand il
     * réencode (`CanvasV3(migrating:keeping:)` reprend `document?.layout`).
     * Une relecture qui oublierait l'agencement changerait la mise en page d'une
     * publication entre le cache et le réseau.
     */
    @Test
    fun `l'aller-retour par le pont garde l'agencement de l'auteur`() {
        val served = decode(v3Post("\"hero\""))

        val reread = decode(json.encodeToString(ApiPost.serializer(), served))

        assertThat(reread.storyEffects!!.layout).isEqualTo(MosaicLayoutMode.HERO)
        assertThat(reread.storyEffects.textObjects.map { it.text }).containsExactly("Salut")
    }

    /** L'écriture v1 d'un contenu composé sur Android, sans agencement, ne change pas d'un octet. */
    @Test
    fun `une ecriture sans agencement n'emet aucune cle layout`() {
        val written = json.encodeToString(
            StoryEffectsWireSerializer,
            StoryEffects(background = "color:#000"),
        )

        assertThat(written).doesNotContain("layout")
        assertThat(written).isEqualTo("""{"background":"color:#000"}""")
    }
}
