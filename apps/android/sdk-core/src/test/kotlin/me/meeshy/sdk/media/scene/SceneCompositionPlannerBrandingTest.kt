package me.meeshy.sdk.media.scene

import com.google.common.truth.Truth.assertThat
import java.io.File
import me.meeshy.sdk.model.scene.export.StoryExportBrandingPlan
import me.meeshy.sdk.model.scene.export.StoryExportClipRange
import me.meeshy.sdk.model.scene.export.StoryExportSlide
import me.meeshy.sdk.model.scene.export.StoryExportSound
import me.meeshy.sdk.model.scene.export.StoryExportSoundRole
import me.meeshy.sdk.model.scene.export.StoryExportTimelinePlan
import me.meeshy.sdk.model.scene.export.StoryExportVideoFormat
import org.junit.Test

/** #13509 : l'intro, la carte de fin et les deux jingles entrent dans la composition que Media3 reçoit. */
class SceneCompositionPlannerBrandingTest {

    private val scene = File("scene.png")
    private val intro = File("intro.png")
    private val outro = File("fin.png")
    private val author = File("auteur.png")
    private val voice = File("vocal.m4a")
    private val introJingle = File("jingle-ouverture.wav")
    private val outroJingle = File("jingle-fermeture.wav")

    private fun branding(hasIntro: Boolean = true, hasAuthor: Boolean = true) = SceneExportBranding(
        plan = StoryExportBrandingPlan.make(hasIntro, hasAuthor),
        introCard = intro.takeIf { hasIntro },
        outroCard = outro,
        authorCard = author.takeIf { hasAuthor },
        introJingle = introJingle.takeIf { hasIntro },
        introJingleMillis = 2_200,
        outroJingle = outroJingle,
        outroJingleMillis = 2_000,
    )

    private fun job(branding: SceneExportBranding?, sounds: List<StoryExportSound> = emptyList()): SceneExportJob {
        val plan = StoryExportTimelinePlan(listOf(StoryExportSlide(0, 0, 8_000)), sounds, still = false)
        return SceneExportJob(
            plan, StoryExportVideoFormat.of(), listOf(SceneExportSlideFill.Picture(scene)), overlays = emptyList(),
            sounds = mapOf("v" to SceneExportSoundFile(voice, 4_000)), output = File("out.mp4"), branding = branding,
        )
    }

    private fun voiceSound() = StoryExportSound("v", StoryExportSoundRole.FOREGROUND_AUDIO, "v", 1_000, 5_000, 0, null, false, 0.8f)

    @Test fun `sans marque la composition est celle de la story seule`() {
        val composition = SceneCompositionPlanner.of(job(branding = null))
        assertThat(composition.video).containsExactly(SceneVideoItem(scene, null, 8_000))
        assertThat(composition.brandLayers).isEmpty()
        assertThat(composition.durationMillis).isEqualTo(8_000)
    }

    @Test fun `l intro tient la tete de la sequence et la carte de fin sa queue`() {
        val composition = SceneCompositionPlanner.of(job(branding()))
        val plan = StoryExportBrandingPlan.make(true, true)
        assertThat(composition.video).containsExactly(
            SceneVideoItem(intro, null, 1_200),
            SceneVideoItem(scene, null, 8_000),
            SceneVideoItem(outro, null, plan.totalMillis(8_000) - plan.storyEndMillis(8_000)),
        ).inOrder()
        assertThat(composition.durationMillis).isEqualTo(plan.totalMillis(8_000))
        assertThat(composition.video.sumOf { it.imageMillis ?: 0L }).isEqualTo(composition.durationMillis)
    }

    @Test fun `sans intro la story demarre a zero et seule la fermeture est ajoutee`() {
        val composition = SceneCompositionPlanner.of(job(branding(hasIntro = false, hasAuthor = false)))
        assertThat(composition.video.first()).isEqualTo(SceneVideoItem(scene, null, 8_000))
        assertThat(composition.video.last().file).isEqualTo(outro)
        assertThat(composition.audio.flatten().map { it.file }).containsExactly(outroJingle)
    }

    @Test fun `les calques se fondent selon le plan - intro qui s eteint, fin qui recouvre, carte d auteur qui entre`() {
        val plan = StoryExportBrandingPlan.make(true, true)
        val layers = SceneCompositionPlanner.of(job(branding())).brandLayers
        assertThat(layers.map { it.file }).containsExactly(intro, outro, author).inOrder()
        val (introLayer, outroLayer, authorLayer) = layers
        assertThat(introLayer.alphaAt(0)).isEqualTo(1f)
        assertThat(introLayer.alphaAt(1_700)).isEqualTo(0f)
        val start = plan.outroStartMillis(8_000)
        assertThat(outroLayer.alphaAt(start - 1)).isEqualTo(0f)
        assertThat(outroLayer.alphaAt(plan.totalMillis(8_000) - 1)).isEqualTo(1f)
        assertThat(authorLayer.alphaAt(start + 1_000)).isEqualTo(0f)
        assertThat(authorLayer.alphaAt(start + 2_000)).isEqualTo(1f)
    }

    @Test fun `la carte d auteur n est posee que lorsque la fermeture porte l identite`() {
        val layers = SceneCompositionPlanner.of(job(branding(hasAuthor = false))).brandLayers
        assertThat(layers.map { it.file }).containsExactly(intro, outro).inOrder()
    }

    @Test fun `les jingles entrent a leur heure - ouverture a zero qui s eteint avec le fondu, fermeture apres la phase du logo`() {
        val plan = StoryExportBrandingPlan.make(true, true)
        val audio = SceneCompositionPlanner.of(job(branding())).audio
        val opening = audio.flatten().single { it.file == introJingle }
        assertThat(opening.leadMillis).isEqualTo(0)
        assertThat(opening.clip).isEqualTo(StoryExportClipRange(0, 2_200))
        assertThat(opening.envelope).isEqualTo(plan.introJingleEnvelope())
        val closing = audio.flatten().single { it.file == outroJingle }
        assertThat(closing.leadMillis).isEqualTo(plan.outroStartMillis(8_000) + 1_500)
        assertThat(closing.gain).isEqualTo(1f)
    }

    @Test fun `le jingle de fermeture d une carte sans identite entre avec le logo`() {
        val plan = StoryExportBrandingPlan.make(true, false)
        val closing = SceneCompositionPlanner.of(job(branding(hasAuthor = false))).audio.flatten().single { it.file == outroJingle }
        assertThat(closing.leadMillis).isEqualTo(plan.outroStartMillis(8_000))
    }

    @Test fun `les sons de la story sont decales par l intro et s eteignent sous la carte de fin`() {
        val plan = StoryExportBrandingPlan.make(true, true)
        val story = SceneCompositionPlanner.of(job(branding(), listOf(voiceSound()))).audio.flatten().single { it.file == voice }
        assertThat(story.leadMillis).isEqualTo(2_200)
        assertThat(story.envelope).isEmpty()
        val long = voiceSound().copy(endMillis = 8_000)
        val faded = SceneCompositionPlanner.of(job(branding(), listOf(long))).audio.flatten().first { it.file == voice }
        assertThat(faded.envelope.last().atMillis).isEqualTo(plan.storyEndMillis(8_000))
        assertThat(faded.envelope.last().gain).isEqualTo(0f)
    }
}
