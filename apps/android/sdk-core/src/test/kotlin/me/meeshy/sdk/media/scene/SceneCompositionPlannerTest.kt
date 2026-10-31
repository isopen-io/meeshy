package me.meeshy.sdk.media.scene

import com.google.common.truth.Truth.assertThat
import java.io.File
import me.meeshy.sdk.model.scene.export.StoryExportClipRange
import me.meeshy.sdk.model.scene.export.StoryExportSlide
import me.meeshy.sdk.model.scene.export.StoryExportSound
import me.meeshy.sdk.model.scene.export.StoryExportSoundRole
import me.meeshy.sdk.model.scene.export.StoryExportTimelinePlan
import me.meeshy.sdk.model.scene.export.StoryExportVideoFormat
import me.meeshy.sdk.model.scene.export.StoryExportVolumePoint
import org.junit.Test

class SceneCompositionPlannerTest {

    private val picture = File("scene.png")
    private val video = File("fond.mp4")
    private val voice = File("vocal.m4a")
    private val track = File("piste.m4a")

    private fun sound(src: String, start: Long, end: Long, loop: Boolean = false, gain: Float = 1f, envelope: List<StoryExportVolumePoint> = emptyList()) =
        StoryExportSound(src, StoryExportSoundRole.FOREGROUND_AUDIO, src, start, end, 0, null, loop, gain, envelope)

    private fun job(plan: StoryExportTimelinePlan, fills: List<SceneExportSlideFill>, sounds: Map<String, SceneExportSoundFile> = emptyMap()) =
        SceneExportJob(plan, StoryExportVideoFormat.of(), fills, overlays = emptyList(), sounds = sounds, output = File("out.mp4"))

    @Test fun `chaque slide occupe la video a sa duree, une image fixe tenue, une video de fond en tours entiers`() {
        val plan = StoryExportTimelinePlan(listOf(StoryExportSlide(0, 0, 4_000), StoryExportSlide(1, 4_000, 7_000)), emptyList(), still = false)
        val composition = SceneCompositionPlanner.of(
            job(plan, listOf(SceneExportSlideFill.Picture(picture), SceneExportSlideFill.Video(video, listOf(StoryExportClipRange(0, 3_000), StoryExportClipRange(0, 3_000), StoryExportClipRange(0, 1_000))))),
        )
        assertThat(composition.video).containsExactly(
            SceneVideoItem(picture, clip = null, imageMillis = 4_000),
            SceneVideoItem(video, StoryExportClipRange(0, 3_000), null),
            SceneVideoItem(video, StoryExportClipRange(0, 3_000), null),
            SceneVideoItem(video, StoryExportClipRange(0, 1_000), null),
        ).inOrder()
        assertThat(composition.durationMillis).isEqualTo(11_000)
    }

    @Test fun `chaque son devient une sequence qui entre a son heure, boucle et porte son gain`() {
        val plan = StoryExportTimelinePlan(
            listOf(StoryExportSlide(0, 0, 8_000)),
            listOf(sound("piste", 0, 8_000, loop = true, gain = 0.5f), sound("vocal", 2_000, 8_000)),
            still = false,
        )
        val composition = SceneCompositionPlanner.of(
            job(plan, listOf(SceneExportSlideFill.Picture(picture)), mapOf("piste" to SceneExportSoundFile(track, 3_000), "vocal" to SceneExportSoundFile(voice, 4_000))),
        )
        assertThat(composition.audio).hasSize(2)
        assertThat(composition.audio[0].map { it.clip }).containsExactly(StoryExportClipRange(0, 3_000), StoryExportClipRange(0, 3_000), StoryExportClipRange(0, 2_000)).inOrder()
        assertThat(composition.audio[0].map { it.gain }.distinct()).containsExactly(0.5f)
        assertThat(composition.audio[1]).containsExactly(SceneAudioItem(voice, StoryExportClipRange(0, 4_000), leadMillis = 2_000, originMillis = 0, gain = 1f, envelope = emptyList()))
    }

    @Test fun `un son sans fichier rapatrie ne part pas`() {
        val plan = StoryExportTimelinePlan(listOf(StoryExportSlide(0, 0, 6_000)), listOf(sound("vocal", 0, 6_000)), still = false)
        assertThat(SceneCompositionPlanner.of(job(plan, listOf(SceneExportSlideFill.Picture(picture)))).audio).isEmpty()
    }
}
