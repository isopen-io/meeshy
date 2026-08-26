package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import org.junit.Test

/**
 * Le pont v3 est posé sur des PROPRIÉTÉS, pas sur la classe — annoter
 * `StoryEffects` supprimerait le sérialiseur généré dont la branche v1 a
 * besoin. Le risque de ce choix est qu'un site l'oublie, et un site oublié ne
 * rougit nulle part : il rend simplement une story vide.
 *
 * La garde ne compte donc pas les annotations, elle décode un document v3
 * À TRAVERS chaque type d'entrée public. Ce qui doit être vrai, c'est qu'un
 * post arrive lisible — pas qu'un fichier porte la bonne ligne.
 */
class StoryEffectsWireSiteTest {

    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        explicitNulls = false
        coerceInputValues = true
    }

    private val v3Document = """
        { "v": 3, "scenes": [ { "id": "s1", "objects": [
            { "id": "bg", "kind": "media", "plane": "bg", "z": 0,
              "anchor": { "t": "free", "x": 0.5, "y": 0.5 },
              "transform": { "scale": 1, "rotation": 0, "opacity": 1 },
              "payload": { "background": "color:#1E1B4B" } },
            { "id": "t1", "kind": "text", "plane": "fg", "z": 1,
              "anchor": { "t": "free", "x": 0.5, "y": 0.2 },
              "transform": { "scale": 1, "rotation": 0, "opacity": 1 },
              "payload": { "text": "Salut" } } ] } ] }
    """.trimIndent()

    private fun assertProjected(effects: StoryEffects?) {
        assertThat(effects).isNotNull()
        assertThat(effects!!.background).isEqualTo("color:#1E1B4B")
        assertThat(effects.textObjects.map { it.text }).containsExactly("Salut")
    }

    @Test
    fun `ApiPost projette un document v3`() {
        val post = json.decodeFromString(
            ApiPost.serializer(),
            """{ "id": "p1", "storyEffects": $v3Document }""",
        )

        assertProjected(post.storyEffects)
    }

    @Test
    fun `ApiRepostOf projette un document v3`() {
        val repost = json.decodeFromString(
            ApiRepostOf.serializer(),
            """{ "id": "p1", "storyEffects": $v3Document }""",
        )

        assertProjected(repost.storyEffects)
    }

    @Test
    fun `RepostContent projette un document v3`() {
        val repost = json.decodeFromString(
            RepostContent.serializer(),
            """{ "id": "p1", "storyEffects": $v3Document }""",
        )

        assertProjected(repost.storyEffects)
    }

    @Test
    fun `StorySlide projette un document v3`() {
        val slide = json.decodeFromString(
            StorySlide.serializer(),
            """{ "id": "s1", "effects": $v3Document }""",
        )

        assertProjected(slide.effects)
    }

    /**
     * La branche v1 doit rester intacte sur les mêmes sites : le parc en
     * publie encore, et un pont qui ne saurait plus lire l'ancien format
     * échangerait un défaut contre un autre.
     */
    @Test
    fun `les memes sites lisent toujours un document v1`() {
        val post = json.decodeFromString(
            ApiPost.serializer(),
            """{ "id": "p1", "storyEffects": { "background": "color:#000",
                "textObjects": [ { "id": "t1", "text": "Salut" } ] } }""",
        )

        assertThat(post.storyEffects!!.background).isEqualTo("color:#000")
        assertThat(post.storyEffects!!.textObjects.map { it.text }).containsExactly("Salut")
    }

    /**
     * Le schéma v3 ÉVOLUE côté serveur — `carrierAspect` y a été ajouté le
     * 2026-08-22, d'autres suivront. La lecture doit donc rester tolérante aux
     * champs inconnus QUELLE QUE SOIT la configuration de l'appelant.
     *
     * Le pont décodait le document avec l'instance `Json` reçue. Un appelant
     * strict faisait alors échouer le décodage sur un champ neuf, le
     * `runCatching` avalait l'exception, et la story s'affichait VIDE. Le
     * repli masquait le défaut au lieu de le signaler : le mode de défaillance
     * exact que ce lot combat, réintroduit par le correctif lui-même.
     */
    @Test
    fun `un champ v3 inconnu ne vide pas la story, meme avec un decodeur strict`() {
        val strict = Json {}
        val futureDocument = """
            { "v": 3, "champDuFutur": 42, "scenes": [ { "id": "s1", "cadenceInedite": true,
              "objects": [
                { "id": "t1", "kind": "text", "plane": "fg", "z": 1, "attributNeuf": "x",
                  "anchor": { "t": "free", "x": 0.5, "y": 0.2 },
                  "transform": { "scale": 1, "rotation": 0, "opacity": 1 },
                  "payload": { "text": "Salut" } } ] } ] }
        """.trimIndent()

        val effects = strict.decodeFromString(StoryEffectsWireSerializer, futureDocument)

        assertThat(effects.textObjects.map { it.text }).containsExactly("Salut")
    }

    /** `carrierAspect` est un champ RÉEL du schéma, pas une hypothèse. */
    @Test
    fun `carrierAspect est honore meme via un decodeur strict`() {
        val strict = Json {}
        val document = """
            { "v": 3, "scenes": [ { "id": "s1", "carrierAspect": 1.7777, "objects": [
                { "id": "t1", "kind": "text", "plane": "fg", "z": 1,
                  "anchor": { "t": "free", "x": 0.5, "y": 0.40507397198627443 },
                  "transform": { "scale": 1, "rotation": 0, "opacity": 1 },
                  "payload": { "text": "Salut" } } ] } ] }
        """.trimIndent()

        val effects = strict.decodeFromString(StoryEffectsWireSerializer, document)

        assertThat(effects.textObjects.single().y).isWithin(1e-4).of(0.2)
    }
}
