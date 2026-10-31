package me.meeshy.sdk.model.scene.export

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.brand.MeeshyBrandJingle
import me.meeshy.sdk.model.brand.PcmWav
import org.junit.Test

/** #13509 : l'intro se fond vers la story, la carte de fin la recouvre, les sons suivent le décalage et la fermeture. */
class StoryExportBrandingEnvelopeTest {

    private val plan = StoryExportBrandingPlan.make(hasIntro = true, hasAuthorOutro = true)
    private val story = 10_000L

    private fun sound(start: Long = 0, end: Long = story, gain: Float = 0.5f, envelope: List<StoryExportVolumePoint> = emptyList()) =
        StoryExportSound("s", StoryExportSoundRole.FOREGROUND_AUDIO, "s", start, end, 0, null, false, gain, envelope)

    @Test
    fun `the intro is opaque during the hold then fades over the crossfade`() {
        assertThat(plan.introAlpha(0)).isEqualTo(1f)
        assertThat(plan.introAlpha(1_199)).isEqualTo(1f)
        assertThat(plan.introAlpha(1_450)).isWithin(1e-4f).of(0.5f)
        assertThat(plan.introAlpha(1_700)).isEqualTo(0f)
        assertThat(StoryExportBrandingPlan.make(hasIntro = false, hasAuthorOutro = false).introAlpha(0)).isEqualTo(0f)
    }

    @Test
    fun `the end card covers the last 1,5 s of the story then holds`() {
        val start = plan.outroStartMillis(story)
        assertThat(start).isEqualTo(1_200 + story - 1_500)
        assertThat(plan.outroAlpha(start - 1, story)).isEqualTo(0f)
        assertThat(plan.outroAlpha(start + 750, story)).isWithin(1e-4f).of(0.5f)
        assertThat(plan.outroAlpha(plan.storyEndMillis(story), story)).isEqualTo(1f)
        assertThat(plan.outroAlpha(plan.totalMillis(story) - 1, story)).isEqualTo(1f)
    }

    @Test
    fun `a story shorter than the intro still ends on a full card`() {
        val tiny = 200L
        assertThat(plan.outroStartMillis(tiny)).isEqualTo(1_700)
        assertThat(plan.outroAlpha(1_700, tiny)).isEqualTo(1f)
    }

    @Test
    fun `the author card enters after the silent logo phase`() {
        val start = plan.outroStartMillis(story)
        assertThat(plan.authorCardAlpha(start + 1_499, story)).isEqualTo(0f)
        assertThat(plan.authorCardAlpha(start + 1_700, story)).isWithin(1e-4f).of(0.5f)
        assertThat(plan.authorCardAlpha(start + 2_000, story)).isEqualTo(1f)
        assertThat(StoryExportBrandingPlan.make(hasIntro = true, hasAuthorOutro = false).authorCardAlpha(start + 2_000, story)).isEqualTo(0f)
    }

    @Test
    fun `the opening jingle holds then dies with the fade`() {
        assertThat(plan.introJingleEnvelope()).containsExactly(
            StoryExportVolumePoint(0, 1f), StoryExportVolumePoint(1_200, 1f), StoryExportVolumePoint(1_700, 0f),
        ).inOrder()
    }

    @Test
    fun `sounds are delayed by the intro hold`() {
        val placed = StoryExportBrandedSounds.of(listOf(sound(start = 2_000, end = 6_000)), plan, story, withOutro = false).single()
        assertThat(placed.startMillis).isEqualTo(3_200)
        assertThat(placed.endMillis).isEqualTo(7_200)
    }

    @Test
    fun `without an intro nothing is delayed`() {
        val none = StoryExportBrandingPlan.make(hasIntro = false, hasAuthorOutro = false)
        assertThat(StoryExportBrandedSounds.of(listOf(sound(start = 500, end = 900)), none, story, withOutro = false).single().startMillis).isEqualTo(500)
    }

    @Test
    fun `a sound still playing under the end card is faded to silence across the overlap`() {
        val placed = StoryExportBrandedSounds.of(listOf(sound()), plan, story, withOutro = true).single()
        assertThat(placed.envelope).containsExactly(
            StoryExportVolumePoint(plan.outroStartMillis(story), 0.5f),
            StoryExportVolumePoint(plan.storyEndMillis(story), 0f),
        ).inOrder()
    }

    @Test
    fun `a sound that ended before the end card is left alone`() {
        val placed = StoryExportBrandedSounds.of(listOf(sound(end = 2_000)), plan, story, withOutro = true).single()
        assertThat(placed.envelope).isEmpty()
    }

    @Test
    fun `an author curve is delayed and cut where the fade starts`() {
        val curve = listOf(StoryExportVolumePoint(0, 1f), StoryExportVolumePoint(9_000, 0.2f))
        val placed = StoryExportBrandedSounds.of(listOf(sound(envelope = curve)), plan, story, withOutro = true).single()
        val from = plan.outroStartMillis(story)
        assertThat(placed.envelope.first()).isEqualTo(StoryExportVolumePoint(1_200, 1f))
        assertThat(placed.envelope.last()).isEqualTo(StoryExportVolumePoint(plan.storyEndMillis(story), 0f))
        assertThat(placed.envelope.map { it.atMillis }).isInStrictOrder()
        assertThat(placed.envelope.any { it.atMillis == from }).isTrue()
    }

    @Test
    fun `the jingles encode to a well formed 16 bit wave`() {
        val wav = PcmWav.encode(MeeshyBrandJingle.outroSamples(8_000), 8_000)
        assertThat(String(wav, 0, 4)).isEqualTo("RIFF")
        assertThat(String(wav, 8, 4)).isEqualTo("WAVE")
        assertThat(wav.size).isEqualTo(44 + 16_000 * 2)
        assertThat(wav[40].toInt() or (wav[41].toInt() shl 8) or (wav[42].toInt() shl 16)).isEqualTo(16_000 * 2)
    }
}
