package me.meeshy.sdk.media.scene

import java.io.File
import me.meeshy.sdk.model.scene.export.StoryExportBrandedSounds
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

/** Une carte de marque posée en calque sur toute la composition, à l'opacité que lui donne le plan à chaque instant (ms). */
internal class SceneBrandLayer(val file: File, val alphaAt: (Long) -> Float)

/**
 * La composition à remettre au moteur : UNE séquence vidéo (les slides bout à bout), une séquence par son, et les cartes de
 * marque ([brandLayers], de la plus basse à la plus haute) qui se fondent par-dessus.
 */
internal data class SceneComposition(
    val video: List<SceneVideoItem>,
    val audio: List<List<SceneAudioItem>>,
    val durationMillis: Long,
    val brandLayers: List<SceneBrandLayer> = emptyList(),
)

/**
 * Traduit un [SceneExportJob] en séquences : pure, pour que la forme de ce que Media3 reçoit se teste sans encodeur. Chaque
 * slide remplit la séquence vidéo à sa durée exacte (la vidéo de fond en tours entiers, l'image tenue) ; chaque son du plan
 * dont le fichier est là devient sa propre séquence, morcelée par [StoryExportClipLoop].
 */
internal object SceneCompositionPlanner {

    fun of(job: SceneExportJob): SceneComposition {
        val branding = job.branding
        val storyVideo = job.plan.slides.zip(job.fills).flatMap { (slide, fill) ->
            when (fill) {
                is SceneExportSlideFill.Picture -> listOf(SceneVideoItem(fill.file, clip = null, imageMillis = slide.durationMillis))
                is SceneExportSlideFill.Video -> fill.laps.map { SceneVideoItem(fill.file, it, imageMillis = null) } +
                    listOfNotNull(fill.hold?.let { SceneVideoItem(it.file, clip = null, imageMillis = it.millis) })
            }
        }
        val sounds = if (branding == null) job.plan.sounds else {
            StoryExportBrandedSounds.of(job.plan.sounds, branding.plan, job.plan.totalMillis, withOutro = true)
        }
        val audio = sounds.mapNotNull { sound ->
            val file = job.sounds[sound.src] ?: return@mapNotNull null
            StoryExportClipLoop.soundSegments(sound, file.durationMillis)
                .map { SceneAudioItem(file.file, StoryExportClipRange(it.clipStartMillis, it.clipEndMillis), it.leadMillis, it.originMillis, sound.gain, sound.envelope) }
                .takeIf { it.isNotEmpty() }
        }
        if (branding == null) return SceneComposition(storyVideo, audio, job.plan.totalMillis)
        return branded(job.plan.totalMillis, storyVideo, audio, branding)
    }

    /**
     * La story encadrée : l'intro tient le début de la séquence (la story démarre après sa tenue), la carte de fin tient la
     * queue au-delà de la story ; les deux se fondent en calques, et chaque jingle est sa propre séquence son.
     */
    private fun branded(storyMillis: Long, story: List<SceneVideoItem>, sounds: List<List<SceneAudioItem>>, branding: SceneExportBranding): SceneComposition {
        val plan = branding.plan
        val total = plan.totalMillis(storyMillis)
        val tail = total - plan.storyEndMillis(storyMillis)
        val opening = branding.introCard?.takeIf { plan.hasIntro }
        val video = listOfNotNull(opening?.let { SceneVideoItem(it, clip = null, imageMillis = plan.storyStartMillis) }) +
            story +
            listOfNotNull(SceneVideoItem(branding.outroCard, clip = null, imageMillis = tail).takeIf { tail > 0L })
        val introJingle = branding.introJingle?.takeIf { plan.hasIntro }?.let {
            listOf(SceneAudioItem(it, StoryExportClipRange(0L, branding.introJingleMillis), 0L, 0L, 1f, plan.introJingleEnvelope()))
        }
        val outroJingle = SceneAudioItem(
            branding.outroJingle, StoryExportClipRange(0L, branding.outroJingleMillis),
            leadMillis = plan.outroStartMillis(storyMillis) + plan.outroJingleOffsetMillis, originMillis = 0L, gain = 1f, envelope = emptyList(),
        )
        val layers = listOfNotNull(
            opening?.let { card -> SceneBrandLayer(card) { plan.introAlpha(it) } },
            SceneBrandLayer(branding.outroCard) { plan.outroAlpha(it, storyMillis) },
            branding.authorCard?.takeIf { plan.hasAuthorOutro }?.let { card -> SceneBrandLayer(card) { plan.authorCardAlpha(it, storyMillis) } },
        )
        return SceneComposition(video, sounds + listOfNotNull(introJingle) + listOf(listOf(outroJingle)), total, layers)
    }
}
