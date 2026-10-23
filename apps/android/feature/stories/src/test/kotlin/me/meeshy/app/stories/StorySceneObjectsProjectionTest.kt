package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryAudioPlayerObject
import me.meeshy.sdk.model.StoryEffects
import me.meeshy.sdk.model.StorySticker
import org.junit.Test

/**
 * Le lecteur dessine les stickers et les puces audio que l'auteur a posés — iOS
 * `StoryStickerLayer` (côté = baseSize × scale sur une scène de 1080) et
 * `AudioForegroundChip` (onde, ou crédit « titre · @auteur » pour un son emprunté).
 */
class StorySceneObjectsProjectionTest {

    private val noMedia: (String) -> String? = { null }

    @Test
    fun `an emoji sticker is placed where the author left it, at its scaled design size`() {
        val effects = StoryEffects(
            stickerObjects = listOf(
                StorySticker(id = "s1", emoji = "🔥", x = 0.8, y = 0.7, scale = 1.5, rotation = 15.0, zIndex = 4, baseSize = 140.0),
            ),
        )

        val sticker = StorySceneObjectsProjection.stickers(effects, noMedia).single()

        assertThat(sticker.emoji).isEqualTo("🔥")
        assertThat(sticker.x).isEqualTo(0.8)
        assertThat(sticker.y).isEqualTo(0.7)
        assertThat(sticker.rotation).isEqualTo(15.0)
        assertThat(sticker.sideFraction).isWithin(1e-9).of(140.0 * 1.5 / 1080.0)
        assertThat(sticker.imageUrl).isNull()
    }

    @Test
    fun `an image sticker paints its integrated media, an empty sticker is dropped`() {
        val effects = StoryEffects(
            stickerObjects = listOf(
                StorySticker(id = "img", postMediaId = "m1"),
                StorySticker(id = "blank"),
            ),
        )

        val stickers = StorySceneObjectsProjection.stickers(effects) { id -> "https://cdn/$id.png".takeIf { id == "m1" } }

        assertThat(stickers.map { it.id }).containsExactly("img")
        assertThat(stickers.single().imageUrl).isEqualTo("https://cdn/m1.png")
    }

    @Test
    fun `stickers follow their timing window and z order`() {
        val effects = StoryEffects(
            stickerObjects = listOf(
                StorySticker(id = "top", emoji = "🎉", zIndex = 9),
                StorySticker(id = "late", emoji = "⭐", zIndex = 1, startTime = 2.0, duration = 1.0),
            ),
        )

        val stickers = StorySceneObjectsProjection.stickers(effects, noMedia)

        assertThat(stickers.map { it.id }).containsExactly("late", "top").inOrder()
        val late = stickers.first()
        assertThat(late.isVisible(1f)).isFalse()
        assertThat(late.isVisible(2.5f)).isTrue()
        assertThat(late.isVisible(3.5f)).isFalse()
    }

    @Test
    fun `a foreground sound shows its chip, a background one does not`() {
        val effects = StoryEffects(
            audioPlayerObjects = listOf(
                StoryAudioPlayerObject(id = "voice", x = 0.4, y = 0.8, waveformSamples = listOf(0.2f, 0.9f)),
                StoryAudioPlayerObject(id = "music", isBackground = true),
            ),
        )

        val chip = StorySceneObjectsProjection.audioChips(effects).single()

        assertThat(chip.id).isEqualTo("voice")
        assertThat(chip.x).isEqualTo(0.4)
        assertThat(chip.y).isEqualTo(0.8)
        assertThat(chip.credit).isNull()
        assertThat(chip.waveform).containsExactly(0.2f, 0.9f).inOrder()
    }

    @Test
    fun `a borrowed sound credits its title and author, or a generic credit when unknown`() {
        val effects = StoryEffects(
            audioPlayerObjects = listOf(
                StoryAudioPlayerObject(id = "a", soundId = "snd1", name = "Sunrise", soundAuthorUsername = "lea"),
                StoryAudioPlayerObject(id = "b", soundId = "snd2"),
            ),
        )

        val chips = StorySceneObjectsProjection.audioChips(effects)

        assertThat(chips.map { it.credit }).containsExactly("Sunrise · @lea", "♫ —").inOrder()
    }

    @Test
    fun `no effects means no scene objects`() {
        assertThat(StorySceneObjectsProjection.stickers(null, noMedia)).isEmpty()
        assertThat(StorySceneObjectsProjection.audioChips(null)).isEmpty()
    }
}
