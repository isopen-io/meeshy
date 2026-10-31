package me.meeshy.app.stories

import java.io.File
import java.io.IOException
import kotlinx.coroutines.CancellationException
import me.meeshy.sdk.media.scene.SceneExportHold
import me.meeshy.sdk.media.scene.SceneExportJob
import me.meeshy.sdk.media.scene.SceneExportOverlay
import me.meeshy.sdk.media.scene.SceneExportSlideFill
import me.meeshy.sdk.media.scene.SceneExportSoundFile
import me.meeshy.sdk.model.StoryEffects
import me.meeshy.sdk.model.scene.export.ImagerLengthChoice
import me.meeshy.sdk.model.scene.export.ImagerQuarter
import me.meeshy.sdk.model.scene.export.ImagerLength
import me.meeshy.sdk.model.scene.export.StoryExportClipLoop
import me.meeshy.sdk.model.scene.export.StoryExportMode
import me.meeshy.sdk.model.scene.export.StoryExportOverlayFrame
import me.meeshy.sdk.model.scene.export.StoryExportSlideSource
import me.meeshy.sdk.model.scene.export.StoryExportOverlayFrames
import me.meeshy.sdk.model.scene.export.StoryExportTimeline
import me.meeshy.sdk.model.scene.export.StoryExportVideoFormat

/**
 * Ce que l'écran doit peindre : la slide à chacun des [frames] (un calque par fenêtre où rien ne change), avec son fond
 * quand aucune vidéo ne le porte. Il rend un PNG par image, dans l'ordre, ou `null` s'il n'a pas pu peindre. [still] : la
 * scène fixe et muette, peinte une fois avec son fond, sort telle quelle en image (JPEG).
 */
data class StoryExportPaintRequest(
    val slide: StorySlideView,
    val effects: StoryEffects?,
    val durationMillis: Long,
    val frames: List<StoryExportOverlayFrame>,
    val withBackground: Boolean,
    val directory: File,
    val format: StoryExportVideoFormat,
    val still: Boolean = false,
)

/**
 * Prépare l'export vidéo d'une story, ou des scènes d'un post ou d'un réel, telle qu'elle se JOUE : chaque son à sa place et à son niveau, la vidéo de fond en
 * tours entiers de la fenêtre taillée, les objets peints à leurs instants. Enregistrer et Partager rendent TOUT ;
 * Imager propose, au-delà d'une minute, la longueur rendue depuis le début.
 */
class StoryVideoExportPreparer(
    private val fetch: suspend (url: String, target: File) -> Unit,
    private val probeMillis: (File) -> Long?,
    private val blankPicture: (File) -> Unit,
    private val lastFrame: (video: File, atMillis: Long, target: File) -> Boolean = { _, _, _ -> false },
    private val chooseLength: suspend (List<ImagerLengthChoice>) -> ImagerQuarter?,
    private val paint: suspend (StoryExportPaintRequest) -> List<File>?,
    private val format: StoryExportVideoFormat = StoryExportVideoFormat.of(),
) {

    suspend fun prepare(mode: StoryExportMode, subject: StoryExportSubject, slide: StorySlideView, output: File, work: File): SceneExportJob =
        prepare(mode, listOf(StoryExportScene(subject, slide)), output, work)

    /** Les [scenes] bout à bout (un post à scène en porte plusieurs) : chacune à sa durée, peinte à part, à sa place. */
    suspend fun prepare(mode: StoryExportMode, scenes: List<StoryExportScene>, output: File, work: File): SceneExportJob {
        require(scenes.isNotEmpty()) { "rien à exporter" }
        work.mkdirs()
        val files = download(scenes.map { it.subject }, work)
        val durations = files.mapValues { (_, file) -> probeMillis(file) }
        val whole = StoryExportTimeline.plan(
            slides = scenes.map { reachable(it.subject.source, files) },
            mediaDurationsSeconds = durations.mapNotNull { (src, millis) -> millis?.let { src to it / MILLIS_PER_SECOND } }.toMap(),
        )
        val plan = whole.cut(length(mode, whole.totalMillis))
        val still = plan.still && scenes.all { it.subject.backgroundVideo == null }
        val rendered = plan.slides.map { placed -> placed to scenes[placed.index] }
        val overlays = rendered.flatMap { (placed, scene) ->
            val backgroundFile = scene.subject.backgroundVideo?.let { files[it] }
            paintedOverlays(scene, placed.durationMillis, backgroundFile == null, still, File(work, "scene-${placed.index}").apply { mkdirs() })
                .map { it.shifted(placed.startMillis) }
        }
        val sounds = plan.sounds.map { it.src }.distinct()
            .mapNotNull { src -> files[src]?.let { src to SceneExportSoundFile(it, durations[src]) } }
            .toMap()
        return SceneExportJob(
            plan = plan,
            format = format,
            fills = rendered.map { (placed, scene) ->
                fill(scene.subject, scene.subject.backgroundVideo?.let { files[it] }, durations, placed.durationMillis, work, placed.index)
            },
            overlays = overlays,
            sounds = sounds,
            output = output,
            still = overlays.singleOrNull()?.file?.takeIf { still },
        )
    }

    private fun reachable(source: StoryExportSlideSource, files: Map<String, File>): StoryExportSlideSource = source.copy(
        soundSources = source.soundSources.filterValues { it in files },
        legacyBackgroundTrack = source.legacyBackgroundTrack?.takeIf { it in files },
        legacyBackgroundVideo = source.legacyBackgroundVideo?.takeIf { it in files },
    )

    private suspend fun paintedOverlays(
        scene: StoryExportScene,
        duration: Long,
        withBackground: Boolean,
        still: Boolean,
        directory: File,
    ): List<SceneExportOverlay.Stored> {
        val effects = scene.subject.source.effects
        val frames = StoryExportOverlayFrames.of(effects, duration)
        val layers = paint(StoryExportPaintRequest(scene.slide, effects, duration, frames, withBackground, directory, format, still))
            ?.takeIf { it.size == frames.size }
            ?: error("les calques de la story ne se sont pas peints")
        return frames.zip(layers) { frame, file -> SceneExportOverlay.Stored(frame.startMillis, frame.endMillis, file) }
    }

    private fun SceneExportOverlay.Stored.shifted(by: Long) = SceneExportOverlay.Stored(startMillis + by, endMillis + by, file)

    private suspend fun download(subjects: List<StoryExportSubject>, work: File): Map<String, File> {
        val required = subjects.mapNotNull { it.backgroundVideo }.toSet()
        return subjects.flatMap { it.downloads }.distinct().withIndex().mapNotNull { (index, url) ->
            val target = File(work, "source-$index.media")
            try {
                fetch(url, target)
                url to target
            } catch (failure: IOException) {
                if (url in required) throw failure
                target.delete()
                null
            }
        }.toMap()
    }

    private suspend fun length(mode: StoryExportMode, totalMillis: Long): Long {
        val choices = mode.lengthChoices(totalMillis)
        if (choices.isEmpty()) return totalMillis
        val quarter = chooseLength(choices) ?: throw CancellationException("longueur non choisie")
        return ImagerLength.renderedMillis(totalMillis, quarter)
    }

    private fun fill(subject: StoryExportSubject, file: File?, durations: Map<String, Long?>, duration: Long, work: File, index: Int): SceneExportSlideFill {
        if (file == null) return SceneExportSlideFill.Picture(File(work, "fond-$index.png").also(blankPicture))
        val clip = durations[subject.backgroundVideo] ?: error("la vidéo de fond n'a pas de durée lisible")
        val window = subject.backgroundWindow
        val laps = StoryExportClipLoop.ranges(duration, window?.startMs ?: 0L, window?.endMs, clip, loop = subject.backgroundLoop)
        val rest = duration - laps.sumOf { it.durationMillis }
        if (rest <= 0L) return SceneExportSlideFill.Video(file, laps)
        val held = File(work, "fin-$index.png")
        if (laps.isEmpty() || !lastFrame(file, laps.last().endMillis, held)) blankPicture(held)
        return SceneExportSlideFill.Video(file, laps, SceneExportHold(held, rest))
    }

    private companion object {
        const val MILLIS_PER_SECOND = 1000.0
    }
}
