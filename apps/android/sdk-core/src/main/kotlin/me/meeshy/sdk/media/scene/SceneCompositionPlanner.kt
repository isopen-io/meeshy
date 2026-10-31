package me.meeshy.sdk.media.scene

import java.io.File
import me.meeshy.sdk.model.scene.export.StoryExportClipLoop
import me.meeshy.sdk.model.scene.export.StoryExportClipRange
import me.meeshy.sdk.model.scene.export.StoryExportVolumePoint

/** Un élément de la séquence vidéo : une plage d'un fichier vidéo, ou une image tenue [imageMillis]. */
internal data class SceneVideoItem(val file: File, val clip: StoryExportClipRange?, val imageMillis: Long?)

/** Un morceau d'un son, tel que sa séquence audio le lit. */
internal data class SceneAudioItem(
    val file: File,
    val clip: StoryExportClipRange,
    val leadMillis: Long,
    val originMillis: Long,
    val gain: Float,
    val envelope: List<StoryExportVolumePoint>,
)

/** La composition à remettre au moteur : UNE séquence vidéo (les slides bout à bout), une séquence par son. */
internal data class SceneComposition(val video: List<SceneVideoItem>, val audio: List<List<SceneAudioItem>>, val durationMillis: Long)

/**
 * Traduit un [SceneExportJob] en séquences : pure, pour que la forme de ce que Media3 reçoit se teste sans encodeur. Chaque
 * slide remplit la séquence vidéo à sa durée exacte (la vidéo de fond en tours entiers, l'image tenue) ; chaque son du plan
 * dont le fichier est là devient sa propre séquence, morcelée par [StoryExportClipLoop].
 */
internal object SceneCompositionPlanner {

    fun of(job: SceneExportJob): SceneComposition {
        val video = job.plan.slides.zip(job.fills).flatMap { (slide, fill) ->
            when (fill) {
                is SceneExportSlideFill.Picture -> listOf(SceneVideoItem(fill.file, clip = null, imageMillis = slide.durationMillis))
                is SceneExportSlideFill.Video -> fill.laps.map { SceneVideoItem(fill.file, it, imageMillis = null) } +
                    listOfNotNull(fill.hold?.let { SceneVideoItem(it.file, clip = null, imageMillis = it.millis) })
            }
        }
        val audio = job.plan.sounds.mapNotNull { sound ->
            val file = job.sounds[sound.src] ?: return@mapNotNull null
            StoryExportClipLoop.soundSegments(sound, file.durationMillis)
                .map { SceneAudioItem(file.file, StoryExportClipRange(it.clipStartMillis, it.clipEndMillis), it.leadMillis, it.originMillis, sound.gain, sound.envelope) }
                .takeIf { it.isNotEmpty() }
        }
        return SceneComposition(video, audio, job.plan.totalMillis)
    }
}
