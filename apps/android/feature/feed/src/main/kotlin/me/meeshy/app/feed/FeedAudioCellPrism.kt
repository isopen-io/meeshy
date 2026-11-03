package me.meeshy.app.feed

import me.meeshy.sdk.model.SocialAudioSurface
import me.meeshy.sdk.model.playback.AudioPlaybackState
import me.meeshy.ui.component.audio.AudioPlayerState

/** Ce que la carte joue et montre d'un audio de post : la piste ET la transcription sortent de la MÊME élection du Prisme. */
internal data class FeedAudioCell(
    val url: String,
    /** La langue de la piste servie ; `null` : l'original. */
    val language: String?,
    val durationSeconds: Double,
    /** La transcription de la piste servie, `null` quand le serveur n'en a pas livré. */
    val transcript: String?,
)

internal object FeedAudioCellPrism {

    /**
     * La piste servie par la descente STRICTE du Prisme ([me.meeshy.sdk.model.SocialAudioTrack]) : la langue d'origine concourt à
     * son rang, jamais de repli sur la première piste traduite. Le texte lu sous le lecteur est celui de CETTE piste — une surface
     * qui annonce une langue rend le texte de cette langue.
     */
    fun serve(item: FeedMediaItem, carrierLanguage: String?, preferredLanguages: List<String>): FeedAudioCell {
        val served = item.servedAudio(SocialAudioSurface.FEED_POST_CARD, carrierLanguage, preferredLanguages)
        val translated = served.language?.let { code ->
            item.translatedAudios.firstOrNull { it.targetLanguage.equals(code, ignoreCase = true) }
        }
        val transcript = (translated?.transcription ?: item.transcription?.text)
            ?.trim()
            ?.takeIf { it.isNotEmpty() }
        val millis = served.durationMs ?: item.durationSeconds?.let { it * 1000 }
        return FeedAudioCell(
            url = served.url,
            language = served.language,
            durationSeconds = (millis ?: 0) / 1000.0,
            transcript = transcript,
        )
    }

    /** L'état du lecteur de CETTE carte : le moteur est unique, seul le vocal chargé y porte sa progression. */
    fun playerState(item: FeedMediaItem, cell: FeedAudioCell, engine: AudioPlaybackState): AudioPlayerState {
        val mine = engine.attachmentId == item.id
        if (!mine) return AudioPlayerState(durationSeconds = cell.durationSeconds)
        return AudioPlayerState(
            isPlaying = engine.isPlaying,
            isLoading = engine.isLoading,
            liveFraction = engine.progress,
            liveElapsedSeconds = engine.currentTimeMs / 1000.0,
            durationSeconds = if (engine.durationMs > 0) engine.durationMs / 1000.0 else cell.durationSeconds,
            speed = engine.speed,
        )
    }
}
