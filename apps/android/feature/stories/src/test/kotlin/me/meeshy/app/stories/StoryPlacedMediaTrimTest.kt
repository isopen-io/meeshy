package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.model.StoryDraftPlacedMediaSnapshot
import me.meeshy.sdk.model.StoryMediaObject
import me.meeshy.sdk.model.StorySourceWindow
import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.sdk.model.composer.ComposerObjectEditorSection
import me.meeshy.sdk.model.composer.MediaEditTool
import me.meeshy.sdk.model.media.MediaTrimBounds
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

/**
 * #13600 : comme iOS (`setSourceTrim`, `MediaTrimStrip`), une VIDÉO posée se rogne dans sa source — des bornes, jamais un
 * fichier recoupé — sans toucher aux autres médias ni à la scène ; elles partent en `mediaObjects[].sourceStart/sourceEnd`
 * avec la durée de la fenêtre, le brouillon les garde, le lecteur les joue. Absentes ⇒ source entière.
 */
@RunWith(JUnit4::class)
class StoryPlacedMediaTrimTest {
    private val trimSection = ComposerObjectEditorSection.Media(MediaEditTool.TRIM)

    private fun media(id: String, mime: String, durationMs: Long?) =
        UploadedMedia(id = id, url = "https://cdn/$id", mimeType = mime, fileSize = 1, width = 10, height = 10, durationMs = durationMs, thumbnailUrl = null)

    private fun state(vararg placed: StoryPlacedMedia, durations: Map<String, Long?> = mapOf("v1" to 20_000L, "v2" to 30_000L)): StoryComposerUiState {
        val ids = placed.map { it.mediaId }
        val slide = StorySlide(id = "s", mediaIds = ids, placedMedia = placed.toList())
        val attachments = ids.map { media(it, if (it.startsWith("v")) "video/mp4" else "image/jpeg", durations[it]) }
        return StoryComposerUiState(deck = StorySlideDeck(listOf(slide), "s"), attachments = attachments)
    }

    private fun trimmed(base: StoryComposerUiState, id: String, start: Double, end: Double) =
        StoryComposerPlacedMediaReducer.trimmed(base, id, MediaTrimBounds(start, end))

    @Test
    fun `rogner une video posee ne touche ni les autres medias ni la scene`() {
        val base = state(StoryPlacedMedia("v1"), StoryPlacedMedia("v2"))

        val next = trimmed(base, "v1", 3.0, 9.0)

        val placed = next.deck.selectedSlide.placedMedia
        assertThat(placed.first { it.mediaId == "v1" }.trim).isEqualTo(MediaTrimBounds(3.0, 9.0))
        assertThat(placed.first { it.mediaId == "v2" }.trim).isNull()
        assertThat(next.deck.selectedSlide.filter).isNull()
        assertThat(next.placedTrimOf("v1")).isEqualTo(MediaTrimBounds(3.0, 9.0))
        assertThat(next.placedTrimOf("v2")).isEqualTo(MediaTrimBounds(0.0, 30.0))
    }

    @Test
    fun `les bornes sont ramenees dans la source et au plancher de duree`() {
        val base = state(StoryPlacedMedia("v1"))

        assertThat(trimmed(base, "v1", -4.0, 99.0).deck.selectedSlide.placedMedia.single().trim).isNull()
        assertThat(trimmed(base, "v1", 5.0, 5.1).deck.selectedSlide.placedMedia.single().trim).isNull()
        assertThat(trimmed(base, "v1", 5.0, 99.0).deck.selectedSlide.placedMedia.single().trim).isEqualTo(MediaTrimBounds(5.0, 20.0))
    }

    @Test
    fun `la source entiere efface le rognage au lieu d ecrire des bornes`() {
        val base = trimmed(state(StoryPlacedMedia("v1")), "v1", 3.0, 9.0)

        val whole = trimmed(base, "v1", 0.0, 20.0).deck.selectedSlide.placedMedia.single()

        assertThat(whole.sourceStart).isNull()
        assertThat(whole.sourceEnd).isNull()
    }

    @Test
    fun `rogner une image, un media non pose, une video de duree inconnue ou la meme fenetre est inerte`() {
        val base = state(StoryPlacedMedia("i1"), StoryPlacedMedia("v3"), durations = mapOf("v3" to null))
        assertThat(trimmed(base, "i1", 1.0, 2.0)).isEqualTo(base)
        assertThat(trimmed(base, "v3", 1.0, 5.0)).isEqualTo(base)
        assertThat(trimmed(base, "ghost", 1.0, 5.0)).isEqualTo(base)

        val once = trimmed(state(StoryPlacedMedia("v1")), "v1", 3.0, 9.0)
        assertThat(trimmed(once, "v1", 3.0, 9.0)).isEqualTo(once)
    }

    @Test
    fun `le rail offre le rognage a une video de duree connue seulement`() {
        val s = state(StoryPlacedMedia("v1"), StoryPlacedMedia("i1"), StoryPlacedMedia("v3"), durations = mapOf("v1" to 20_000L, "v3" to null))

        assertThat(s.mediaSectionsFor("v1")).contains(trimSection)
        assertThat(s.mediaSectionsFor("i1")).doesNotContain(trimSection)
        assertThat(s.mediaSectionsFor("v3")).doesNotContain(trimSection)
    }

    @Test
    fun `la publication ecrit les bornes, la duree de la fenetre et garde la duree de la source`() {
        val placed = StoryPlacedMedia("v1", sourceStart = 3.0, sourceEnd = 9.0)

        val obj = placed.toMediaObject("https://x/v1.mp4", "video/mp4", 20.0)

        assertThat(obj.sourceStart).isEqualTo(3.0)
        assertThat(obj.sourceEnd).isEqualTo(9.0)
        assertThat(obj.duration).isEqualTo(6.0)
        assertThat(obj.intrinsicDuration).isEqualTo(20.0)
    }

    @Test
    fun `une video non rognee ou une image ne part avec aucune borne`() {
        val whole = StoryPlacedMedia("v1").toMediaObject("https://x/v1.mp4", "video/mp4", 20.0)
        val image = StoryPlacedMedia("i1", sourceStart = 1.0, sourceEnd = 4.0).toMediaObject("https://x/i1.jpg", "image/jpeg", null)

        assertThat(whole.sourceStart).isNull()
        assertThat(whole.duration).isEqualTo(20.0)
        assertThat(image.sourceStart).isNull()
        assertThat(image.sourceEnd).isNull()
    }

    @Test
    fun `un media en attente d envoi garde sa fenetre sur la ligne d outbox`() {
        val slide = StorySlide(id = "s", mediaIds = listOf("cmid"), placedMedia = listOf(StoryPlacedMedia("cmid", sourceStart = 2.0, sourceEnd = 5.0)))
        val state = StoryComposerUiState(
            deck = StorySlideDeck(listOf(slide), "s"),
            pendingUploads = listOf(PendingMediaUpload("cmid", MediaUploadItem(ByteArray(1), "a.mp4", "video/mp4"))),
        )

        val obj = StoryPublishPlacedMedia.resolve(slide, state).single()

        assertThat(obj.sourceStart).isEqualTo(2.0)
        assertThat(obj.sourceEnd).isEqualTo(5.0)
        assertThat(obj.duration).isEqualTo(3.0)
    }

    @Test
    fun `une borne seule ou une fenetre sous le plancher vaut la source entiere`() {
        assertThat(StoryPlacedMedia("v1", sourceStart = 3.0).normalised().sourceStart).isNull()
        assertThat(StoryPlacedMedia("v1", sourceEnd = 3.0).normalised().sourceEnd).isNull()
        assertThat(StoryPlacedMedia("v1", sourceStart = 3.0, sourceEnd = 3.1).normalised().trim).isNull()
        assertThat(StoryPlacedMedia("v1", sourceStart = Double.NaN, sourceEnd = 3.0).normalised().trim).isNull()
    }

    @Test
    fun `le brouillon garde la fenetre aller retour`() {
        val deck = StorySlideDeck(listOf(StorySlide(id = "s", mediaIds = listOf("v1"), placedMedia = listOf(StoryPlacedMedia("v1", sourceStart = 3.0, sourceEnd = 9.0)))), "s")
        val json = Json { ignoreUnknownKeys = true }
        val snapshot = deck.toDraftSnapshot(StoryVisibility.PUBLIC, null, "2026-10-29T00:00:00Z")

        val wire = json.encodeToString(me.meeshy.sdk.model.StoryComposerDraftSnapshot.serializer(), snapshot)
        val back = json.decodeFromString(me.meeshy.sdk.model.StoryComposerDraftSnapshot.serializer(), wire).toDeck()!!

        assertThat(back.slides.single().placedMedia.single().trim).isEqualTo(MediaTrimBounds(3.0, 9.0))
    }

    @Test
    fun `un ancien brouillon sans fenetre se lit en source entiere`() {
        val old = Json { ignoreUnknownKeys = true }.decodeFromString<StoryDraftPlacedMediaSnapshot>("""{"id":"v1","x":0.2}""")

        assertThat(old.sourceStart).isNull()
        assertThat(StoryPlacedMedia.from(old).trim).isNull()
    }

    @Test
    fun `une video rognee par iOS se relit avec sa fenetre, une image sans`() {
        val ios = StoryMediaObject(id = "o", postMediaId = "v1", mediaType = "video", sourceStart = 2.0, sourceEnd = 6.0)
        val img = StoryMediaObject(id = "p", postMediaId = "i1", mediaType = "image", sourceStart = 2.0, sourceEnd = 6.0)

        val read = StoryPlacedMedia.foreground(listOf(ios, img))

        assertThat(read[0].trim).isEqualTo(MediaTrimBounds(2.0, 6.0))
        assertThat(read[1].trim).isNull()
    }

    @Test
    fun `le lecteur joue la fenetre ecrite par la publication`() {
        val obj = StoryPlacedMedia("v1", sourceStart = 3.0, sourceEnd = 9.0).toMediaObject("https://x/v1.mp4", "video/mp4", 20.0)

        val window = StorySourceWindow.clippingMs(obj.sourceStart, obj.sourceEnd)

        assertThat(window?.startMs).isEqualTo(3_000L)
        assertThat(window?.endMs).isEqualTo(9_000L)
    }

    @Test
    fun `les vignettes de la bande tombent au milieu de tranches egales de la source`() {
        val times = trimFrameTimesMicros(sourceSeconds = 8.0, count = 4)

        assertThat(times).containsExactly(1_000_000L, 3_000_000L, 5_000_000L, 7_000_000L).inOrder()
        assertThat(trimFrameTimesMicros(0.0)).isEmpty()
    }
}
