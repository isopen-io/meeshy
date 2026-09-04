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

    /**
     * L'axe EFFET (#4870) est une clé du `payload`, permissif par contrat : la
     * projection la relit sur le modèle v1 — sinon un texte composé sur iOS
     * perdrait sa lueur en traversant le pont, sans qu'aucune erreur ne le dise.
     */
    @Test
    fun `l'effet d'un texte v3 traverse la projection`() {
        val document = """
            {"v": 3, "scenes": [{"id": "s1", "objects": [{
              "id": "t1", "kind": "text",
              "anchor": {"t": "free", "x": 0.5, "y": 0.5},
              "plane": "fg", "z": 0,
              "transform": {"scale": 1.0, "rotation": 0.0, "opacity": 1.0},
              "payload": {"text": "Bonjour", "textEffect": "relief"}
            }]}]}
        """.trimIndent()
        val effects = json.decodeFromString(StoryEffectsWireSerializer, document)
        val text = effects.textObjects.single()
        assertThat(text.textEffect).isEqualTo("relief")
        assertThat(StoryTextEffect.fromWire(text.textEffect)).isEqualTo(StoryTextEffect.RELIEF)
    }

    /**
     * #5085 — **les quatre bornes du recadrage arrivent bien jusqu'au modèle.**
     *
     * Elles voyagent à plat dans la charge (`cropX`/`cropY`/`cropW`/`cropH`),
     * que le contrat déclare permissive : rien ne les refusait, et rien ne les
     * LISAIT non plus. Ce témoin est le second fait — le premier étant la
     * clause de `canvas-v3.ts` qui les déclare.
     */
    @Test
    fun `les bornes de recadrage d un media arrivent au modele`() {
        val projected = effectsFromRaw(
            """
            { "v": 3, "scenes": [ { "id": "sc1", "objects": [
              { "id": "m1", "kind": "media", "anchor": { "t": "free", "x": 0.5, "y": 0.5 },
                "plane": "content", "z": 0,
                "transform": { "scale": 1, "rotation": 0, "opacity": 1 },
                "payload": { "mediaURL": "https://cdn/x.jpg",
                             "cropX": 0.0, "cropY": 0.5, "cropW": 1.0, "cropH": 0.5 } }
            ] } ] }
            """.trimIndent(),
        )
        val media = projected.mediaObjects?.firstOrNull()
        assertThat(media).isNotNull()
        assertThat(media!!.crop).isEqualTo(StoryMediaCrop(x = 0.0, y = 0.5, width = 1.0, height = 0.5))
    }

    /**
     * **Un recadrage amputé ne devient pas un cadrage fabriqué.** Le contrat le
     * refuse au fil ; le modèle le refuse aussi, parce qu'un document déjà
     * stocké sous l'ancienne forme ne repasse par aucune validation.
     */
    @Test
    fun `un recadrage amputé au fil ne produit aucun cadrage`() {
        val projected = effectsFromRaw(
            """
            { "v": 3, "scenes": [ { "id": "sc1", "objects": [
              { "id": "m1", "kind": "media", "anchor": { "t": "free", "x": 0.5, "y": 0.5 },
                "plane": "content", "z": 0,
                "transform": { "scale": 1, "rotation": 0, "opacity": 1 },
                "payload": { "mediaURL": "https://cdn/x.jpg",
                             "cropX": 0.0, "cropY": 0.5, "cropW": 1.0 } }
            ] } ] }
            """.trimIndent(),
        )
        assertThat(projected.mediaObjects?.firstOrNull()?.crop).isNull()
    }

    /**
     * **La frontière de ce lot, dite plutôt que supposée** (#5085).
     *
     * En v3, un média de plan `bg` ne devient PAS un [StoryMediaObject] : il se
     * réduit à `background` (une chaîne) et `backgroundTransform`. Le
     * recadrage d'un FOND v3 ne peut donc atteindre aucun lecteur Android —
     * non parce que le champ manque, mais parce que l'objet qui le porterait
     * n'existe pas à l'arrivée.
     *
     * C'est une lacune PRÉEXISTANTE et plus large que le recadrage : le même
     * aiguillage perd `isBackground`, `mediaURL` et `loop` de l'objet. Le fond
     * v1 (le cas nominal aujourd'hui, `mediaObjects` + `isBackground`) est,
     * lui, entièrement servi.
     *
     * Ce témoin ne demande pas de corriger — il EMPÊCHE la lacune de se
     * refermer en silence. Le jour où l'aiguillage v3 émettra un objet, il
     * rougira, et son auteur lira ici pourquoi il ne le faisait pas.
     */
    @Test
    fun `un media de plan bg en v3 ne devient pas un objet media`() {
        val projected = effectsFromRaw(
            """
            { "v": 3, "scenes": [ { "id": "sc1", "objects": [
              { "id": "m1", "kind": "media", "anchor": { "t": "free", "x": 0.5, "y": 0.5 },
                "plane": "bg", "z": 0,
                "transform": { "scale": 1, "rotation": 0, "opacity": 1 },
                "payload": { "background": "https://cdn/x.jpg",
                             "cropX": 0.0, "cropY": 0.5, "cropW": 1.0, "cropH": 0.5 } }
            ] } ] }
            """.trimIndent(),
        )
        assertThat(projected.mediaObjects).isNull()
        assertThat(projected.background).isEqualTo("https://cdn/x.jpg")
    }

    /**
     * #5129 — **les bornes de LECTURE d'un média arrivent au modèle.**
     *
     * Elles voyagent à plat dans la charge (`sourceStart`/`sourceEnd`), écrites
     * par iOS pour les médias comme pour les audios. Android n'en avait
     * AUCUNE notion — ni sous ce nom, ni sous un autre : un clip dont l'auteur
     * avait gardé les secondes 3 → 8 d'une vidéo de trente secondes jouait les
     * trente.
     *
     * **À ne pas confondre avec `startTime`/`duration`**, qui gouvernent QUAND
     * l'objet est à l'écran sur la timeline de la slide. Ces deux-ci disent
     * QUELLE PARTIE de la source joue une fois qu'il y est. Les deux axes
     * coexistent : un clip visible de 0 à 5 s peut jouer les secondes 3 → 8 de
     * son fichier.
     */
    @Test
    fun `les bornes de lecture d un media arrivent au modele`() {
        val projected = effectsFromRaw(
            """
            { "v": 3, "scenes": [ { "id": "sc1", "objects": [
              { "id": "m1", "kind": "media", "anchor": { "t": "free", "x": 0.5, "y": 0.5 },
                "plane": "content", "z": 0,
                "transform": { "scale": 1, "rotation": 0, "opacity": 1 },
                "timing": { "start": 0.0 },
                "payload": { "mediaURL": "https://cdn/x.mp4", "duration": 5.0,
                             "sourceStart": 3.0, "sourceEnd": 8.0 } }
            ] } ] }
            """.trimIndent(),
        )
        val media = projected.mediaObjects?.firstOrNull()
        assertThat(media).isNotNull()
        assertThat(media!!.sourceStart).isEqualTo(3.0)
        assertThat(media.sourceEnd).isEqualTo(8.0)
        // **Les deux axes ne vivent même pas au même endroit du fil**, et c'est
        // ce que ce témoin fixe : `start` est porté par `timing`, FRÈRE de la
        // charge, tandis que les bornes de lecture sont DANS la charge. Ma
        // première rédaction posait `startTime` dans le payload — il n'y a
        // jamais été lu, et le témoin est tombé en me l'apprenant.
        assertThat(media.startTime).isEqualTo(0.0)
        assertThat(media.duration).isEqualTo(5.0)
    }

    /**
     * #5129 — **un audio rogné l'est aussi.** iOS écrit les deux bornes sur les
     * deux familles (`CanvasV3Migration.swift:457` et `:542`) ; les lire pour le
     * seul média laisserait un vocal rogné jouer en entier.
     */
    @Test
    fun `les bornes de lecture d un audio arrivent au modele`() {
        val projected = effectsFromRaw(
            """
            { "v": 3, "scenes": [ { "id": "sc1", "objects": [
              { "id": "a1", "kind": "audio", "anchor": { "t": "free", "x": 0.5, "y": 0.8 },
                "plane": "content", "z": 0,
                "transform": { "scale": 1, "rotation": 0, "opacity": 1 },
                "payload": { "postMediaId": "pm1", "sourceStart": 1.5, "sourceEnd": 4.25 } }
            ] } ] }
            """.trimIndent(),
        )
        val audio = projected.audioPlayerObjects?.firstOrNull()
        assertThat(audio).isNotNull()
        assertThat(audio!!.sourceStart).isEqualTo(1.5f)
        assertThat(audio.sourceEnd).isEqualTo(4.25f)
    }

    /**
     * **Une borne seule ne devient pas une fenêtre fabriquée.** Même règle que
     * le recadrage (#5085) : un début sans fin n'a pas de repli sensé — le
     * compléter par la durée du fichier inventerait une coupe que personne n'a
     * posée, et jouer de 3 s à l'infini n'est pas ce que l'auteur a demandé.
     *
     * Le document déjà stocké sous une forme amputée ne repasse par aucune
     * validation : le modèle doit donc refuser ce que le contrat refuse.
     */
    @Test
    fun `une borne de lecture amputée ne produit aucune fenêtre`() {
        val projected = effectsFromRaw(
            """
            { "v": 3, "scenes": [ { "id": "sc1", "objects": [
              { "id": "m1", "kind": "media", "anchor": { "t": "free", "x": 0.5, "y": 0.5 },
                "plane": "content", "z": 0,
                "transform": { "scale": 1, "rotation": 0, "opacity": 1 },
                "payload": { "mediaURL": "https://cdn/x.mp4", "sourceStart": 3.0 } }
            ] } ] }
            """.trimIndent(),
        )
        val media = projected.mediaObjects?.firstOrNull()
        assertThat(media).isNotNull()
        assertThat(media!!.sourceStart).isNull()
        assertThat(media.sourceEnd).isNull()
    }
}
