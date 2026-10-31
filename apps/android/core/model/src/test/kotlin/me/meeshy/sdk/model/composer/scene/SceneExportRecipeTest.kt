package me.meeshy.sdk.model.composer.scene

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

@RunWith(JUnit4::class)
class SceneExportRecipeTest {

    private fun sound(id: String = "s", start: Double = 0.0, end: Double? = null, volume: Double = 1.0) =
        SceneExportSoundInput(id = id, startSeconds = start, endSeconds = end, volume = volume)

    @Test
    fun `une scene sans video de fond est un fixe qui dure la duree de la slide`() {
        val recipe = SceneExportRecipe.of(durationSeconds = 6.0, video = null, sounds = emptyList())
        assertThat(recipe.background).isEqualTo(SceneExportBackground.Still)
        assertThat(recipe.plan.durationMillis).isEqualTo(6_000L)
    }

    @Test
    fun `une video plus courte que la slide borne la duree, plus longue elle est coupee`() {
        val shorter = SceneExportRecipe.of(
            durationSeconds = 10.0,
            video = SceneExportVideoInput(startSeconds = 1.0, endSeconds = 4.0, assetDurationSeconds = 20.0, isMuted = false),
            sounds = emptyList(),
        )
        assertThat(shorter.background).isEqualTo(SceneExportBackground.Video(1_000L, 4_000L, keepsOwnAudio = true))
        assertThat(shorter.plan.durationMillis).isEqualTo(3_000L)

        val longer = SceneExportRecipe.of(
            durationSeconds = 2.0,
            video = SceneExportVideoInput(null, null, assetDurationSeconds = 20.0, isMuted = false),
            sounds = emptyList(),
        )
        assertThat(longer.background).isEqualTo(SceneExportBackground.Video(0L, 2_000L, keepsOwnAudio = true))
        assertThat(longer.plan.durationMillis).isEqualTo(2_000L)
    }

    @Test
    fun `une video muette ne porte pas son son`() {
        val recipe = SceneExportRecipe.of(
            5.0,
            SceneExportVideoInput(null, null, assetDurationSeconds = 5.0, isMuted = true),
            emptyList(),
        )
        assertThat((recipe.background as SceneExportBackground.Video).keepsOwnAudio).isFalse()
    }

    @Test
    fun `un son est borne a la scene, sans fenetre vide et son volume dans 0 a 1`() {
        val recipe = SceneExportRecipe.of(
            4.0,
            null,
            listOf(
                sound("a", start = 1.0, end = 99.0, volume = 3.0),
                sound("b", start = 5.0),
                sound("c", start = 2.0, end = 2.0),
                sound("d", volume = Double.NaN),
            ),
        )
        assertThat(recipe.sounds.map { it.id }).containsExactly("a", "d").inOrder()
        assertThat(recipe.sounds[0]).isEqualTo(SceneExportSound("a", 1_000L, 4_000L, 1f))
        assertThat(recipe.sounds[1].volume).isEqualTo(1f)
    }

    @Test
    fun `le nombre de sons est plafonne`() {
        val many = (1..20).map { sound("s$it") }
        assertThat(SceneExportRecipe.of(4.0, null, many).sounds).hasSize(SceneExportRecipe.MAX_SOUNDS)
    }

    @Test
    fun `la recette du composeur se rend par le meme plan que la story, son de la video de fond compris`() {
        val recipe = SceneExportRecipe.of(
            durationSeconds = 10.0,
            video = SceneExportVideoInput(startSeconds = 1.0, endSeconds = 4.0, assetDurationSeconds = 20.0, isMuted = false),
            sounds = listOf(sound(id = "v", start = 1.0, end = 2.5, volume = 0.5)),
        )
        val timeline = recipe.timeline(backgroundSource = "fond", soundSource = { "son-${it.id}" })

        assertThat(timeline.totalMillis).isEqualTo(3_000L)
        assertThat(timeline.sounds.map { it.src to it.role }).containsExactly(
            "fond" to me.meeshy.sdk.model.scene.export.StoryExportSoundRole.BACKGROUND_VIDEO,
            "son-v" to me.meeshy.sdk.model.scene.export.StoryExportSoundRole.FOREGROUND_AUDIO,
        ).inOrder()
        val background = timeline.sounds.first()
        assertThat(background.trimStartMillis to background.trimEndMillis).isEqualTo(1_000L to 4_000L)
        val voice = timeline.sounds.last()
        assertThat(listOf(voice.startMillis, voice.endMillis)).containsExactly(1_000L, 2_500L).inOrder()
        assertThat(voice.gain).isWithin(1e-4f).of(0.5f)
    }

    @Test
    fun `une video de fond muette et un son sans fichier ne partent pas`() {
        val recipe = SceneExportRecipe.of(
            durationSeconds = 6.0,
            video = SceneExportVideoInput(null, null, assetDurationSeconds = 20.0, isMuted = true),
            sounds = listOf(sound(id = "v")),
        )
        assertThat(recipe.timeline(backgroundSource = "fond", soundSource = { null }).sounds).isEmpty()
    }
}
