package me.meeshy.sdk.model.composer.timeline.engine

import me.meeshy.sdk.model.StoryMediaKind
import me.meeshy.sdk.model.StoryMediaObject

/** Une source média consommable par le moteur (miroir de `TimelineMediaSource`) : valeur pure, jamais liée à l'UI. */
data class TimelineMediaSource(val id: String, val kind: Kind, val url: String?) {

    enum class Kind { VIDEO, AUDIO, IMAGE }

    companion object {
        /** `null` quand le média n'est ni image ni vidéo. */
        fun fromMediaObject(media: StoryMediaObject, videoUrls: Map<String, String>): TimelineMediaSource? = when (media.kind) {
            StoryMediaKind.IMAGE -> TimelineMediaSource(media.id, Kind.IMAGE, null)
            StoryMediaKind.VIDEO -> TimelineMediaSource(media.id, Kind.VIDEO, videoUrls[media.id])
            null -> null
        }

        fun audio(id: String, url: String?): TimelineMediaSource = TimelineMediaSource(id, Kind.AUDIO, url)
    }
}

/**
 * Charge un asset avec UNE reprise (iOS `loadAssetWithRetry`, 500 ms entre les deux essais) : un échec transitoire ne
 * coûte pas le clip. Une annulation n'est jamais reprise.
 */
suspend fun <T> loadAssetWithRetry(
    source: TimelineMediaSource,
    pause: suspend (millis: Long) -> Unit,
    load: suspend (TimelineMediaSource) -> T,
): T {
    require(source.kind != TimelineMediaSource.Kind.IMAGE) { "une image n'a pas d'asset audiovisuel" }
    if (source.url == null) throw TimelineEngineError.AssetLoadFailed(source.id, "URL manquante")
    return try {
        load(source)
    } catch (cancelled: kotlinx.coroutines.CancellationException) {
        throw cancelled
    } catch (first: Exception) {
        pause(RETRY_DELAY_MS)
        load(source)
    }
}

private const val RETRY_DELAY_MS = 500L
