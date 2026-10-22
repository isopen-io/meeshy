package me.meeshy.sdk.model.scene

import me.meeshy.sdk.model.StoryAudioPlayerObject
import me.meeshy.sdk.model.StoryEffects

/** Volumes résolus d'une slide à un instant donné, par identifiant de média. */
data class ResolvedSlideVolumes(
    /** Vidéos (fond et premier plan), ducking appliqué. */
    val videoVolumes: Map<String, Float>,
    /** Clips audio de premier plan : jamais atténués. */
    val foregroundAudioVolumes: Map<String, Float>,
    /** Audio de fond, la piste qu'on cherche à rendre audible ; `null` sans audio de fond. */
    val backgroundAudioVolume: Float?,
)

/**
 * Atténuation de la piste des vidéos sous un audio de fond — miroir de
 * `StoryCanvasUIView+Volume.swift`. Seule la piste des VIDÉOS est atténuée.
 */
object AudioDuckingLaw {

    fun resolvedBackgroundAudio(effects: StoryEffects): StoryAudioPlayerObject? {
        val players = effects.audioPlayerObjects.orEmpty()
        players.firstOrNull { it.isBackground == true }?.let { return it }
        val untouched = players.all { it.isBackground == null }
        val bgId = effects.backgroundAudioId
        if (!untouched || bgId == null) return null
        val start = effects.backgroundAudioStart
        val end = effects.backgroundAudioEnd
        val duration = if (start != null && end != null && end > start) (end - start).toFloat() else null
        return StoryAudioPlayerObject(
            id = LEGACY_BACKGROUND_AUDIO_ID,
            postMediaId = bgId,
            placement = "background",
            volume = effects.backgroundAudioVolume ?: 0.5f,
            isBackground = true,
            backgroundAudioVariants = effects.backgroundAudioVariants,
            duration = duration,
            loop = true,
            sourceStart = start?.toFloat(),
            sourceEnd = end?.toFloat(),
        )
    }

    fun resolvedForegroundAudio(effects: StoryEffects): List<StoryAudioPlayerObject> =
        effects.audioPlayerObjects.orEmpty().filter { it.isBackground != true }

    /**
     * Vrai quand la slide porte un audio de fond ET au moins une vidéo dont la piste audio
     * existe réellement. Une vidéo muette ou non encore sondée ne déclenche rien.
     */
    fun shouldDuckVideoAudio(effects: StoryEffects, videoHasAudioTrack: Map<String, Boolean>): Boolean =
        resolvedBackgroundAudio(effects) != null && videoHasAudioTrack.values.any { it }

    /** Volume de chaque média sonore à [time] (secondes depuis le début de la slide). */
    fun resolve(effects: StoryEffects, time: Float, videoHasAudioTrack: Map<String, Boolean>): ResolvedSlideVolumes {
        val slideDucks = shouldDuckVideoAudio(effects, videoHasAudioTrack)
        val videos = effects.mediaObjects.orEmpty()
            .filter { it.mediaType == VIDEO }
            .associate { media ->
                val resolved = VolumeAutomation.effectiveVolume(
                    media.volume, media.keyframes, time - (media.startTime ?: 0.0).toFloat(),
                )
                media.id to VolumeAutomation.ducked(
                    resolved, VolumeAutomation.isDucking(slideDucks, media.isDuckingDisabled),
                )
            }
        val foreground = resolvedForegroundAudio(effects).associate { it.id to clipVolume(it, time) }
        return ResolvedSlideVolumes(videos, foreground, resolvedBackgroundAudio(effects)?.let { clipVolume(it, time) })
    }

    private fun clipVolume(audio: StoryAudioPlayerObject, time: Float): Float =
        VolumeAutomation.effectiveVolume(audio.volume, audio.keyframes, time - (audio.startTime ?: 0f))

    private const val VIDEO = "video"
    private const val LEGACY_BACKGROUND_AUDIO_ID = "legacy-bg-audio"
}
