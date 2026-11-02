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
    fun `the opening jingle plays whole, the story makes room for it`() {
        assertThat(plan.introJingleEnvelope()).isEmpty()
        assertThat(plan.storyFadeIn(story)).isEqualTo(StoryExportTimeRange(1_200, 1_000))
        assertThat(StoryExportBrandingPlan.INTRO_JINGLE_MILLIS).isEqualTo(2_200)
    }

    @Test
    fun `with the author card the story fades under the card and is silent when its jingle enters`() {
        val fall = plan.storyFadeOut(story)
        assertThat(fall).isEqualTo(StoryExportTimeRange(plan.outroStartMillis(story), 1_500))
        assertThat(fall.endMillis).isEqualTo(plan.outroStartMillis(story) + plan.outroJingleOffsetMillis)
    }

    @Test
    fun `with the logo card the story is silent before its jingle enters with the logo`() {
        val logo = StoryExportBrandingPlan.make(hasIntro = true, hasAuthorOutro = false)
        val fall = logo.storyFadeOut(story)
        assertThat(fall.endMillis).isEqualTo(logo.outroStartMillis(story))
        assertThat(fall.durationMillis).isEqualTo(StoryExportBrandingPlan.LOGO_OUTRO_DUCK_MILLIS)
    }

    @Test
    fun `on a short story the rise and the fall never overlap`() {
        val short = 1_500L
        val rise = plan.storyFadeIn(short)!!
        val fall = plan.storyFadeOut(short)
        assertThat(fall.startMillis).isAtLeast(rise.endMillis)
        assertThat(fall.endMillis).isAtMost(plan.storyEndMillis(short))
    }

    @Test
    fun `without an intro the story does not rise`() {
        assertThat(StoryExportBrandingPlan.make(hasIntro = false, hasAuthorOutro = true).storyFadeIn(story)).isNull()
    }

    @Test
    fun `a sound under the opening jingle tail rises from silence`() {
        val placed = StoryExportBrandedSounds.of(listOf(sound(end = 2_000)), plan, story, withOutro = false).single()
        assertThat(placed.envelope).containsExactly(
            StoryExportVolumePoint(1_200, 0f), StoryExportVolumePoint(2_200, 0.5f),
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
            StoryExportVolumePoint(1_200, 0f),
            StoryExportVolumePoint(2_200, 0.5f),
            StoryExportVolumePoint(plan.outroStartMillis(story), 0.5f),
            StoryExportVolumePoint(plan.storyEndMillis(story), 0f),
        ).inOrder()
    }

    @Test
    fun `a sound that ended before the end card is not faded out`() {
        val placed = StoryExportBrandedSounds.of(listOf(sound(start = 1_500, end = 3_000)), plan, story, withOutro = true).single()
        assertThat(placed.envelope).isEmpty()
    }

    @Test
    fun `an author curve is delayed and cut where the fade starts`() {
        val curve = listOf(StoryExportVolumePoint(0, 1f), StoryExportVolumePoint(9_000, 0.2f))
        val placed = StoryExportBrandedSounds.of(listOf(sound(envelope = curve)), plan, story, withOutro = true).single()
        val from = plan.outroStartMillis(story)
        assertThat(placed.envelope.first()).isEqualTo(StoryExportVolumePoint(1_200, 0f))
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
