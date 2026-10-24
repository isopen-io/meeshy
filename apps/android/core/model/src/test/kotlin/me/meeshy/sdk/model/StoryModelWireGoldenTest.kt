package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.doubleOrNull
import org.junit.Test

/**
 * Le format du fil de la story est verrouillé AVANT que le modèle ne soit rangé un
 * type par fichier. Un déplacement de classe est un geste pur seulement si rien de
 * ce qui traverse le fil ne bouge : ni un nom (`@SerialName`, nom de propriété), ni
 * un défaut, ni un type de champ. Un nom perdu en route ne rougit nulle part — le
 * décodeur ignore l'inconnu, la story se dessine, et la propriété disparaît à la
 * réécriture du cache.
 *
 * L'oracle est un document `StoryEffects` tel qu'iOS l'écrit (champs optionnels
 * présents seulement s'ils portent une valeur, entiers sans partie décimale,
 * transitions sous leur forme chaîne) où CHAQUE champ de CHAQUE type du modèle porte
 * une valeur différente de son défaut : l'encodeur de production
 * (`encodeDefaults = false`) omet ce qui vaut le défaut, donc un champ laissé à son
 * défaut ne prouverait rien. Lire puis réécrire ce document doit rendre un arbre
 * JSON identique, au chiffre près (`28` et `28.0` sont le même nombre).
 */
class StoryModelWireGoldenTest {

    private val production = Json {
        ignoreUnknownKeys = true
        isLenient = true
        explicitNulls = false
        coerceInputValues = true
    }

    private val exhaustive = Json {
        ignoreUnknownKeys = true
        isLenient = true
        explicitNulls = false
        coerceInputValues = true
        encodeDefaults = true
    }

    private fun canonical(element: JsonElement): JsonElement = when (element) {
        is JsonObject -> JsonObject(element.mapValues { canonical(it.value) })
        is JsonArray -> JsonArray(element.map(::canonical))
        is JsonPrimitive -> if (element.isString) element else element.doubleOrNull?.let(::JsonPrimitive) ?: element
    }

    private fun tree(raw: String): JsonElement = canonical(production.parseToJsonElement(raw))

    private val iosStoryEffects = """
        {
          "background": "gradient:#1E1B4B,#6366F1",
          "textStyle": "neon",
          "textColor": "#F8FAFC",
          "textPosition": "top",
          "filter": "vintage",
          "filterIntensity": 0.8,
          "stickers": ["✨", "🔥"],
          "textAlign": "left",
          "textSize": 28,
          "textBg": "#00000080",
          "textOffsetY": 12,
          "stickerObjects": [
            { "id": "st1", "emoji": "🔥", "postMediaId": "64f0a1b2c3d4e5f6a7b8c9d0", "provider": "library",
              "x": 0.8, "y": 0.7, "scale": 1.5, "rotation": 15, "zIndex": 4, "baseSize": 300,
              "anchor": { "x": 0.25, "y": 0.75 },
              "startTime": 1, "duration": 4, "fadeIn": 0.3, "fadeOut": 0.5 }
          ],
          "textPositionPoint": { "x": 0.3, "y": 0.7 },
          "backgroundAudioId": "snd_nuits_ete",
          "backgroundAudioVolume": 0.5,
          "backgroundAudioStart": 2,
          "backgroundAudioEnd": 17,
          "voiceAttachmentId": "64f0a1b2c3d4e5f6a7b8c9d1",
          "voiceTranscriptions": [
            { "language": "fr", "content": "Salut à tous" },
            { "language": "en", "content": "Hi everyone" }
          ],
          "opening": "fade",
          "closing": "zoom",
          "textObjects": [
            { "id": "t1", "text": "Salut", "x": 0.25, "y": 0.2, "scale": 1.2, "rotation": 5, "zIndex": 3,
              "anchor": { "x": 0.1, "y": 0.9 },
              "fontSize": 48, "fontFamily": "serif",
              "textStyle": "typewriter", "textColor": "#FFD166", "textAlign": "right", "textBg": "#11111180",
              "backgroundStyle": { "type": "glass", "hex": "#FFFFFF33", "radius": 12 },
              "borderColor": "#EF476F", "borderWidth": 2,
              "textEffect": "neon-glow",
              "translations": { "en": "Hi", "es": "Hola" },
              "sourceLanguage": "fr",
              "startTime": 1, "duration": 6, "fadeIn": 0.25, "fadeOut": 0.75, "isLocked": true,
              "keyframes": [
                { "id": "k1", "time": 1, "x": 0.2, "y": 0.3, "scale": 1.1, "opacity": 0, "easing": "easeIn" },
                { "id": "k2", "time": 2.5, "opacity": 1, "easing": "easeInOut" }
              ] }
          ],
          "mediaObjects": [
            { "id": "m1", "postMediaId": "64f0a1b2c3d4e5f6a7b8c9d2", "mediaURL": "https://cdn.meeshy.me/m1.mp4",
              "mediaType": "video", "placement": "background",
              "x": 0.4, "y": 0.6, "scale": 0.9, "rotation": 3, "volume": 0.5, "aspectRatio": 1.7777,
              "anchor": { "x": 0.4, "y": 0.0 },
              "intrinsicDuration": 12.5, "isBackground": true, "loop": true,
              "crop": { "x": 0.1, "y": 0.2, "width": 0.5, "height": 0.6 },
              "zIndex": 2, "startTime": 0.5, "duration": 8, "sourceStart": 3, "sourceEnd": 8,
              "fadeIn": 0.5, "fadeOut": 1.5, "sourceLanguage": "en",
              "keyframes": [ { "id": "k3", "time": 0.5, "scale": 1, "easing": "linear" },
                             { "id": "k4", "time": 4, "scale": 1.3, "easing": "easeOut" } ] }
          ],
          "audioPlayerObjects": [
            { "id": "a1", "postMediaId": "64f0a1b2c3d4e5f6a7b8c9d3", "placement": "canvas",
              "x": 0.4, "y": 0.6, "volume": 0.75, "waveformSamples": [0.25, 0.5, 0.125],
              "isBackground": true,
              "backgroundAudioVariants": [
                { "postMediaId": "64f0a1b2c3d4e5f6a7b8c9d4", "language": "es", "isAutoGenerated": false }
              ],
              "zIndex": 6, "startTime": 1.5, "duration": 9, "sourceStart": 2, "sourceEnd": 11,
              "loop": true, "fadeIn": 0.5, "fadeOut": 1, "sourceLanguage": "fr" }
          ],
          "drawingStrokes": [
            { "id": "d1", "points": [ { "x": 100, "y": 200, "pressure": 0.5 }, { "x": 150, "y": 260, "pressure": 0.75 } ],
              "colorHex": "#06D6A0", "width": 8, "tool": "marker", "smoothing": "curve",
              "createdAt": 1700000000.5, "captureVersion": 1 }
          ],
          "backgroundAudioVariants": [
            { "postMediaId": "64f0a1b2c3d4e5f6a7b8c9d5", "language": "pt", "isAutoGenerated": false }
          ],
          "thumbHash": "3OcRJYB4d3h/iIeHeEh3eIhw+j3A",
          "backgroundTransform": { "scale": 1.1, "offsetX": 0.02, "offsetY": -0.04, "rotation": 2 },
          "slideDuration": 7,
          "timelineDuration": 9.5,
          "clipTransitions": [
            { "id": "ct1", "fromClipId": "c1", "toClipId": "c2", "kind": "dissolve", "duration": 0.5, "easing": "easeInOut" }
          ],
          "musicTrackId": "legacy-track-9",
          "musicStartTime": 1.5,
          "musicEndTime": 21,
          "layout": "hero"
        }
    """.trimIndent()

    @Test
    fun `un StoryEffects ecrit par iOS traverse la lecture puis l'ecriture sans perdre une cle`() {
        val effects = production.decodeFromString(StoryEffects.serializer(), iosStoryEffects)

        val rewritten = production.encodeToJsonElement(StoryEffects.serializer(), effects)

        assertThat(canonical(rewritten)).isEqualTo(tree(iosStoryEffects))
    }

    @Test
    fun `chaque famille du document est lue avec la valeur que le fil lui donne`() {
        val effects = production.decodeFromString(StoryEffects.serializer(), iosStoryEffects)

        assertThat(effects.opening).isEqualTo(StoryTransitionEffect.FADE)
        assertThat(effects.closing).isEqualTo(StoryTransitionEffect.ZOOM)
        assertThat(effects.layout).isEqualTo(MosaicLayoutMode.HERO)
        assertThat(effects.textPositionPoint).isEqualTo(StoryTextPosition(x = 0.3, y = 0.7))
        assertThat(effects.voiceTranscriptions).containsExactly(
            StoryVoiceTranscription(language = "fr", content = "Salut à tous"),
            StoryVoiceTranscription(language = "en", content = "Hi everyone"),
        ).inOrder()
        assertThat(effects.backgroundTransform)
            .isEqualTo(StoryBackgroundTransform(scale = 1.1, offsetX = 0.02, offsetY = -0.04, rotation = 2.0))
        assertThat(effects.clipTransitions).containsExactly(
            StoryClipTransition(
                id = "ct1",
                fromClipId = "c1",
                toClipId = "c2",
                kind = StoryTransitionKind.DISSOLVE,
                duration = 0.5f,
                easing = StoryEasing.EASE_IN_OUT,
            ),
        )
        assertThat(effects.backgroundAudioVariants).containsExactly(
            StoryAudioVariant(postMediaId = "64f0a1b2c3d4e5f6a7b8c9d5", language = "pt", isAutoGenerated = false),
        )
        assertThat(effects.stickerObjects!!.single().hasImage).isTrue()
        assertThat(effects.stickerObjects!!.single().anchor).isEqualTo(StoryAnchorPoint(x = 0.25, y = 0.75))
    }

    @Test
    fun `les objets de la scene gardent leurs champs, leurs ancres et leurs keyframes`() {
        val effects = production.decodeFromString(StoryEffects.serializer(), iosStoryEffects)

        val text = effects.textObjects.single()
        assertThat(text.backgroundStyle).isEqualTo(StoryTextBackgroundStyle(type = "glass", hex = "#FFFFFF33", radius = 12.0))
        assertThat(text.anchor).isEqualTo(StoryAnchorPoint(x = 0.1, y = 0.9))
        assertThat(text.translations).containsExactly("en", "Hi", "es", "Hola")
        assertThat(text.keyframes!!.map { it.id to it.easing })
            .containsExactly("k1" to StoryEasing.EASE_IN, "k2" to StoryEasing.EASE_IN_OUT).inOrder()

        val media = effects.mediaObjects!!.single()
        assertThat(media.crop).isEqualTo(StoryMediaCrop(x = 0.1, y = 0.2, width = 0.5, height = 0.6))
        assertThat(media.keyframes!!.map { it.easing })
            .containsExactly(StoryEasing.LINEAR, StoryEasing.EASE_OUT).inOrder()

        val audio = effects.audioPlayerObjects!!.single()
        assertThat(audio.backgroundAudioVariants!!.single().language).isEqualTo("es")
        assertThat(audio.waveformSamples).containsExactly(0.25f, 0.5f, 0.125f).inOrder()
    }

    @Test
    fun `une diapositive ecrite par iOS repasse par le pont du fil sans perdre une cle`() {
        val slide = """
            { "id": "s1", "mediaURL": "https://cdn.meeshy.me/s1.jpg", "content": "Légende",
              "effects": $iosStoryEffects, "duration": 9.5, "order": 2 }
        """.trimIndent()

        val decoded = production.decodeFromString(StorySlide.serializer(), slide)
        val rewritten = production.encodeToJsonElement(StorySlide.serializer(), decoded)

        assertThat(canonical(rewritten)).isEqualTo(tree(slide))
    }

    @Test
    fun `une story publiee traverse la lecture puis l'ecriture sans perdre une cle`() {
        val item = """
            { "id": "p1", "content": "Bonjour",
              "media": [ { "id": "med1", "type": "video", "url": "https://cdn.meeshy.me/v.mp4",
                           "thumbnailUrl": "https://cdn.meeshy.me/v.jpg", "thumbnailColor": "FF6B6B",
                           "width": 1080, "height": 1920, "duration": 12 } ],
              "storyEffects": $iosStoryEffects,
              "createdAt": "2026-10-21T08:00:00.000Z", "expiresAt": "2026-10-22T04:00:00.000Z",
              "repostOfId": "p0", "originalRepostOfId": "p00",
              "repostAuthorName": "Alice", "repostAuthorUsername": "alice",
              "visibility": "FRIENDS", "audioUrl": "https://cdn.meeshy.me/a.m4a", "isViewed": true,
              "translations": [ { "language": "en", "content": "Hello" } ],
              "backgroundAudio": { "id": "snd1", "title": "Nuits d'été", "uploaderName": "Bob", "duration": 30,
                                   "fileUrl": "https://cdn.meeshy.me/snd1.m4a", "usageCount": 4, "isPublic": false },
              "reactionCount": 12, "commentCount": 3 }
        """.trimIndent()

        val decoded = production.decodeFromString(StoryItem.serializer(), item)
        val rewritten = production.encodeToJsonElement(StoryItem.serializer(), decoded)

        assertThat(canonical(rewritten)).isEqualTo(tree(item))
    }

    @Test
    fun `un groupe de stories garde ses champs et ses stories`() {
        val group = """
            { "id": "u1", "username": "alice", "avatarColor": "FF6B6B", "avatarURL": "https://cdn.meeshy.me/a.jpg",
              "stories": [ { "id": "p1", "content": "Bonjour", "isViewed": true, "reactionCount": 2 } ] }
        """.trimIndent()

        val decoded = production.decodeFromString(StoryGroup.serializer(), group)
        val rewritten = production.encodeToJsonElement(StoryGroup.serializer(), decoded)

        assertThat(canonical(rewritten)).isEqualTo(tree(group))
    }

    @Test
    fun `un statut garde ses champs`() {
        val status = """
            { "id": "st1", "userId": "u1", "username": "alice", "avatarColor": "FF6B6B", "moodEmoji": "😀",
              "content": "Ça va", "audioUrl": "https://cdn.meeshy.me/s.m4a",
              "createdAt": "2026-10-21T08:00:00.000Z", "expiresAt": "2026-10-22T08:00:00.000Z",
              "visibility": "FRIENDS", "reactionSummary": { "❤️": 2 }, "viaUsername": "bob" }
        """.trimIndent()

        val decoded = production.decodeFromString(StatusEntry.serializer(), status)
        val rewritten = production.encodeToJsonElement(StatusEntry.serializer(), decoded)

        assertThat(canonical(rewritten)).isEqualTo(tree(status))
    }

    /**
     * Les valeurs de défaut voyagent quand un appelant écrit avec `encodeDefaults` —
     * les noms de ces clés-là ne sont portés par aucun document ci-dessus, puisque
     * l'encodeur de production les omet.
     */
    @Test
    fun `les noms des champs a valeur par defaut sont figes`() {
        fun keys(element: JsonElement): Set<String> = (element as JsonObject).keys

        assertThat(keys(exhaustive.encodeToJsonElement(StoryTextObject.serializer(), StoryTextObject(id = "t"))))
            .containsExactly("id", "text", "x", "y", "scale", "rotation", "zIndex", "anchor", "fontSize", "fontFamily")
        assertThat(keys(exhaustive.encodeToJsonElement(StoryMediaObject.serializer(), StoryMediaObject(id = "m"))))
            .containsExactly(
                "id", "postMediaId", "mediaType", "placement", "x", "y", "scale", "rotation", "volume",
                "anchor", "isBackground", "loop", "zIndex",
            )
        assertThat(keys(exhaustive.encodeToJsonElement(StoryMediaObject.serializer(), StoryMediaObject(id = "m", aspectRatio = 1.0))))
            .contains("aspectRatio")
        assertThat(keys(exhaustive.encodeToJsonElement(StoryAudioPlayerObject.serializer(), StoryAudioPlayerObject(id = "a"))))
            .containsExactly("id", "postMediaId", "placement", "x", "y", "volume", "waveformSamples")
        assertThat(keys(exhaustive.encodeToJsonElement(StorySticker.serializer(), StorySticker(id = "s"))))
            .containsExactly("id", "emoji", "postMediaId", "x", "y", "scale", "rotation", "zIndex", "baseSize", "anchor")
        assertThat(keys(exhaustive.encodeToJsonElement(StoryClipTransition.serializer(), StoryClipTransition(id = "c"))))
            .containsExactly("id", "fromClipId", "toClipId", "kind", "duration")
        assertThat(keys(exhaustive.encodeToJsonElement(StoryKeyframe.serializer(), StoryKeyframe(id = "k"))))
            .containsExactly("id", "time")
        assertThat(keys(exhaustive.encodeToJsonElement(StoryEffects.serializer(), StoryEffects())))
            .containsExactly("textObjects")
        assertThat(keys(exhaustive.encodeToJsonElement(StorySlide.serializer(), StorySlide(id = "s"))))
            .containsExactly("id", "effects", "duration", "order")
        assertThat(keys(exhaustive.encodeToJsonElement(StoryItem.serializer(), StoryItem(id = "p"))))
            .containsExactly("id", "media", "isViewed", "reactionCount", "commentCount")
        assertThat(keys(exhaustive.encodeToJsonElement(StoryGroup.serializer(), StoryGroup(id = "g"))))
            .containsExactly("id", "username", "avatarColor", "stories")
        assertThat(keys(exhaustive.encodeToJsonElement(StatusEntry.serializer(), StatusEntry(id = "e"))))
            .containsExactly("id", "userId", "username", "avatarColor", "moodEmoji")
        assertThat(keys(exhaustive.encodeToJsonElement(StoryBackgroundAudioEntry.serializer(), StoryBackgroundAudioEntry(id = "b"))))
            .containsExactly("id", "title", "duration", "fileUrl", "usageCount", "isPublic")
    }

    @Test
    fun `les requetes sociales gardent leur vocabulaire`() {
        assertThat(exhaustive.encodeToJsonElement(ReactionRequest.serializer(), ReactionRequest(emoji = "❤️")))
            .isEqualTo(tree("""{ "emoji": "❤️" }"""))
        assertThat(exhaustive.encodeToJsonElement(RepostRequest.serializer(), RepostRequest(content = "Vu", isQuote = true, targetType = "STORY")))
            .isEqualTo(tree("""{ "content": "Vu", "isQuote": true, "targetType": "STORY" }"""))
        assertThat(
            exhaustive.encodeToJsonElement(
                StatusCreateRequest.serializer(),
                StatusCreateRequest(moodEmoji = "😀", content = "Ça va", visibilityUserIds = listOf("u1")),
            ),
        ).isEqualTo(
            tree("""{ "type": "STATUS", "moodEmoji": "😀", "content": "Ça va", "visibility": "PUBLIC", "visibilityUserIds": ["u1"] }"""),
        )
        assertThat(exhaustive.encodeToJsonElement(StoryViewRequest.serializer(), StoryViewRequest()))
            .isEqualTo(tree("""{ "viewed": true }"""))
    }

    @Test
    fun `les enums du fil gardent leurs noms`() {
        fun <T> names(serializer: kotlinx.serialization.KSerializer<T>, values: List<T>): List<String> =
            values.map { (production.encodeToJsonElement(serializer, it) as JsonPrimitive).content }

        assertThat(names(StoryTextStyle.serializer(), StoryTextStyle.entries))
            .containsExactly("bold", "neon", "typewriter", "handwriting", "classic").inOrder()
        assertThat(names(StoryFilter.serializer(), StoryFilter.entries))
            .containsExactly("vintage", "bw", "warm", "cool", "dramatic", "vivid", "fade", "chrome").inOrder()
        assertThat(names(StoryEasing.serializer(), StoryEasing.entries))
            .containsExactly("linear", "easeIn", "easeOut", "easeInOut").inOrder()
        assertThat(names(StoryMediaKind.serializer(), StoryMediaKind.entries))
            .containsExactly("image", "video").inOrder()
        assertThat(names(StoryTransitionEffect.serializer(), StoryTransitionEffect.entries))
            .containsExactly("fade", "zoom", "slide", "reveal").inOrder()
        assertThat(names(StoryTransitionKind.serializer(), StoryTransitionKind.entries))
            .containsExactly("crossfade", "dissolve").inOrder()
        assertThat(names(PostType.serializer(), PostType.entries))
            .containsExactly("POST", "REEL", "STORY", "STATUS").inOrder()
    }
}
