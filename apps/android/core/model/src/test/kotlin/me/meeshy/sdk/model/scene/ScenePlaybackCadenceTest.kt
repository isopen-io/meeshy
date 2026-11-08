package me.meeshy.sdk.model.scene

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryEffects
import me.meeshy.sdk.model.StoryMediaObject
import me.meeshy.sdk.model.StorySticker
import me.meeshy.sdk.model.StoryTextObject
import me.meeshy.sdk.model.StoryTransitionEffect
import me.meeshy.sdk.model.media.DeviceMediaTier
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

@RunWith(JUnit4::class)
class ScenePlaybackCadenceTest {

    private fun tier(
        effects: StoryEffects,
        elapsed: Double = 5.0,
        total: Double = 10.0,
        video: Boolean = false,
        audio: Boolean = false,
        relays: Boolean = false,
    ) = ScenePlaybackCadence.tier(effects, elapsed, total, video, audio, relays)

    private val text = StoryTextObject(id = "t", text = "salut")

    @Test
    fun `une scene statique reste au palier bas`() {
        assertThat(tier(StoryEffects(textObjects = listOf(text)))).isEqualTo(ScenePlaybackCadenceTier.LOW)
    }

    @Test
    fun `un fond video un son ou un hote qui lit le playhead montent au palier haut`() {
        val still = StoryEffects()
        assertThat(tier(still, video = true)).isEqualTo(ScenePlaybackCadenceTier.HIGH)
        assertThat(tier(still, audio = true)).isEqualTo(ScenePlaybackCadenceTier.HIGH)
        assertThat(tier(still, relays = true)).isEqualTo(ScenePlaybackCadenceTier.HIGH)
    }

    @Test
    fun `un fondu de texte monte au palier haut`() {
        val faded = StoryEffects(textObjects = listOf(text.copy(fadeIn = 0.5)))
        assertThat(tier(faded)).isEqualTo(ScenePlaybackCadenceTier.HIGH)
    }

    @Test
    fun `une video de premier plan monte au palier haut mais une image fixe non`() {
        val video = StoryEffects(mediaObjects = listOf(StoryMediaObject(id = "m", mediaType = "video")))
        val image = StoryEffects(mediaObjects = listOf(StoryMediaObject(id = "m", mediaType = "image")))
        assertThat(tier(video)).isEqualTo(ScenePlaybackCadenceTier.HIGH)
        assertThat(tier(image)).isEqualTo(ScenePlaybackCadenceTier.LOW)
    }

    @Test
    fun `un sticker anime monte au palier haut`() {
        val animated = StoryEffects(stickerObjects = listOf(StorySticker(id = "s", emoji = "x", animation = "bounce")))
        assertThat(tier(animated)).isEqualTo(ScenePlaybackCadenceTier.HIGH)
    }

    @Test
    fun `la transition d'ouverture tient le palier haut seulement pendant sa fenetre`() {
        val opening = StoryEffects(opening = StoryTransitionEffect.FADE)
        assertThat(tier(opening, elapsed = 0.5)).isEqualTo(ScenePlaybackCadenceTier.HIGH)
        assertThat(tier(opening, elapsed = 3.0)).isEqualTo(ScenePlaybackCadenceTier.LOW)
    }

    @Test
    fun `la transition de fermeture remonte un peu avant sa fenetre`() {
        val closing = StoryEffects(closing = StoryTransitionEffect.ZOOM)
        assertThat(tier(closing, elapsed = 8.0, total = 10.0)).isEqualTo(ScenePlaybackCadenceTier.LOW)
        assertThat(tier(closing, elapsed = 8.6, total = 10.0)).isEqualTo(ScenePlaybackCadenceTier.HIGH)
    }

    @Test
    fun `la plage de cadence suit le palier et le niveau d'appareil`() {
        val low = ScenePlaybackCadenceTier.LOW
        val high = ScenePlaybackCadenceTier.HIGH
        assertThat(ScenePlaybackCadence.frameRateRange(low, DeviceMediaTier.PRO)).isEqualTo(SceneFrameRateRange(10, 30, 30))
        assertThat(ScenePlaybackCadence.frameRateRange(high, DeviceMediaTier.LOW)).isEqualTo(SceneFrameRateRange(30, 60, 30))
        assertThat(ScenePlaybackCadence.frameRateRange(high, DeviceMediaTier.MID)).isEqualTo(SceneFrameRateRange(30, 60, 60))
        assertThat(ScenePlaybackCadence.frameRateRange(high, DeviceMediaTier.PRO)).isEqualTo(SceneFrameRateRange(60, 120, 60))
    }

    @Test
    fun `l'horloge d'edition se met au repos apres 4 s sans geste sauf media en lecture`() {
        assertThat(SceneEditClockThrottle.regime(now = 3.0, lastInteractionAt = 0.0, isMediaActivelyPlaying = false))
            .isEqualTo(EditClockRegime.FULL)
        assertThat(SceneEditClockThrottle.regime(now = 4.0, lastInteractionAt = 0.0, isMediaActivelyPlaying = false))
            .isEqualTo(EditClockRegime.IDLE)
        assertThat(SceneEditClockThrottle.regime(now = 40.0, lastInteractionAt = 0.0, isMediaActivelyPlaying = true))
            .isEqualTo(EditClockRegime.FULL)
        assertThat(SceneEditClockThrottle.regime(now = 0.0, lastInteractionAt = 5.0, isMediaActivelyPlaying = false))
            .isEqualTo(EditClockRegime.FULL)
    }

    @Test
    fun `un canvas precharge non interactif n'arme aucun lien d'edition`() {
        assertThat(SceneEditClockThrottle.shouldArm(isEditing = true, isInteractive = false)).isFalse()
        assertThat(SceneEditClockThrottle.shouldArm(isEditing = true, isInteractive = true)).isTrue()
    }
}
