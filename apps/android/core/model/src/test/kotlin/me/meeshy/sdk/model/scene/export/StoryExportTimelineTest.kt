package me.meeshy.sdk.model.scene.export

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryAudioPlayerObject
import me.meeshy.sdk.model.StoryEffects
import me.meeshy.sdk.model.StoryKeyframe
import me.meeshy.sdk.model.StoryMediaObject
import me.meeshy.sdk.model.StorySticker
import me.meeshy.sdk.model.StoryTextObject
import org.junit.Test

class StoryExportTimelineTest {

    private fun backgroundVideo(volume: Float = 1f) =
        StoryMediaObject(id = "bgv", postMediaId = "pv", mediaType = "video", isBackground = true, volume = volume)

    private fun foregroundImage() = StoryMediaObject(id = "img", postMediaId = "pi", mediaType = "image")

    private fun backgroundTrack(duration: Float? = null) =
        StoryAudioPlayerObject(id = "bga", postMediaId = "pa", isBackground = true, volume = 0.8f, duration = duration)

    private fun vocal(start: Float = 2f, volume: Float = 1f, keyframes: List<StoryKeyframe>? = null, fadeIn: Float? = null) =
        StoryAudioPlayerObject(id = "voc", postMediaId = "pf", isBackground = false, startTime = start, volume = volume, keyframes = keyframes, fadeIn = fadeIn)

    private val urls = mapOf("bgv" to "v.mp4", "bga" to "a.m4a", "voc" to "voc.m4a")

    private fun fullStory() = StoryExportSlideSource(
        effects = StoryEffects(
            textObjects = listOf(StoryTextObject(id = "t", text = "Bonjour")),
            stickerObjects = listOf(StorySticker(id = "s", emoji = "🎉")),
            mediaObjects = listOf(backgroundVideo(), foregroundImage()),
            audioPlayerObjects = listOf(backgroundTrack(), vocal()),
        ),
        soundSources = urls,
    )

    @Test fun `la story complete dure la fin naturelle de son vocal et mixe fond, video de fond et vocal`() {
        val plan = StoryExportTimeline.plan(listOf(fullStory()), mapOf("voc.m4a" to 20.0, "v.mp4" to 8.0, "a.m4a" to 30.0))

        assertThat(plan.totalMillis).isEqualTo(22_000)
        assertThat(plan.slides).containsExactly(StoryExportSlide(index = 0, startMillis = 0, durationMillis = 22_000))
        assertThat(plan.sounds.map { it.role }).containsExactly(
            StoryExportSoundRole.BACKGROUND_TRACK, StoryExportSoundRole.BACKGROUND_VIDEO, StoryExportSoundRole.FOREGROUND_AUDIO,
        ).inOrder()
        val vocal = plan.sounds.single { it.role == StoryExportSoundRole.FOREGROUND_AUDIO }
        assertThat(vocal.startMillis).isEqualTo(2_000)
        assertThat(vocal.endMillis).isEqualTo(22_000)
        assertThat(vocal.loop).isFalse()
        val track = plan.sounds.single { it.role == StoryExportSoundRole.BACKGROUND_TRACK }
        assertThat(track.loop).isTrue()
        assertThat(track.gain).isWithin(1e-4f).of(0.8f)
        assertThat(track.endMillis).isEqualTo(22_000)
    }

    @Test fun `la piste d une video passe sous le son de fond, comme le lecteur l attenue`() {
        val plan = StoryExportTimeline.plan(listOf(fullStory()), mapOf("voc.m4a" to 20.0))
        val video = plan.sounds.single { it.role == StoryExportSoundRole.BACKGROUND_VIDEO }
        assertThat(video.gain).isWithin(1e-4f).of(0.25f)
    }

    @Test fun `une duree epinglee fait autorite et coupe le vocal`() {
        val pinned = fullStory().let { it.copy(effects = it.effects?.copy(timelineDuration = 5.0)) }
        val plan = StoryExportTimeline.plan(listOf(pinned), mapOf("voc.m4a" to 20.0))
        assertThat(plan.totalMillis).isEqualTo(5_000)
        assertThat(plan.sounds.single { it.role == StoryExportSoundRole.FOREGROUND_AUDIO }.endMillis).isEqualTo(5_000)
    }

    @Test fun `deux slides s enchainent et le son de la seconde se place apres la premiere`() {
        val first = StoryExportSlideSource(StoryEffects(timelineDuration = 4.0))
        val second = StoryExportSlideSource(
            StoryEffects(audioPlayerObjects = listOf(vocal(start = 1f))),
            mapOf("voc" to "voc.m4a"),
        )
        val plan = StoryExportTimeline.plan(listOf(first, second), mapOf("voc.m4a" to 3.0))

        assertThat(plan.slides.map { it.startMillis to it.durationMillis }).containsExactly(0L to 4_000L, 4_000L to 6_000L).inOrder()
        assertThat(plan.totalMillis).isEqualTo(10_000)
        val sound = plan.sounds.single()
        assertThat(sound.startMillis).isEqualTo(5_000)
        assertThat(sound.endMillis).isEqualTo(10_000)
    }

    @Test fun `un son coupe par l auteur ne part pas, sauf si sa courbe le releve`() {
        val muted = StoryExportSlideSource(StoryEffects(audioPlayerObjects = listOf(vocal(volume = 0f))), mapOf("voc" to "voc.m4a"))
        assertThat(StoryExportTimeline.plan(listOf(muted)).sounds).isEmpty()

        val raised = StoryExportSlideSource(
            StoryEffects(audioPlayerObjects = listOf(vocal(volume = 0f, keyframes = listOf(StoryKeyframe(time = 1f, volume = 0.6f))))),
            mapOf("voc" to "voc.m4a"),
        )
        assertThat(StoryExportTimeline.plan(listOf(raised)).sounds).hasSize(1)
    }

    @Test fun `une video de fond muette ne porte pas de son`() {
        val slide = StoryExportSlideSource(StoryEffects(mediaObjects = listOf(backgroundVideo(volume = 0f))), mapOf("bgv" to "v.mp4"))
        assertThat(StoryExportTimeline.plan(listOf(slide)).sounds).isEmpty()
    }

    @Test fun `un son sans adresse resolue ne part pas`() {
        val slide = StoryExportSlideSource(StoryEffects(audioPlayerObjects = listOf(vocal())))
        assertThat(StoryExportTimeline.plan(listOf(slide)).sounds).isEmpty()
    }

    @Test fun `la courbe de volume et le fondu d entree suivent le son`() {
        val slide = StoryExportSlideSource(
            StoryEffects(audioPlayerObjects = listOf(vocal(start = 0f, fadeIn = 1f).copy(duration = 4f))),
            mapOf("voc" to "voc.m4a"),
        )
        val sound = StoryExportTimeline.plan(listOf(slide)).sounds.single()

        assertThat(sound.envelope).isNotEmpty()
        assertThat(sound.envelope.first().atMillis).isEqualTo(0)
        assertThat(sound.envelope.first().gain).isWithin(1e-3f).of(0f)
        assertThat(sound.envelope.first { it.atMillis >= 1_000 }.gain).isWithin(1e-3f).of(1f)
    }

    @Test fun `un texte temporise qui finit a neuf secondes allonge la slide statique`() {
        val slide = StoryExportSlideSource(StoryEffects(textObjects = listOf(StoryTextObject(id = "t", text = "x", startTime = 4.0, duration = 5.0))))
        assertThat(StoryExportTimeline.plan(listOf(slide)).totalMillis).isEqualTo(9_000)
    }

    @Test fun `une story de quatre minutes s exporte en quatre minutes`() {
        val slide = StoryExportSlideSource(StoryEffects(audioPlayerObjects = listOf(backgroundTrack(duration = 240f))), mapOf("bga" to "a.m4a"))
        val plan = StoryExportTimeline.plan(listOf(slide))
        assertThat(plan.totalMillis).isEqualTo(240_000)
        assertThat(plan.sounds.single().endMillis).isEqualTo(240_000)
    }

    @Test fun `couper le plan a deux minutes garde le debut et taille les sons`() {
        val slide = StoryExportSlideSource(StoryEffects(audioPlayerObjects = listOf(backgroundTrack(duration = 240f))), mapOf("bga" to "a.m4a"))
        val cut = StoryExportTimeline.plan(listOf(slide)).cut(120_000)
        assertThat(cut.totalMillis).isEqualTo(120_000)
        assertThat(cut.slides.single().durationMillis).isEqualTo(120_000)
        assertThat(cut.sounds.single().endMillis).isEqualTo(120_000)
    }

    @Test fun `couper au dela du total ne change rien et une slide au dela de la coupe disparait`() {
        val first = StoryExportSlideSource(StoryEffects(timelineDuration = 4.0))
        val second = StoryExportSlideSource(StoryEffects(timelineDuration = 4.0))
        val plan = StoryExportTimeline.plan(listOf(first, second))
        assertThat(plan.cut(20_000)).isEqualTo(plan)
        assertThat(plan.cut(3_000).slides).containsExactly(StoryExportSlide(0, 0, 3_000))
    }

    @Test fun `une scene purement statique sans son peut sortir en image, pas une scene animee`() {
        val still = StoryExportSlideSource(StoryEffects(textObjects = listOf(StoryTextObject(id = "t", text = "x"))))
        assertThat(StoryExportTimeline.plan(listOf(still)).still).isTrue()
        val animated = StoryExportSlideSource(StoryEffects(stickerObjects = listOf(StorySticker(id = "s", emoji = "🎉", animation = "bounce"))))
        assertThat(StoryExportTimeline.plan(listOf(animated)).still).isFalse()
        assertThat(StoryExportTimeline.plan(listOf(fullStory())).still).isFalse()
    }

    @Test fun `les objets sonores sont ceux que le plan ecoute, pour resoudre leurs adresses`() {
        val objects = StoryExportTimeline.soundObjects(fullStory().effects!!)
        assertThat(objects.map { it.id to it.role }).containsExactly(
            "bga" to StoryExportSoundRole.BACKGROUND_TRACK,
            "bgv" to StoryExportSoundRole.BACKGROUND_VIDEO,
            "voc" to StoryExportSoundRole.FOREGROUND_AUDIO,
        ).inOrder()
        assertThat(objects.first().postMediaId).isEqualTo("pa")
    }

    @Test fun `une story heritee joue sa piste et sa video de fond que le lecteur resout sans objet`() {
        val legacy = StoryExportSlideSource(StoryEffects(), legacyBackgroundTrack = "voix.m4a", legacyBackgroundVideo = "fond.mp4")
        val plan = StoryExportTimeline.plan(listOf(legacy))
        assertThat(plan.sounds.map { it.role to it.src }).containsExactly(
            StoryExportSoundRole.BACKGROUND_TRACK to "voix.m4a",
            StoryExportSoundRole.BACKGROUND_VIDEO to "fond.mp4",
        ).inOrder()
        assertThat(plan.sounds.all { it.loop && it.gain == 1f }).isTrue()

        val modern = fullStory().copy(legacyBackgroundTrack = "voix.m4a", legacyBackgroundVideo = "fond.mp4")
        assertThat(StoryExportTimeline.plan(listOf(modern)).sounds.map { it.src }).containsNoneOf("voix.m4a", "fond.mp4")
    }
}
