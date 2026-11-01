package me.meeshy.app.stories

import androidx.compose.animation.core.Animatable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.FeedMedia
import me.meeshy.sdk.model.FeedMediaType
import me.meeshy.sdk.model.StoryEffects
import me.meeshy.sdk.model.StoryItem
import me.meeshy.sdk.model.StoryMediaObject
import me.meeshy.sdk.model.StorySticker
import me.meeshy.sdk.model.StoryTextObject
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * #13636 — le lecteur peint les calques dans l'ordre d'iOS (`StoryRenderer.render`) : UN tri par `zIndex` sur tous les
 * objets, et à égalité l'ordre de collecte, textes puis médias puis stickers. Il peignait médias, textes, stickers et
 * ignorait le `zIndex` : un texte posé au-dessus d'un média par son auteur passait dessous.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class StorySceneLayerOrderTest {

    @get:Rule
    val compose = createComposeRule()

    private fun text(id: String, z: Int = 0) = StoryTextObjectView(
        id = id, text = id, x = 0.5, y = 0.5, scale = 1.0, rotation = 0.0, fontSize = 64.0, colorHex = null, align = null, zIndex = z,
    )

    private fun media(id: String, z: Int = 0) = StoryForegroundMediaView(
        id = id, url = "https://cdn/$id.jpg", isVideo = false, x = 0.5, y = 0.5, scale = 1.0, aspectRatio = 1.0, zIndex = z,
    )

    private fun sticker(id: String, z: Int = 0) = StoryStickerView(
        id = id, emoji = "🔥", imageUrl = null, x = 0.5, y = 0.5, rotation = 0.0, sideFraction = 0.2, zIndex = z,
    )

    private fun slide(
        texts: List<StoryTextObjectView> = emptyList(),
        medias: List<StoryForegroundMediaView> = emptyList(),
        stickers: List<StoryStickerView> = emptyList(),
    ) = StorySlideView(
        id = "s", text = "", isTranslated = false, imageUrl = null, accentHex = "1A1A2E",
        textObjects = texts, foregroundMedia = medias, stickers = stickers,
    )

    private fun ids(slide: StorySlideView) = StorySceneLayerOrder.order(slide).map { it.id }

    @Test
    fun `objects sharing a zIndex are painted texts, then medias, then stickers like iOS`() {
        val order = ids(slide(texts = listOf(text("t")), medias = listOf(media("m")), stickers = listOf(sticker("s"))))

        assertThat(order).containsExactly("t", "m", "s").inOrder()
    }

    @Test
    fun `a text the author raised above a media paints over it`() {
        val order = ids(slide(texts = listOf(text("t", z = 3)), medias = listOf(media("m", z = 1))))

        assertThat(order).containsExactly("m", "t").inOrder()
    }

    @Test
    fun `a media the author raised above a sticker paints over it`() {
        val order = ids(slide(medias = listOf(media("m", z = 5)), stickers = listOf(sticker("s", z = 2))))

        assertThat(order).containsExactly("s", "m").inOrder()
    }

    @Test
    fun `one zIndex ordering runs across the three families and ties keep their collection order`() {
        val order = ids(
            slide(
                texts = listOf(text("t1", z = 2), text("t2", z = 0)),
                medias = listOf(media("m1", z = 2), media("m2", z = 1)),
                stickers = listOf(sticker("s1", z = 1), sticker("s2", z = 2)),
            ),
        )

        assertThat(order).containsExactly("t2", "m2", "s1", "t1", "m1", "s2").inOrder()
    }

    @Test
    fun `a sound chip paints at its rank among the objects, and one without a rank stays above everything`() {
        val chip = StoryAudioChipView(id = "a", x = 0.5, y = 0.5, credit = null, waveform = emptyList())

        val ranked = slide(texts = listOf(text("t", z = 3))).copy(audioChips = listOf(chip.copy(zIndex = 1)))
        val unranked = slide(texts = listOf(text("t", z = 3))).copy(audioChips = listOf(chip))

        assertThat(ids(ranked)).containsExactly("a", "t").inOrder()
        assertThat(ids(unranked)).containsExactly("t", "a").inOrder()
    }

    @Test
    fun `the projection carries the zIndex the author gave each object`() {
        val item = StoryItem(
            id = "s",
            media = listOf(FeedMedia(id = "p", type = FeedMediaType.IMAGE, url = "https://cdn/p.jpg")),
            storyEffects = StoryEffects(
                textObjects = listOf(StoryTextObject(id = "t", text = "Bonjour", zIndex = 7)),
                mediaObjects = listOf(StoryMediaObject(id = "m", postMediaId = "p", zIndex = 4)),
                stickerObjects = listOf(StorySticker(id = "s", emoji = "🔥", zIndex = 2)),
            ),
        )

        val projected = StorySlideProjector(null).project(item, "6366F1", NoContentPreferences)

        assertThat(projected.textObjects.single().zIndex).isEqualTo(7)
        assertThat(projected.foregroundMedia.single().zIndex).isEqualTo(4)
        assertThat(projected.stickers.single().zIndex).isEqualTo(2)
        assertThat(ids(projected)).containsExactly("s", "m", "t").inOrder()
    }

    @Test
    fun `the overlays compose their layers in that order`() {
        val scene = slide(texts = listOf(text("TEXTE", z = 3)), stickers = listOf(sticker("s", z = 0)).map { it.copy(emoji = "STICKER") })
        compose.setContent {
            MeeshyTheme {
                Box(Modifier.fillMaxSize()) {
                    StorySceneOverlays(
                        slide = scene,
                        progress = Animatable(0f),
                        slideDurationMs = 6_000,
                        playing = false,
                        muted = true,
                    )
                }
            }
        }

        val painted = compose.onAllNodes(hasText("TEXTE") or hasText("STICKER")).fetchSemanticsNodes()
            .map { node -> node.config.getOrNull(SemanticsProperties.Text)?.joinToString { it.text } }

        assertThat(painted).containsExactly("STICKER", "TEXTE").inOrder()
    }
}
