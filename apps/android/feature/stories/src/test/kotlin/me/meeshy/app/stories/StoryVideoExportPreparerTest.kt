package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import java.io.File
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.media.scene.SceneExportOverlay
import me.meeshy.sdk.media.scene.SceneExportSlideFill
import me.meeshy.sdk.model.FeedMedia
import me.meeshy.sdk.model.FeedMediaType
import me.meeshy.sdk.model.StoryAudioPlayerObject
import me.meeshy.sdk.model.StoryEffects
import me.meeshy.sdk.model.StoryItem
import me.meeshy.sdk.model.StoryMediaObject
import me.meeshy.sdk.model.StorySourceWindowMs
import me.meeshy.sdk.model.StoryTextObject
import me.meeshy.sdk.model.scene.export.ImagerLengthChoice
import me.meeshy.sdk.model.scene.export.ImagerQuarter
import me.meeshy.sdk.model.scene.export.StoryExportClipRange
import me.meeshy.sdk.model.scene.export.StoryExportMode
import me.meeshy.sdk.model.scene.export.StoryExportSoundRole
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class StoryVideoExportPreparerTest {

    @get:Rule val folder = TemporaryFolder()

    private val base = "https://gate.meeshy.me"

    private fun story(
        audio: List<StoryAudioPlayerObject> = listOf(StoryAudioPlayerObject(id = "voc", postMediaId = "m-voc", startTime = 2f)),
        withVideo: Boolean = true,
        texts: List<StoryTextObject> = listOf(StoryTextObject(id = "t", text = "Salut", startTime = 1.0, duration = 3.0)),
    ) = StoryItem(
        id = "story-1",
        media = listOfNotNull(
            FeedMedia(id = "m-bg", type = FeedMediaType.VIDEO, url = "/api/v1/attachments/file/bg.mp4").takeIf { withVideo },
            FeedMedia(id = "m-voc", type = FeedMediaType.AUDIO, url = "/api/v1/attachments/file/voc.m4a"),
        ),
        storyEffects = StoryEffects(
            textObjects = texts,
            mediaObjects = listOfNotNull(
                StoryMediaObject(id = "bg", postMediaId = "m-bg", mediaType = "video", isBackground = true, sourceStart = 1.0, sourceEnd = 4.0).takeIf { withVideo },
            ),
            audioPlayerObjects = audio,
        ),
    )

    private fun slide(withVideo: Boolean = true) = StorySlideView(
        id = "story-1",
        text = "",
        isTranslated = false,
        imageUrl = null,
        accentHex = "112233",
        backgroundVideoUrl = "$base/api/v1/attachments/file/bg.mp4".takeIf { withVideo },
        backgroundVideoWindow = StorySourceWindowMs(1_000, 4_000).takeIf { withVideo },
    )

    private class Recorder {
        val fetched = mutableListOf<String>()
        var asked: List<ImagerLengthChoice>? = null
        var painted: StoryExportPaintRequest? = null
        val paints = mutableListOf<StoryExportPaintRequest>()
    }

    private fun preparer(
        recorder: Recorder,
        durations: Map<String, Long> = mapOf("bg.mp4" to 10_000L, "voc.m4a" to 20_000L),
        failing: Set<String> = emptySet(),
        answer: ImagerQuarter? = ImagerQuarter.TWO,
        paints: Boolean = true,
    ) = StoryVideoExportPreparer(
        fetch = { url, target ->
            recorder.fetched += url
            if (failing.any { url.endsWith(it) }) throw java.io.IOException("refus")
            target.writeText(url.substringAfterLast('/'))
        },
        probeMillis = { file -> durations[file.readText()] },
        blankPicture = { it.writeText("noir") },
        chooseLength = { choices -> recorder.asked = choices; answer },
        paint = { request ->
            recorder.painted = request
            recorder.paints += request
            if (!paints) null else request.frames.mapIndexed { i, _ -> File(request.directory, "calque-$i.png").also { it.writeText("png") } }
        },
    )

    private fun subject(withVideo: Boolean = true, audio: List<StoryAudioPlayerObject>? = null) =
        StoryExportSubject.of(audio?.let { story(audio = it, withVideo = withVideo) } ?: story(withVideo = withVideo), slide(withVideo), base)

    @Test fun `la story se rend a la fin naturelle du vocal, video de fond en tours entiers, calques a leurs instants`() = runTest {
        val recorder = Recorder()
        val job = preparer(recorder).prepare(StoryExportMode.SAVE, subject(), slide(), folder.newFile("out.mp4"), folder.newFolder("work"))

        assertThat(job.plan.totalMillis).isEqualTo(22_000)
        assertThat(recorder.fetched).containsExactly("$base/api/v1/attachments/file/bg.mp4", "$base/api/v1/attachments/file/voc.m4a")
        val fill = job.fills.single() as SceneExportSlideFill.Video
        assertThat(fill.laps.first()).isEqualTo(StoryExportClipRange(1_000, 4_000))
        assertThat(fill.laps.sumOf { it.durationMillis }).isEqualTo(22_000)
        assertThat(recorder.painted!!.withBackground).isFalse()
        assertThat(job.overlays.map { it.startMillis }).containsExactly(0L, 1_000L, 2_000L, 4_000L).inOrder()
        assertThat(job.overlays.last().endMillis).isEqualTo(22_000)
        assertThat(job.overlays.all { it is SceneExportOverlay.Stored }).isTrue()
        assertThat(job.plan.sounds.map { it.role }).containsExactly(StoryExportSoundRole.BACKGROUND_VIDEO, StoryExportSoundRole.FOREGROUND_AUDIO).inOrder()
        assertThat(job.sounds.values.map { it.durationMillis }).containsExactly(10_000L, 20_000L)
        assertThat(recorder.asked).isNull()
    }

    @Test fun `un fond fixe se peint dans le calque sur une image noire`() = runTest {
        val recorder = Recorder()
        val job = preparer(recorder).prepare(StoryExportMode.SHARE, subject(withVideo = false), slide(withVideo = false), folder.newFile("out.mp4"), folder.newFolder("work"))
        assertThat(job.fills.single()).isInstanceOf(SceneExportSlideFill.Picture::class.java)
        assertThat(recorder.painted!!.withBackground).isTrue()
    }

    @Test fun `imager une story de quatre minutes en deux quarts rend deux minutes, enregistrer rend tout sans demander`() = runTest {
        val long = listOf(StoryAudioPlayerObject(id = "bga", postMediaId = "m-voc", isBackground = true, duration = 240f))
        val asked = Recorder()
        val imaged = preparer(asked).prepare(StoryExportMode.IMAGER, subject(withVideo = false, audio = long), slide(false), folder.newFile("a.mp4"), folder.newFolder("w1"))
        assertThat(asked.asked!!.map { it.durationMillis }).containsExactly(60_000L, 120_000L, 180_000L, 240_000L).inOrder()
        assertThat(imaged.plan.totalMillis).isEqualTo(120_000)
        assertThat(imaged.plan.sounds.single().endMillis).isEqualTo(120_000)

        val saved = Recorder()
        val whole = preparer(saved).prepare(StoryExportMode.SAVE, subject(withVideo = false, audio = long), slide(false), folder.newFile("b.mp4"), folder.newFolder("w2"))
        assertThat(saved.asked).isNull()
        assertThat(whole.plan.totalMillis).isEqualTo(240_000)
    }

    @Test(expected = CancellationException::class)
    fun `renoncer au choix de longueur arrete l export`() = runTest {
        val long = listOf(StoryAudioPlayerObject(id = "bga", postMediaId = "m-voc", isBackground = true, duration = 240f))
        preparer(Recorder(), answer = null).prepare(StoryExportMode.IMAGER, subject(withVideo = false, audio = long), slide(false), folder.newFile("a.mp4"), folder.newFolder("w"))
    }

    @Test fun `un son qui ne se rapatrie pas tombe, l export continue`() = runTest {
        val job = preparer(Recorder(), failing = setOf("voc.m4a")).prepare(StoryExportMode.SAVE, subject(), slide(), folder.newFile("o.mp4"), folder.newFolder("w"))
        assertThat(job.plan.sounds.map { it.role }).containsExactly(StoryExportSoundRole.BACKGROUND_VIDEO)
    }

    @Test(expected = java.io.IOException::class)
    fun `une video de fond qui ne se rapatrie pas fait echouer l export`() = runTest {
        preparer(Recorder(), failing = setOf("bg.mp4")).prepare(StoryExportMode.SAVE, subject(), slide(), folder.newFile("o.mp4"), folder.newFolder("w"))
    }

    @Test(expected = IllegalStateException::class)
    fun `des calques qui ne se peignent pas font echouer l export`() = runTest {
        preparer(Recorder(), paints = false).prepare(StoryExportMode.SAVE, subject(), slide(), folder.newFile("o.mp4"), folder.newFolder("w"))
    }

    @Test fun `les adresses des sons se resolvent comme le lecteur les joue`() {
        val subject = subject()
        assertThat(subject.source.soundSources).containsExactly(
            "bg", "$base/api/v1/attachments/file/bg.mp4",
            "voc", "$base/api/v1/attachments/file/voc.m4a",
        )
        assertThat(subject.backgroundVideo).isEqualTo("$base/api/v1/attachments/file/bg.mp4")
        assertThat(subject.downloads).containsExactly("$base/api/v1/attachments/file/bg.mp4", "$base/api/v1/attachments/file/voc.m4a").inOrder()
    }

    @Test fun `une story heritee sans objet sonore exporte la piste que le lecteur joue`() {
        val legacy = StoryExportSubject.of(StoryItem(id = "x"), slide(withVideo = false).copy(backgroundAudioUrl = "$base/voix.m4a"), base)
        assertThat(legacy.source.legacyBackgroundTrack).isEqualTo("$base/voix.m4a")
        assertThat(legacy.downloads).containsExactly("$base/voix.m4a")
    }

    private fun scene(id: String, seconds: Float, text: String) = StoryExportScene.of(
        item = StoryItem(
            id = id,
            media = listOf(FeedMedia(id = "m-$id", type = FeedMediaType.AUDIO, url = "/api/v1/attachments/file/$id.m4a")),
            storyEffects = StoryEffects(
                textObjects = listOf(StoryTextObject(id = "t-$id", text = text, startTime = 1.0, duration = 2.0)),
                audioPlayerObjects = listOf(StoryAudioPlayerObject(id = "a-$id", postMediaId = "m-$id", isBackground = true, duration = seconds)),
            ),
        ),
        slide = slide(withVideo = false).copy(id = id, text = text),
        apiBaseUrl = base,
    )

    @Test fun `un post a deux scenes se rend entier, scene apres scene, chacune peinte a part et a sa place`() = runTest {
        val recorder = Recorder()
        val scenes = listOf(scene("s1", 30f, "Un"), scene("s2", 45f, "Deux"))
        val job = preparer(recorder, durations = mapOf("s1.m4a" to 30_000L, "s2.m4a" to 45_000L))
            .prepare(StoryExportMode.SAVE, scenes, folder.newFile("post.mp4"), folder.newFolder("wp"))

        assertThat(job.plan.totalMillis).isEqualTo(75_000)
        assertThat(job.plan.slides.map { it.startMillis }).containsExactly(0L, 30_000L).inOrder()
        assertThat(job.fills).hasSize(2)
        assertThat(recorder.paints.map { it.slide.text }).containsExactly("Un", "Deux").inOrder()
        assertThat(recorder.paints.map { it.directory }.distinct()).hasSize(2)
        assertThat(recorder.paints.map { it.durationMillis }).containsExactly(30_000L, 45_000L).inOrder()
        assertThat(job.overlays.map { it.startMillis }).containsAtLeast(0L, 1_000L, 30_000L, 31_000L).inOrder()
        assertThat(job.overlays.last().endMillis).isEqualTo(75_000)
        assertThat(job.plan.sounds.map { it.startMillis }).containsExactly(0L, 30_000L).inOrder()
        assertThat(recorder.asked).isNull()
    }

    @Test fun `imager un post de deux minutes en deux quarts ne rend que sa premiere scene`() = runTest {
        val recorder = Recorder()
        val scenes = listOf(scene("s1", 60f, "Un"), scene("s2", 60f, "Deux"))
        val job = preparer(recorder, durations = mapOf("s1.m4a" to 60_000L, "s2.m4a" to 60_000L))
            .prepare(StoryExportMode.IMAGER, scenes, folder.newFile("post.mp4"), folder.newFolder("wi"))

        assertThat(recorder.asked!!.map { it.durationMillis }).containsExactly(30_000L, 60_000L, 90_000L, 120_000L).inOrder()
        assertThat(job.plan.totalMillis).isEqualTo(60_000)
        assertThat(job.fills).hasSize(1)
        assertThat(recorder.paints.map { it.slide.text }).containsExactly("Un")
    }
}
