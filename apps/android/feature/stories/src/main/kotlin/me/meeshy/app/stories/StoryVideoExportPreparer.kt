package me.meeshy.app.stories

import java.io.File
import java.io.IOException
import kotlinx.coroutines.CancellationException
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
import me.meeshy.sdk.model.scene.export.StoryExportOverlayFrames
import me.meeshy.sdk.model.scene.export.StoryExportTimeline
import me.meeshy.sdk.model.scene.export.StoryExportVideoFormat

/**
 * Ce que l'écran doit peindre : la slide à chacun des [frames] (un calque par fenêtre où rien ne change), avec son fond
 * quand aucune vidéo ne le porte. Il rend un PNG par image, dans l'ordre, ou `null` s'il n'a pas pu peindre.
 */
data class StoryExportPaintRequest(
    val slide: StorySlideView,
    val effects: StoryEffects?,
    val durationMillis: Long,
    val frames: List<StoryExportOverlayFrame>,
    val withBackground: Boolean,
    val directory: File,
    val format: StoryExportVideoFormat,
)

/**
 * Prépare l'export vidéo d'une story telle qu'elle se JOUE : chaque son à sa place et à son niveau, la vidéo de fond en
 * tours entiers de la fenêtre taillée, les objets peints à leurs instants. Enregistrer et Partager rendent TOUT ;
 * Imager propose, au-delà d'une minute, la longueur rendue depuis le début.
 */
class StoryVideoExportPreparer(
    private val fetch: suspend (url: String, target: File) -> Unit,
    private val probeMillis: (File) -> Long?,
    private val blankPicture: (File) -> Unit,
    private val chooseLength: suspend (List<ImagerLengthChoice>) -> ImagerQuarter?,
    private val paint: suspend (StoryExportPaintRequest) -> List<File>?,
    private val format: StoryExportVideoFormat = StoryExportVideoFormat.of(),
) {

    suspend fun prepare(mode: StoryExportMode, subject: StoryExportSubject, slide: StorySlideView, output: File, work: File): SceneExportJob {
        work.mkdirs()
        val files = download(subject, work)
        val durations = files.mapValues { (_, file) -> probeMillis(file) }
        val reachable = subject.source.let { source ->
            source.copy(
                soundSources = source.soundSources.filterValues { it in files },
                legacyBackgroundTrack = source.legacyBackgroundTrack?.takeIf { it in files },
                legacyBackgroundVideo = source.legacyBackgroundVideo?.takeIf { it in files },
            )
        }
        val whole = StoryExportTimeline.plan(
            slides = listOf(reachable),
            mediaDurationsSeconds = durations.mapNotNull { (src, millis) -> millis?.let { src to it / MILLIS_PER_SECOND } }.toMap(),
        )
        val plan = whole.cut(length(mode, whole.totalMillis))
        val duration = plan.totalMillis
        val frames = StoryExportOverlayFrames.of(subject.source.effects, duration)
        val backgroundFile = subject.backgroundVideo?.let { files[it] }
        val layers = paint(StoryExportPaintRequest(slide, subject.source.effects, duration, frames, backgroundFile == null, work, format))
            ?.takeIf { it.size == frames.size }
            ?: error("les calques de la story ne se sont pas peints")
        val overlays = frames.zip(layers) { frame, file -> SceneExportOverlay.Stored(frame.startMillis, frame.endMillis, file) }
        val sounds = plan.sounds.map { it.src }.distinct()
            .mapNotNull { src -> files[src]?.let { src to SceneExportSoundFile(it, durations[src]) } }
            .toMap()
        return SceneExportJob(
            plan = plan,
            format = format,
            fills = listOf(fill(subject, backgroundFile, durations, duration, work)),
            overlays = overlays,
            sounds = sounds,
            output = output,
        )
    }

    private suspend fun download(subject: StoryExportSubject, work: File): Map<String, File> =
        subject.downloads.withIndex().mapNotNull { (index, url) ->
            val target = File(work, "source-$index.media")
            try {
                fetch(url, target)
                url to target
            } catch (failure: IOException) {
                if (url == subject.backgroundVideo) throw failure
                target.delete()
                null
            }
        }.toMap()

    private suspend fun length(mode: StoryExportMode, totalMillis: Long): Long {
        val choices = mode.lengthChoices(totalMillis)
        if (choices.isEmpty()) return totalMillis
        val quarter = chooseLength(choices) ?: throw CancellationException("longueur non choisie")
        return ImagerLength.renderedMillis(totalMillis, quarter)
    }

    private fun fill(subject: StoryExportSubject, file: File?, durations: Map<String, Long?>, duration: Long, work: File): SceneExportSlideFill {
        if (file == null) return SceneExportSlideFill.Picture(File(work, "fond.png").also(blankPicture))
        val clip = durations[subject.backgroundVideo] ?: error("la vidéo de fond n'a pas de durée lisible")
        val window = subject.backgroundWindow
        val laps = StoryExportClipLoop.ranges(duration, window?.startMs ?: 0L, window?.endMs, clip, loop = true)
        return SceneExportSlideFill.Video(file, laps)
    }

    private companion object {
        const val MILLIS_PER_SECOND = 1000.0
    }
}
