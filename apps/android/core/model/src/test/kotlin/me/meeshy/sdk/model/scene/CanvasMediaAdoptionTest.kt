package me.meeshy.sdk.model.scene

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import me.meeshy.sdk.model.BackgroundSoundV3
import me.meeshy.sdk.model.CanvasV3
import me.meeshy.sdk.model.MosaicLayoutMode
import me.meeshy.sdk.model.ObjectV3
import me.meeshy.sdk.model.SceneV3
import me.meeshy.sdk.model.StoryAudioPlayerObject
import me.meeshy.sdk.model.StoryEffects
import me.meeshy.sdk.model.StoryEffectsWireSerializer
import me.meeshy.sdk.model.StoryMediaObject
import me.meeshy.sdk.model.StorySticker
import org.junit.Test

/**
 * **Un canvas publié ne peut désigner que des médias que le post POSSÈDE** (#5280).
 *
 * Un identifiant orphelin ne produit ni erreur, ni journal, ni rendu partiel : il
 * produit du BLANC. Les deux fichiers existent, les deux requêtes répondent 200, et
 * rien dans la chaîne n'a de raison de se plaindre — il ne manquait qu'une ÉGALITÉ
 * entre deux identifiants, et une égalité qui n'est écrite nulle part ne peut pas
 * être fausse. Ces témoins l'écrivent, sans état, sur la règle pure.
 *
 * Miroir de `CanvasMediaAdoptionTests` et `CanvasMultiSceneAdoptionTests` (iOS).
 */
class CanvasMediaAdoptionTest {

    private fun media(id: String, postMediaId: String, background: Boolean = false, url: String? = null) =
        StoryMediaObject(id = id, postMediaId = postMediaId, mediaURL = url, isBackground = background)

    private fun effects(vararg objects: StoryMediaObject) =
        StoryEffects(mediaObjects = objects.toList())

    private fun sceneObject(
        id: String,
        kind: String,
        vararg payload: Pair<String, String>,
        plane: String = "content",
    ) = ObjectV3(
        id = id,
        kind = kind,
        plane = plane,
        payload = buildJsonObject { payload.forEach { (k, v) -> put(k, v) } },
    )

    private fun scene(id: String, vararg objects: ObjectV3, carrierAspect: Double? = null) =
        SceneV3(id = id, objects = objects.toList(), carrierAspect = carrierAspect)

    private fun mediaIdsOf(scene: SceneV3?): List<String?> =
        scene?.objects.orEmpty().map { it.mediaReference }

    // --- orphelins : le cas mesuré -----------------------------------------------

    @Test
    fun `the identity of the pre-upload is an orphan of the publication`() {
        val canvas = effects(media("o1", "6a9c52c22fe27d0b04dda8d9", background = true))

        assertThat(CanvasMediaAdoption.orphanIds(canvas, listOf("6a9c52e32fe27d0b04dda8da")))
            .containsExactly("6a9c52c22fe27d0b04dda8d9")
        assertThat(CanvasMediaAdoption.isCoherent(canvas, listOf("autre"))).isFalse()
    }

    @Test
    fun `after adoption the canvas and the post name the same row`() {
        val canvas = effects(media("o1", "m-1", background = true))

        assertThat(CanvasMediaAdoption.isCoherent(canvas, listOf("m-1"))).isTrue()
        assertThat(CanvasMediaAdoption.orphanIds(canvas, listOf("m-1"))).isEmpty()
    }

    @Test
    fun `the rule does not tell the background from a foreground media`() {
        val canvas = effects(media("a", "bon", background = true), media("b", "orphelin"))

        assertThat(CanvasMediaAdoption.orphanIds(canvas, listOf("bon"))).containsExactly("orphelin")
    }

    @Test
    fun `an empty postMediaId is not an orphan`() {
        val canvas = effects(media("a", ""), media("b", "bon"))

        assertThat(CanvasMediaAdoption.orphanIds(canvas, listOf("bon"))).isEmpty()
    }

    @Test
    fun `a text-only canvas is coherent by construction`() {
        assertThat(CanvasMediaAdoption.isCoherent(StoryEffects(), emptyList())).isTrue()
    }

    // --- les deux orthographes, les deux endroits ---------------------------------

    @Test
    fun `a background designated by mediaId in a carried scene is seen by the guard`() {
        val canvas = CanvasV3(
            scenes = listOf(
                scene("s1"),
                scene("s2", sceneObject("bg2", "media", "mediaId" to "orphelin-via-mediaId", plane = "bg")),
            ),
        )

        assertThat(
            CanvasMediaAdoption.orphanIds(effects(media("o1", "bon")), listOf("bon"), canvas),
        ).containsExactly("orphelin-via-mediaId")
    }

    @Test
    fun `postMediaId is the reference spelling and mediaId the second`() {
        val both = sceneObject("o", "media", "postMediaId" to "ref", "mediaId" to "second")
        val onlySecond = sceneObject("o", "media", "mediaId" to "second")
        val neither = sceneObject("o", "media")
        val emptyFirst = sceneObject("o", "media", "postMediaId" to "", "mediaId" to "second")

        assertThat(both.mediaReference).isEqualTo("ref")
        assertThat(onlySecond.mediaReference).isEqualTo("second")
        assertThat(neither.mediaReference).isNull()
        assertThat(emptyFirst.mediaReference).isEqualTo("second")
    }

    @Test
    fun `designated ids gather the runtime objects and the carried scenes`() {
        val canvas = CanvasV3(
            scenes = listOf(
                scene("s1", sceneObject("a", "media", "postMediaId" to "scene-1")),
                scene("s2", sceneObject("b", "media", "mediaId" to "scene-2")),
            ),
        )

        assertThat(CanvasMediaAdoption.designatedIds(effects(media("o1", "runtime")), canvas))
            .containsExactly("runtime", "scene-1", "scene-2").inOrder()
    }

    @Test
    fun `designated ids ignore sounds and stickers of the scenes`() {
        val canvas = CanvasV3(
            scenes = listOf(
                scene(
                    "s1",
                    sceneObject("a", "audio", "postMediaId" to "son"),
                    sceneObject("b", "sticker", "postMediaId" to "autocollant"),
                    sceneObject("c", "text", "postMediaId" to "texte"),
                ),
            ),
        )

        assertThat(CanvasMediaAdoption.designatedIds(StoryEffects(), canvas)).isEmpty()
    }

    // --- les mediaIds d'une publication (#8012) -----------------------------------

    @Test
    fun `publication media ids add the pre-uploaded media and the sounds without duplicates`() {
        val canvas = StoryEffects(
            mediaObjects = listOf(media("a", "pre-montee", background = true), media("b", "televersee")),
            audioPlayerObjects = listOf(
                StoryAudioPlayerObject(id = "s1", postMediaId = "piste"),
                StoryAudioPlayerObject(id = "s2", postMediaId = ""),
            ),
        )

        assertThat(CanvasMediaAdoption.publicationMediaIds(listOf("televersee"), canvas))
            .containsExactly("televersee", "pre-montee", "piste").inOrder()
    }

    @Test
    fun `publication media ids keep the stickers so they are not swept as abandoned uploads`() {
        val canvas = StoryEffects(
            stickerObjects = listOf(
                StorySticker(id = "k1", postMediaId = "autocollant"),
                StorySticker(id = "k2", emoji = "🎉"),
            ),
        )

        assertThat(CanvasMediaAdoption.publicationMediaIds(emptyList(), canvas))
            .containsExactly("autocollant")
    }

    @Test
    fun `publication media ids reach the sounds and stickers of the carried scenes`() {
        val document = CanvasV3(
            scenes = listOf(
                scene(
                    "s2",
                    sceneObject("a", "audio", "postMediaId" to "son-2"),
                    sceneObject("b", "sticker", "mediaId" to "autocollant-2"),
                    sceneObject("c", "media", "postMediaId" to "photo-2"),
                ),
            ),
        )

        assertThat(CanvasMediaAdoption.publicationMediaIds(listOf("u"), StoryEffects(), document))
            .containsExactly("u", "photo-2", "son-2", "autocollant-2").inOrder()
    }

    @Test
    fun `publication media ids of a missing canvas are the uploaded ones`() {
        assertThat(CanvasMediaAdoption.publicationMediaIds(listOf("u", "", "u", "v"), null))
            .containsExactly("u", "v").inOrder()
    }

    // --- l'adoption : le canvas reprend l'identité que le post vient de créer -----

    @Test
    fun `adoption rewrites the identity and the url of the media at the position of its file`() {
        val adopted = CanvasMediaAdoption.adopting(
            effects(media("obj-0", "pre-0", background = true, url = "file:///0"), media("obj-1", "pre-1")),
            objectIdsBySourceIndex = listOf("obj-0", "obj-1"),
            idsBySourceIndex = mapOf(0 to "srv-0", 1 to "srv-1"),
            urlsBySourceIndex = mapOf(0 to "u/0.jpg", 1 to "u/1.jpg"),
        )

        assertThat(adopted.effects?.mediaObjects?.map { it.postMediaId }).containsExactly("srv-0", "srv-1").inOrder()
        assertThat(adopted.effects?.mediaObjects?.map { it.mediaURL }).containsExactly("u/0.jpg", "u/1.jpg").inOrder()
        assertThat(
            CanvasMediaAdoption.isCoherent(adopted.effects!!, listOf("srv-0", "srv-1")),
        ).isTrue()
    }

    @Test
    fun `adoption pairs by object id and not by walking order`() {
        val adopted = CanvasMediaAdoption.adopting(
            effects(media("a", "x", background = true), media("b", "x"), media("c", "x")),
            objectIdsBySourceIndex = listOf("c", "b", "a"),
            idsBySourceIndex = mapOf(0 to "srv-c", 1 to "srv-b", 2 to "srv-a"),
            urlsBySourceIndex = mapOf(0 to "u/c", 1 to "u/b", 2 to "u/a"),
        )

        val byId = adopted.effects!!.mediaObjects!!.associate { it.id to it.postMediaId }
        assertThat(byId).containsExactly("a", "srv-a", "b", "srv-b", "c", "srv-c")
    }

    @Test
    fun `a skipped upload does not shift the following files`() {
        val adopted = CanvasMediaAdoption.adopting(
            effects(media("o0", ""), media("o1", ""), media("o2", "")),
            objectIdsBySourceIndex = listOf("o0", "o1", "o2"),
            idsBySourceIndex = mapOf(0 to "srv-0", 2 to "srv-2"),
            urlsBySourceIndex = mapOf(0 to "u/0", 2 to "u/2"),
        )

        assertThat(adopted.effects!!.mediaObjects!!.map { it.postMediaId })
            .containsExactly("srv-0", "", "srv-2").inOrder()
        assertThat(CanvasMediaAdoption.isCoherent(adopted.effects!!, listOf("srv-0", "srv-2"))).isTrue()
    }

    @Test
    fun `a sound and a sticker are adopted like a visual media`() {
        val document = StoryEffects(
            audioPlayerObjects = listOf(StoryAudioPlayerObject(id = "son", postMediaId = "pre-son")),
            stickerObjects = listOf(StorySticker(id = "autocollant", postMediaId = "pre-stk", emoji = "🎉")),
        )

        val adopted = CanvasMediaAdoption.adopting(
            document,
            objectIdsBySourceIndex = listOf("son", "autocollant"),
            idsBySourceIndex = mapOf(0 to "srv-son", 1 to "srv-stk"),
            urlsBySourceIndex = mapOf(0 to "u/son.m4a", 1 to "u/stk.png"),
        )

        assertThat(adopted.effects!!.audioPlayerObjects!!.single().postMediaId).isEqualTo("srv-son")
        assertThat(adopted.effects!!.stickerObjects!!.single().postMediaId).isEqualTo("srv-stk")
        assertThat(adopted.effects!!.stickerObjects!!.single().emoji).isEqualTo("🎉")
    }

    @Test
    fun `an object outside the bridge is left intact rather than emptied`() {
        val adopted = CanvasMediaAdoption.adopting(
            effects(media("connu", "x", background = true), media("inconnu", "deja-bon")),
            objectIdsBySourceIndex = listOf("connu"),
            idsBySourceIndex = mapOf(0 to "srv-0"),
            urlsBySourceIndex = mapOf(0 to "u/0"),
        )

        val byId = adopted.effects!!.mediaObjects!!.associate { it.id to it.postMediaId }
        assertThat(byId).containsExactly("connu", "srv-0", "inconnu", "deja-bon")
    }

    @Test
    fun `a media already online keeps its url when the dispatch served none`() {
        val adopted = CanvasMediaAdoption.adoptingServed(
            effects(media("o", "pre", url = "https://cdn/pre.jpg")),
            canvas = null,
            served = mapOf("o" to ServedMedia(id = "srv")),
        )

        val adoptedMedia = adopted.effects!!.mediaObjects!!.single()
        assertThat(adoptedMedia.postMediaId).isEqualTo("srv")
        assertThat(adoptedMedia.mediaURL).isEqualTo("https://cdn/pre.jpg")
    }

    @Test
    fun `adoption leaves every other family of the effects untouched`() {
        val document = effects(media("o", "pre")).copy(
            background = "#101828",
            backgroundAudioId = "sound-42",
            backgroundAudioStart = 3.5,
            timelineDuration = 9.0,
            thumbHash = "hash",
        )

        val adopted = CanvasMediaAdoption.adopting(
            document,
            objectIdsBySourceIndex = listOf("o"),
            idsBySourceIndex = mapOf(0 to "srv"),
            urlsBySourceIndex = mapOf(0 to "u"),
        )

        assertThat(adopted.effects).isEqualTo(
            document.copy(mediaObjects = listOf(media("o", "srv", url = "u"))),
        )
    }

    @Test
    fun `a color-only canvas crosses the adoption with its color`() {
        val colorOnly = StoryEffects(background = "#FF5A5F", mediaObjects = emptyList())

        val adopted = CanvasMediaAdoption.adopting(
            colorOnly,
            objectIdsBySourceIndex = null,
            idsBySourceIndex = emptyMap(),
            urlsBySourceIndex = emptyMap(),
        )

        assertThat(adopted.effects?.background).isEqualTo("#FF5A5F")
        assertThat(CanvasMediaAdoption.orphanIds(adopted.effects!!, emptyList())).isEmpty()
    }

    @Test
    fun `a post without canvas crosses the adoption unchanged`() {
        val adopted = CanvasMediaAdoption.adopting(
            effects = null,
            objectIdsBySourceIndex = listOf("o"),
            idsBySourceIndex = mapOf(0 to "srv"),
            urlsBySourceIndex = mapOf(0 to "u"),
        )

        assertThat(adopted.effects).isNull()
        assertThat(adopted.canvas).isNull()
    }

    // --- une adoption impossible est journalisée ----------------------------------

    @Test
    fun `an impossible adoption is reported and leaves the document as it was`() {
        val reasons = mutableListOf<String>()
        val document = effects(media("o", "pre"))

        val adopted = CanvasMediaAdoption.adopting(
            document,
            objectIdsBySourceIndex = null,
            idsBySourceIndex = mapOf(0 to "srv"),
            urlsBySourceIndex = emptyMap(),
            onImpossible = { reasons += it },
        )

        assertThat(adopted.effects).isEqualTo(document)
        assertThat(reasons).hasSize(1)
        assertThat(reasons.single()).contains("objectIds")
    }

    @Test
    fun `an adoption without any document is reported too`() {
        val reasons = mutableListOf<String>()

        CanvasMediaAdoption.adopting(
            effects = null,
            objectIdsBySourceIndex = listOf("o"),
            idsBySourceIndex = emptyMap(),
            urlsBySourceIndex = emptyMap(),
            onImpossible = { reasons += it },
        )

        assertThat(reasons).hasSize(1)
        assertThat(reasons.single()).contains("effects")
    }

    @Test
    fun `a possible adoption reports nothing`() {
        val reasons = mutableListOf<String>()

        CanvasMediaAdoption.adopting(
            effects(media("o", "pre")),
            objectIdsBySourceIndex = listOf("o"),
            idsBySourceIndex = mapOf(0 to "srv"),
            urlsBySourceIndex = mapOf(0 to "u"),
            onImpossible = { reasons += it },
        )

        assertThat(reasons).isEmpty()
    }

    // --- les scènes que le canvas transporte s'adoptent comme le runtime ----------

    private fun twoSceneDocument(): CanvasV3 = CanvasV3(
        v = 3,
        scenes = listOf(
            scene("s1", sceneObject("obj-0", "media", "postMediaId" to "pre-0")),
            scene(
                "s2",
                sceneObject("obj-1", "media", "mediaId" to "pre-1", "mediaURL" to "file:///1"),
                sceneObject("texte", "text", "text" to "Salut"),
                carrierAspect = 16.0 / 9.0,
            ),
        ),
        sound = BackgroundSoundV3(volume = 0.4),
        layout = MosaicLayoutMode.HERO,
    )

    @Test
    fun `the scenes carried by the canvas are adopted as well`() {
        val adopted = CanvasMediaAdoption.adopting(
            effects(media("obj-0", "pre-0", background = true)),
            canvas = twoSceneDocument(),
            objectIdsBySourceIndex = listOf("obj-0", "obj-1"),
            idsBySourceIndex = mapOf(0 to "srv-0", 1 to "srv-1"),
            urlsBySourceIndex = mapOf(0 to "u/0.jpg", 1 to "u/1.jpg"),
        )

        assertThat(adopted.canvas!!.scenes.map { mediaIdsOf(it).firstOrNull() })
            .containsExactly("srv-0", "srv-1").inOrder()
        assertThat(
            CanvasMediaAdoption.isCoherent(adopted.effects!!, listOf("srv-0", "srv-1"), adopted.canvas),
        ).isTrue()
    }

    @Test
    fun `a scene object drops the second spelling and takes the served url`() {
        val adopted = CanvasMediaAdoption.adoptingServed(
            effects = null,
            canvas = twoSceneDocument(),
            served = mapOf("obj-1" to ServedMedia(id = "srv-1", url = "u/1.jpg")),
        )

        val payload = adopted.canvas!!.scenes[1].objects[0].payload
        assertThat(payload["postMediaId"]).isEqualTo(JsonPrimitive("srv-1"))
        assertThat(payload).doesNotContainKey("mediaId")
        assertThat(payload["mediaURL"]).isEqualTo(JsonPrimitive("u/1.jpg"))
    }

    @Test
    fun `a scene object already online keeps its url when none was served`() {
        val adopted = CanvasMediaAdoption.adoptingServed(
            effects = null,
            canvas = twoSceneDocument(),
            served = mapOf("obj-1" to ServedMedia(id = "srv-1")),
        )

        assertThat(adopted.canvas!!.scenes[1].objects[0].payload["mediaURL"])
            .isEqualTo(JsonPrimitive("file:///1"))
    }

    @Test
    fun `rebuilding the scenes keeps opening, closing, transitions, duration, thumbHash and carrier ratio`() {
        val opening = buildJsonObject { put("type", "fade") }
        val closing = buildJsonObject { put("type", "zoom") }
        val transition = buildJsonObject { put("id", "t1") }
        val document = CanvasV3(
            v = 3,
            scenes = listOf(
                SceneV3(
                    id = "s1",
                    objects = listOf(sceneObject("obj", "media", "postMediaId" to "pre")),
                    opening = opening,
                    closing = closing,
                    clipTransitions = listOf(transition),
                    timelineDuration = 7.5,
                    thumbHash = "thumb",
                    carrierAspect = 1.0,
                ),
            ),
            sound = BackgroundSoundV3(volume = 0.4),
            layout = MosaicLayoutMode.REEL,
        )

        val adopted = CanvasMediaAdoption.adoptingServed(
            effects = null,
            canvas = document,
            served = mapOf("obj" to ServedMedia(id = "srv", url = "u")),
        ).canvas!!

        val scene = adopted.scenes.single()
        assertThat(scene.id).isEqualTo("s1")
        assertThat(scene.opening).isEqualTo(opening)
        assertThat(scene.closing).isEqualTo(closing)
        assertThat(scene.clipTransitions).containsExactly(transition)
        assertThat(scene.timelineDuration).isEqualTo(7.5)
        assertThat(scene.thumbHash).isEqualTo("thumb")
        assertThat(scene.carrierAspect).isEqualTo(1.0)
        assertThat(adopted.v).isEqualTo(3)
        assertThat(adopted.sound).isEqualTo(BackgroundSoundV3(volume = 0.4))
        assertThat(adopted.layout).isEqualTo(MosaicLayoutMode.REEL)
        assertThat(adopted.scenes.single().objects.single().mediaReference).isEqualTo("srv")
    }

    @Test
    fun `adoption rebuilds the document and never mutates the one it was given`() {
        val document = twoSceneDocument()
        val before = document.toString()

        CanvasMediaAdoption.adoptingServed(
            effects = null,
            canvas = document,
            served = mapOf("obj-0" to ServedMedia("srv-0", "u"), "obj-1" to ServedMedia("srv-1", "u")),
        )

        assertThat(document.toString()).isEqualTo(before)
    }

    @Test
    fun `only the families that designate a file are adopted`() {
        val document = CanvasV3(
            scenes = listOf(
                scene(
                    "s1",
                    sceneObject("texte", "text", "text" to "Salut", "postMediaId" to "intact"),
                    sceneObject("dessin", "drawing", "postMediaId" to "intact"),
                    sceneObject("son", "audio", "postMediaId" to "pre-son"),
                    sceneObject("stk", "sticker", "postMediaId" to "pre-stk"),
                ),
            ),
        )
        val served = listOf("texte", "dessin", "son", "stk").associateWith { ServedMedia("srv-$it") }

        val adopted = CanvasMediaAdoption.adoptingServed(null, document, served).canvas!!

        assertThat(mediaIdsOf(adopted.scenes.single()))
            .containsExactly("intact", "intact", "srv-son", "srv-stk").inOrder()
    }

    @Test
    fun `the sound and the sticker of a carried scene are adopted with the scenes`() {
        val document = CanvasV3(
            scenes = listOf(
                scene(
                    "s1",
                    sceneObject("son", "audio", "postMediaId" to "pre-son"),
                    sceneObject("stk", "sticker", "postMediaId" to "pre-stk"),
                ),
            ),
        )

        val adopted = CanvasMediaAdoption.adopting(
            effects = StoryEffects(),
            canvas = document,
            objectIdsBySourceIndex = listOf("son", "stk"),
            idsBySourceIndex = mapOf(0 to "srv-son", 1 to "srv-stk"),
            urlsBySourceIndex = mapOf(0 to "u/son", 1 to "u/stk"),
        )

        assertThat(mediaIdsOf(adopted.canvas!!.scenes.single())).containsExactly("srv-son", "srv-stk").inOrder()
        assertThat(
            CanvasMediaAdoption.publicationMediaIds(emptyList(), adopted.effects, adopted.canvas),
        ).containsExactly("srv-son", "srv-stk").inOrder()
    }

    // --- l'adoption par identité : le téléversement différé a livré son vrai id ---

    @Test
    fun `adopting by media identity swaps a placeholder for the real id everywhere it is designated`() {
        val document = StoryEffects(
            mediaObjects = listOf(media("a", "cmid-1", background = true), media("b", "autre")),
            audioPlayerObjects = listOf(StoryAudioPlayerObject(id = "s", postMediaId = "cmid-1")),
            stickerObjects = listOf(StorySticker(id = "k", postMediaId = "cmid-1", emoji = "⭐")),
        )
        val carried = CanvasV3(
            scenes = listOf(scene("s2", sceneObject("c", "media", "mediaId" to "cmid-1"))),
        )

        val adopted = CanvasMediaAdoption.adoptingByMedia(
            document,
            carried,
            replacing = mapOf("cmid-1" to ServedMedia(id = "real-9")),
        )

        assertThat(adopted.effects!!.mediaObjects!!.map { it.postMediaId }).containsExactly("real-9", "autre").inOrder()
        assertThat(adopted.effects!!.audioPlayerObjects!!.single().postMediaId).isEqualTo("real-9")
        assertThat(adopted.effects!!.stickerObjects!!.single().postMediaId).isEqualTo("real-9")
        assertThat(adopted.canvas!!.scenes.single().objects.single().mediaReference).isEqualTo("real-9")
        assertThat(adopted.canvas!!.scenes.single().objects.single().payload).doesNotContainKey("mediaId")
    }

    @Test
    fun `adopting by media identity leaves an unrelated document identical`() {
        val document = effects(media("a", "autre"))

        val adopted = CanvasMediaAdoption.adoptingByMedia(
            document,
            canvas = null,
            replacing = mapOf("cmid-1" to ServedMedia(id = "real-9")),
        )

        assertThat(adopted.effects).isEqualTo(document)
    }

    @Test
    fun `adopting by media identity never matches an object without a designation`() {
        val document = effects(media("a", ""))

        val adopted = CanvasMediaAdoption.adoptingByMedia(
            document,
            canvas = null,
            replacing = mapOf("" to ServedMedia(id = "real-9")),
        )

        assertThat(adopted.effects).isEqualTo(document)
    }

    // --- non-régression : un post publié puis relu rend les mêmes médias ---------

    @Test
    fun `a published document read back designates the same media the post owns`() {
        val wire = Json {
            ignoreUnknownKeys = true
            isLenient = true
            explicitNulls = false
            coerceInputValues = true
        }
        val published = CanvasMediaAdoption.adopting(
            StoryEffects(
                mediaObjects = listOf(media("fond", "pre-fond", background = true), media("photo", "pre-photo")),
                audioPlayerObjects = listOf(StoryAudioPlayerObject(id = "son", postMediaId = "pre-son")),
            ),
            objectIdsBySourceIndex = listOf("fond", "photo", "son"),
            idsBySourceIndex = mapOf(0 to "srv-fond", 1 to "srv-photo", 2 to "srv-son"),
            urlsBySourceIndex = mapOf(0 to "u/fond", 1 to "u/photo", 2 to "u/son"),
        ).effects!!
        val postMediaIds = CanvasMediaAdoption.publicationMediaIds(emptyList(), published)

        val reread = wire.decodeFromString(
            StoryEffectsWireSerializer,
            wire.encodeToString(StoryEffectsWireSerializer, published),
        )

        assertThat(CanvasMediaAdoption.designatedIds(reread)).containsExactlyElementsIn(
            CanvasMediaAdoption.designatedIds(published),
        ).inOrder()
        assertThat(CanvasMediaAdoption.publicationMediaIds(emptyList(), reread))
            .containsExactlyElementsIn(postMediaIds).inOrder()
        assertThat(CanvasMediaAdoption.isCoherent(reread, postMediaIds)).isTrue()
    }
}
