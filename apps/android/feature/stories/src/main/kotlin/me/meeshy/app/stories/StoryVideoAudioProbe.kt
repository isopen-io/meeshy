package me.meeshy.app.stories

import android.media.MediaMetadataRetriever
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import me.meeshy.sdk.model.StoryAudioAvailability
import me.meeshy.sdk.model.StoryEffects
import me.meeshy.sdk.model.StoryVideoAudioProbeLaw

/** Sonde les vidéos de premier plan d'une slide : portent-elles une piste audio ? (iOS `StoryVideoAudioProbe`). */
internal object StoryVideoAudioProbe {

    /** 1 ou 0 piste, ou `null` quand la sonde n'a PAS pu aboutir (URL absente, asset injoignable). */
    suspend fun trackCount(url: String?): Int? =
        withContext(Dispatchers.IO) { StoryVideoAudioProbeLaw.trackCount(url, ::hasAudioTrack) }

    private fun hasAudioTrack(url: String): Int? {
        val retriever = MediaMetadataRetriever()
        return try {
            if (url.startsWith("http")) retriever.setDataSource(url, emptyMap()) else retriever.setDataSource(url)
            if (retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_HAS_AUDIO) == "yes") 1 else 0
        } finally {
            runCatching { retriever.release() }
        }
    }
}

/**
 * Le bouton Son du rail existe-t-il pour cette slide ? Une story muette n'en montre aucun ; une vidéo dont la sonde échoue
 * le conserve ; une vidéo pas encore sondée ne le fait pas clignoter. Le crédit du son de fond, quand l'en-tête l'annonce,
 * porte déjà sa coupure : le bouton ne reste que pour le reste.
 */
@Composable
internal fun rememberStorySoundButtonShown(slide: StorySlideView?, effects: StoryEffects?): Boolean {
    var probed by remember(slide?.id) { mutableStateOf<Map<String, Boolean>>(emptyMap()) }
    var failed by remember(slide?.id) { mutableStateOf<Set<String>>(emptySet()) }
    val videos = StoryAudioAvailability.videosNeedingAudioProbe(effects).mapNotNull { video ->
        slide?.foregroundMedia?.firstOrNull { it.id == video.id && it.isVideo }?.let { video.id to it.url }
    } + listOfNotNull(slide?.backgroundVideoUrl?.let { BACKGROUND_VIDEO_KEY to it })
    LaunchedEffect(slide?.id, videos) {
        videos.forEach { (id, url) ->
            if (id in probed) return@forEach
            val count = StoryVideoAudioProbe.trackCount(url)
            if (count == null) {
                failed = failed + id
            } else {
                probed = StoryAudioAvailability.merging(probed, id, count)
                failed = failed - id
            }
        }
    }
    val announced = slide?.backgroundAudio?.showsMuteControl == true
    val declared = StoryVideoAudioProbeLaw.showsSoundButton(effects, probed, failed, announced)
    val legacyTrack = !announced && effects?.audioPlayerObjects.isNullOrEmpty() && effects?.backgroundAudioId == null &&
        (slide?.backgroundAudioUrl != null || slide?.foregroundAudioUrl != null)
    val backgroundVideoSounds = BACKGROUND_VIDEO_KEY in failed || probed[BACKGROUND_VIDEO_KEY] == true
    return declared || legacyTrack || backgroundVideoSounds
}

/** La vidéo de fond n'est pas une pièce du premier plan : une clé à part la porte dans la table de sondage. */
private const val BACKGROUND_VIDEO_KEY = "\u0000background-video"
