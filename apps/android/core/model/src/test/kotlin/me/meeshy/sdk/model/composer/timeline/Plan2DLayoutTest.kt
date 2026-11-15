package me.meeshy.sdk.model.composer.timeline

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.SharedPlace
import me.meeshy.sdk.model.StoryAudioPlayerObject
import me.meeshy.sdk.model.StoryDrawingStroke
import me.meeshy.sdk.model.StoryEffects
import me.meeshy.sdk.model.StoryKeyframe
import me.meeshy.sdk.model.StoryLocationObject
import me.meeshy.sdk.model.StoryMediaObject
import me.meeshy.sdk.model.StorySticker
import me.meeshy.sdk.model.StoryTextObject
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

@RunWith(JUnit4::class)
class Plan2DLayoutTest {

    private fun tracks(effects: StoryEffects, places: List<StoryLocationObject> = emptyList()) =
        Plan2DLayout.tracks(effects, slideDuration = 10.0, places = places)

    @Test
    fun `les pistes sont ordonnees premier plan puis contenu puis fond`() {
        val effects = StoryEffects(
            background = "#000000",
            textObjects = listOf(StoryTextObject(id = "t", text = "hi")),
            mediaObjects = listOf(StoryMediaObject(id = "m"), StoryMediaObject(id = "bg", isBackground = true)),
        )
        assertThat(tracks(effects).map { it.plane })
            .containsExactly(TrackPlane.FG, TrackPlane.CONTENT, TrackPlane.BG).inOrder()
    }

    @Test
    fun `dans un plan z decroissant et a z egal l ordre d insertion`() {
        val effects = StoryEffects(
            textObjects = listOf(
                StoryTextObject(id = "a", zIndex = 1),
                StoryTextObject(id = "b", zIndex = 5),
                StoryTextObject(id = "c", zIndex = 1),
            ),
        )
        assertThat(tracks(effects).map { it.id }).containsExactly("b", "a", "c").inOrder()
    }

    @Test
    fun `sans timing la barre est un fantome qui suit la slide`() {
        val effects = StoryEffects(stickerObjects = listOf(StorySticker(id = "s", emoji = "x")))
        assertThat(tracks(effects).single().bar).isEqualTo(TrackBar.Ghost)
    }

    @Test
    fun `un debut sans duree court jusqu a la fin de la slide`() {
        val effects = StoryEffects(textObjects = listOf(StoryTextObject(id = "t", startTime = 3.0)))
        assertThat(tracks(effects).single().bar).isEqualTo(TrackBar.Timed(3.0, 10.0))
    }

    @Test
    fun `une pastille de lieu a une barre quand elle a une fenetre`() {
        val place = StoryLocationObject(id = "p", place = SharedPlace(1.0, 2.0, name = "Paris"), startTime = 1.0, duration = 2.0)
        val track = tracks(StoryEffects(), listOf(place)).single()
        assertThat(track.bar).isEqualTo(TrackBar.Timed(1.0, 3.0))
        assertThat(track.label).contains("Paris")
    }

    @Test
    fun `les losanges de keyframes sont absolus tries et ecretes a la barre`() {
        val effects = StoryEffects(
            mediaObjects = listOf(
                StoryMediaObject(
                    id = "m", startTime = 2.0, duration = 3.0,
                    keyframes = listOf(StoryKeyframe(id = "late", time = 9f), StoryKeyframe(id = "early", time = 1f)),
                ),
            ),
        )
        val kfs = tracks(effects).single().keyframes
        assertThat(kfs).containsExactly(Plan2DKeyframe("early", 3.0), Plan2DKeyframe("late", 5.0)).inOrder()
    }

    @Test
    fun `un media de fond ou synthetique est verrouille`() {
        val effects = StoryEffects(
            mediaObjects = listOf(
                StoryMediaObject(id = "bg", isBackground = true),
                StoryMediaObject(id = "${Plan2DLayout.SYNTHETIC_CLIP_ID_PREFIX}1"),
                StoryMediaObject(id = "free"),
            ),
        )
        assertThat(tracks(effects).associate { it.id to it.isLocked })
            .containsExactly("bg", true, "${Plan2DLayout.SYNTHETIC_CLIP_ID_PREFIX}1", true, "free", false)
    }

    @Test
    fun `le fond sonore audio descend au plan du fond et le dessin est une couche unique`() {
        val effects = StoryEffects(
            audioPlayerObjects = listOf(StoryAudioPlayerObject(id = "a", isBackground = true)),
            drawingStrokes = listOf(StoryDrawingStroke(id = "d", colorHex = "#fff", width = 4.0)),
        )
        val byId = tracks(effects).associateBy { it.id }
        assertThat(byId.getValue("a").plane).isEqualTo(TrackPlane.BG)
        assertThat(byId.getValue(Plan2DLayout.DRAWING_TRACK_ID).plane).isEqualTo(TrackPlane.FG)
    }

    @Test
    fun `le fond visuel n a de piste que sans media de fond`() {
        assertThat(tracks(StoryEffects(background = "#fff")).map { it.id }).containsExactly(Plan2DLayout.BACKGROUND_TRACK_ID)
        val withMedia = StoryEffects(background = "#fff", mediaObjects = listOf(StoryMediaObject(id = "bg", isBackground = true)))
        assertThat(tracks(withMedia).map { it.id }).containsExactly("bg")
    }

    @Test
    fun `x suit le temps selon le zoom et ne produit pas de NaN`() {
        assertThat(Plan2DLayout.x(5.0, Plan2DZoom.FIT, 200f, 10.0)).isEqualTo(100f)
        assertThat(Plan2DLayout.x(5.0, Plan2DZoom.DETAIL, 200f, 10.0)).isEqualTo(200f)
        assertThat(Plan2DLayout.x(5.0, Plan2DZoom.FIT, 200f, 0.0)).isEqualTo(0f)
        assertThat(Plan2DLayout.x(Double.NaN, Plan2DZoom.FIT, 200f, 10.0)).isEqualTo(0f)
    }

    private fun track(id: String, z: Int, plane: TrackPlane) = Plan2DTrack(id, id, plane, z, TrackBar.Ghost)

    @Test
    fun `le depot rend z et plan du voisin rejoint`() {
        val list = listOf(track("a", 9, TrackPlane.FG), track("b", 5, TrackPlane.CONTENT), track("c", 1, TrackPlane.BG))
        assertThat(Plan2DReorderResolver.resolve(list, "a", 2)).isEqualTo(Plan2DReorderResolver.Outcome(0, TrackPlane.BG))
        assertThat(Plan2DReorderResolver.resolve(list, "c", 0)).isEqualTo(Plan2DReorderResolver.Outcome(10, TrackPlane.FG))
    }

    @Test
    fun `un depot sans effet ou impossible rend null`() {
        val list = listOf(track("a", 9, TrackPlane.FG), track("b", 5, TrackPlane.CONTENT))
        assertThat(Plan2DReorderResolver.resolve(list, "a", 0)).isNull()
        assertThat(Plan2DReorderResolver.resolve(list, "ghost", 1)).isNull()
        assertThat(Plan2DReorderResolver.resolve(listOf(track("a", 1, TrackPlane.FG)), "a", 3)).isNull()
        assertThat(Plan2DReorderResolver.resolve(list, "a", 99)).isNotNull()
    }
}
