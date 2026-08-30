package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import java.io.File
import kotlinx.serialization.json.Json
import org.junit.Test

/**
 * Android lit des documents `storyEffects` que la passerelle sert désormais en
 * DEUX formes : l'ancienne (v1, familles à plat) et la v3 négociée
 * (`{ "v": 3, "scenes": [...] }`).
 *
 * Le v3 est un format de TRANSPORT, jamais un format d'affichage : iOS ne l'a
 * jamais rendu directement — il le reprojette sur le modèle v1 qu'il peignait
 * déjà (`StoryModels.swift:1769-1774` → `StoryEffects(rendering:sceneIndex:)`).
 * Android fait ici la même chose, et pour la même raison : le viewer existant
 * n'a pas à changer d'une ligne.
 *
 * L'oracle n'est pas écrit à la main. `packages/shared/fixtures/canvas-v3/`
 * porte des PAIRES — `X.json` (v1) et `X.v3.json` (le même contenu en v3) —
 * partagées par toutes les plateformes. Une projection correcte rend depuis la
 * seconde ce que la première décode directement. Toute dérive entre les deux
 * clients rougit ici plutôt que de se voir en production.
 */
class CanvasV3ProjectionTest {

    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        explicitNulls = false
        coerceInputValues = true
    }

    private fun fixture(name: String): String {
        var dir: File? = File(".").absoluteFile
        while (dir != null) {
            val candidate = File(dir, "packages/shared/fixtures/canvas-v3/$name.json")
            if (candidate.isFile) return candidate.readText()
            dir = dir.parentFile
        }
        throw AssertionError(
            "Fixture partagée introuvable : packages/shared/fixtures/canvas-v3/$name.json " +
                "(remontée depuis ${File(".").absolutePath})",
        )
    }

    /**
     * Le décodage passe par le PONT, pas par le sérialiseur généré : c'est le
     * chemin de production (les propriétés `storyEffects` de `ApiPost`,
     * `FeedItem` et `StorySlide` le portent). Décoder par le sérialiseur généré
     * validerait un chemin que personne n'emprunte.
     */
    private fun effects(name: String): StoryEffects =
        json.decodeFromString(StoryEffectsWireSerializer, fixture(name))

    @Test
    fun `la paire de fixtures est bien la meme scene dans les deux formes`() {
        assertThat(fixture("v1-legacy-full")).doesNotContain("\"v\": 3")
        assertThat(fixture("v1-legacy-full.v3")).contains("\"v\": 3")
    }

    @Test
    fun `un document v3 remplit la famille texte comme la forme v1`() {
        val legacy = effects("v1-legacy-full")
        val projected = effects("v1-legacy-full.v3")

        assertThat(projected.textObjects.map { it.text })
            .isEqualTo(legacy.textObjects.map { it.text })
    }

    /**
     * Le piège silencieux du lot. `carrierAspect` loge le ratio du PORTEUR
     * d'origine et la conversion v1→v3 letterboxe les ancres : sur du 16:9,
     * `y = 0,20` part à `0,405`. La transformation est affine
     * (`y' = top + y·h`), donc inversible — mais seulement si on la défait.
     *
     * Un décodeur qui ignore `carrierAspect` ne plante JAMAIS : il pose
     * simplement le texte au mauvais endroit. C'est pourquoi l'assertion porte
     * sur la position et pas seulement sur la présence.
     */
    @Test
    fun `le letterboxing des ancres est defait via carrierAspect`() {
        val legacy = effects("v1-legacy-full").textObjects.first()
        val projected = effects("v1-legacy-full.v3").textObjects.first()

        assertThat(projected.y).isWithin(1e-4).of(legacy.y)
        assertThat(projected.x).isWithin(1e-4).of(legacy.x)
    }

    @Test
    fun `le fond et sa transformation traversent la projection`() {
        val legacy = effects("v1-legacy-full")
        val projected = effects("v1-legacy-full.v3")

        assertThat(projected.background).isEqualTo(legacy.background)
        assertThat(projected.backgroundTransform).isEqualTo(legacy.backgroundTransform)
    }

    /**
     * O3 : le son vit au DOCUMENT, pas dans la scène — une publication
     * purement sonore n'émet aucun cadre. La restitution doit donc précéder
     * toute garde de scène, sans quoi le son disparaît sur un post sans visuel.
     */
    @Test
    fun `le son du document est restitue meme sans scene`() {
        val legacy = effects("v1-legacy-full")
        val projected = effects("v1-legacy-full.v3")

        assertThat(projected.backgroundAudioId).isEqualTo(legacy.backgroundAudioId)
        assertThat(projected.voiceTranscriptions?.map { it.language })
            .isEqualTo(legacy.voiceTranscriptions?.map { it.language })
    }

    @Test
    fun `un document v1 continue de se decoder inchange`() {
        val legacy = effects("v1-legacy-full")

        assertThat(legacy.textObjects).isNotEmpty()
        assertThat(legacy.background).isEqualTo("color:#1E1B4B")
    }

    private fun effectsFromRaw(raw: String): StoryEffects =
        json.decodeFromString(StoryEffectsWireSerializer, raw)

    /**
     * Un sticker image intégré (`postMediaId`) projette avec l'image
     * disponible même sans `emoji` au fil — le payload v3 est permissif par
     * contrat (`payload: JsonObject`), et un futur écrivain non conforme ne
     * doit pas faire disparaître l'objet entier.
     */
    @Test
    fun `un sticker image sans emoji au fil projette quand meme`() {
        val projected = effectsFromRaw(
            """
            { "v": 3, "scenes": [ { "id": "sc1", "objects": [
                { "id": "st1", "kind": "sticker",
                  "anchor": { "t": "free", "x": 0.5, "y": 0.5 },
                  "payload": { "postMediaId": "64f0a1b2c3d4e5f6a7b8c9d0", "provider": "genmoji" } }
              ] } ] }
            """.trimIndent(),
        )
        val sticker = projected.stickerObjects!!.single()

        assertThat(sticker.postMediaId).isEqualTo("64f0a1b2c3d4e5f6a7b8c9d0")
        assertThat(sticker.provider).isEqualTo("genmoji")
        assertThat(sticker.hasImage).isTrue()
    }

    /**
     * La durée épinglée dans le timeline editor (`scene.timelineDuration`) doit
     * traverser le pont v3 → v1 : sans ce mapping elle était SILENCIEUSEMENT
     * jetée, et un slide épinglé retombait sur la durée dérivée du contenu
     * (`StorySlideDuration` priorité 0 manquante).
     */
    @Test
    fun `le timelineDuration d'une scene v3 traverse la projection`() {
        val projected = effectsFromRaw(
            """
            { "v": 3, "scenes": [ { "id": "sc1", "timelineDuration": 4.5, "objects": [] } ] }
            """.trimIndent(),
        )

        assertThat(projected.timelineDuration).isEqualTo(4.5)
    }

    /**
     * Les traits éditables (`drawingStrokes`) traversent le pont exactement comme
     * la forme v1 les décode à plat : le v3 les porte sur l'objet `kind:"drawing"`
     * (`payload.strokes`), et une projection correcte rend depuis la seconde ce que
     * la première lit directement. L'oracle est la PAIRE de fixtures partagée
     * `v1-legacy-rich` — toute dérive entre clients rougit ici.
     */
    @Test
    fun `les traits de dessin d'un document v3 projettent comme la forme v1`() {
        val legacy = effects("v1-legacy-rich").drawingStrokes
        val projected = effects("v1-legacy-rich.v3").drawingStrokes

        assertThat(legacy).isNotNull()
        assertThat(projected).isEqualTo(legacy)
    }

    /**
     * L'assertion ci-dessus porte sur l'ÉGALITÉ structurelle complète, mais un
     * champ qui se décoderait en silence à sa valeur par défaut y passerait
     * inaperçu si l'oracle le portait aussi par défaut. On épingle donc les
     * valeurs non-défaut du trait : outil, lissage, pression par point, largeur,
     * `captureVersion` et `createdAt` — tout ce que le fil transporte.
     */
    @Test
    fun `un trait projete conserve outil lissage pression et metadonnees`() {
        val stroke = effects("v1-legacy-rich.v3").drawingStrokes!!.single()

        assertThat(stroke.id).isEqualTo("stroke-1")
        assertThat(stroke.tool).isEqualTo(StrokeTool.MARKER)
        assertThat(stroke.smoothing).isEqualTo(StrokeSmoothing.CURVE)
        assertThat(stroke.colorHex).isEqualTo("FF3B30")
        assertThat(stroke.width).isEqualTo(12.0)
        assertThat(stroke.captureVersion).isEqualTo(1)
        assertThat(stroke.createdAt).isEqualTo(776000000.0)
        assertThat(stroke.points.map { it.pressure }).containsExactly(0.4, 0.95).inOrder()
    }

    /**
     * Un objet `drawing` ne portant que le blob PKDrawing legacy (`data`, base64,
     * sans rendu Android) et aucun trait exploitable ne fabrique pas une couche de
     * dessin vide : `drawingStrokes` reste `null`, comme les autres familles
     * normalisent le vide.
     */
    @Test
    fun `un objet drawing sans traits exploitables ne fabrique pas de couche vide`() {
        val projected = effectsFromRaw(
            """
            { "v": 3, "scenes": [ { "id": "sc1", "objects": [
                { "id": "drawing", "kind": "drawing",
                  "anchor": { "t": "free", "x": 0.5, "y": 0.5 }, "plane": "fg",
                  "payload": { "data": "AQIDBA==" } }
              ] } ] }
            """.trimIndent(),
        )

        assertThat(projected.drawingStrokes).isNull()
    }

    /**
     * Un tableau `strokes` PRÉSENT mais VIDE ne diffère pas, à l'affichage, d'une
     * absence de dessin : `drawingStrokes` reste `null` (chemin `takeIf` distinct de
     * la clé absente ci-dessus), et non une liste vide qui laisserait croire à une
     * couche.
     */
    @Test
    fun `un objet drawing au tableau strokes vide reste null`() {
        val projected = effectsFromRaw(
            """
            { "v": 3, "scenes": [ { "id": "sc1", "objects": [
                { "id": "drawing", "kind": "drawing",
                  "anchor": { "t": "free", "x": 0.5, "y": 0.5 }, "plane": "fg",
                  "payload": { "strokes": [] } }
              ] } ] }
            """.trimIndent(),
        )

        assertThat(projected.drawingStrokes).isNull()
    }

    /**
     * Le payload v3 est permissif par contrat : une clé future inconnue au décodeur
     * (`champInconnuFutur`) sur un trait ne doit jamais faire disparaître le trait
     * — ni la scène — comme pour les autres familles.
     */
    @Test
    fun `un trait avec des cles de payload inconnues traverse la projection`() {
        val projected = effectsFromRaw(
            """
            { "v": 3, "scenes": [ { "id": "sc1", "objects": [
                { "id": "drawing", "kind": "drawing",
                  "anchor": { "t": "free", "x": 0.5, "y": 0.5 }, "plane": "fg",
                  "payload": { "strokes": [
                    { "id": "s1", "colorHex": "00FF00", "width": 4,
                      "points": [ { "x": 0.1, "y": 0.1 } ], "champInconnuFutur": 7 }
                  ] } }
              ] } ] }
            """.trimIndent(),
        )
        val stroke = projected.drawingStrokes!!.single()

        assertThat(stroke.id).isEqualTo("s1")
        assertThat(stroke.tool).isEqualTo(StrokeTool.PEN)
        assertThat(stroke.captureVersion).isEqualTo(0)
        assertThat(stroke.createdAt).isNull()
        assertThat(stroke.points.single().pressure).isEqualTo(1.0)
    }

    /** Une clé de payload inconnue au décodeur Android ne doit jamais faire échouer la scène. */
    @Test
    fun `un sticker avec des cles de payload inconnues traverse la projection`() {
        val projected = effectsFromRaw(
            """
            { "v": 3, "scenes": [ { "id": "sc1", "objects": [
                { "id": "st1", "kind": "sticker",
                  "anchor": { "t": "free", "x": 0.5, "y": 0.5 },
                  "payload": { "emoji": "🎉", "champInconnuFutur": "ignore" } }
              ] } ] }
            """.trimIndent(),
        )
        val sticker = projected.stickerObjects!!.single()

        assertThat(sticker.emoji).isEqualTo("🎉")
        assertThat(sticker.hasImage).isFalse()
    }
}
