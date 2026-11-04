package me.meeshy.sdk.model.composer.timeline.engine

import me.meeshy.sdk.model.scene.SceneAudioTrack

/** Ce que le mixeur sait d'un fichier chargé : de quoi fenêtrer. */
data class AudioFileInfo(val sampleRate: Double, val lengthFrames: Long)

/** Le départ planifié d'UNE piste : [atNanos] = `null` signifie « tout de suite », sinon l'instant hôte exact. */
data class AudioTrackStart(
    val trackId: String,
    val atNanos: Long?,
    /** `null` : la source entière. */
    val segment: AudioSegment?,
    val volume: Float,
)

/**
 * Le cerveau pur du mixeur de montage (miroir du `AudioMixer` d'iOS) : chaque clip tombe à sa position EXACTE sur la
 * timeline — jamais à l'heure de démarrage du moteur —, un clip rogné démarre au bon frame, et aucune lecture ne part si
 * l'ouverture est après la fin. Les clips à venir sont comptés à partir de l'ancre commune ([TimelinePlaybackSync]).
 */
object TimelineAudioMixerPlan {

    /** Plafond de pistes simultanées (iOS `maxActiveNodes`). */
    const val MAX_ACTIVE_TRACKS: Int = 6

    fun starts(
        tracks: List<SceneAudioTrack>,
        files: Map<String, AudioFileInfo>,
        playheadSeconds: Double,
        anchorNanos: Long,
        maxActiveTracks: Int = MAX_ACTIVE_TRACKS,
    ): List<AudioTrackStart> {
        val playhead = maxOf(0.0, playheadSeconds)
        return tracks
            .filter { it.id in files }
            .take(maxActiveTracks)
            .mapNotNull { track -> start(track, files.getValue(track.id), playhead, anchorNanos) }
    }

    private fun start(track: SceneAudioTrack, file: AudioFileInfo, playhead: Double, anchorNanos: Long): AudioTrackStart? {
        val clipStart = track.startTime
        if (playhead < clipStart) {
            val at = TimelinePlaybackSync.clipStartNanos(anchorNanos, clipStart, playhead)
            val trimmed = TimelineAudioWindow.segment(track.window, 0.0, file.sampleRate, file.lengthFrames)
            return AudioTrackStart(track.id, at, trimmed, track.volume)
        }
        val offset = playhead - clipStart
        if (offset <= 0.0) {
            val trimmed = TimelineAudioWindow.segment(track.window, 0.0, file.sampleRate, file.lengthFrames)
            return AudioTrackStart(track.id, anchorNanos, trimmed, track.volume)
        }
        val segment = TimelineAudioWindow.segment(track.window, offset, file.sampleRate, file.lengthFrames) ?: return null
        return AudioTrackStart(track.id, null, segment, track.volume)
    }
}
