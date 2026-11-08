package me.meeshy.app.feed

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import me.meeshy.sdk.model.FeedAudioProbeTable
import me.meeshy.sdk.model.FeedReelAutoplay

/**
 * L'intention de son du fil et la mémoire des sondes de piste audio (iOS `ReelFeedSoundIntent`). Le son est COUPÉ par défaut ;
 * le bouton le relève pour la vidéo active et l'intention survit au passage d'une carte à l'autre — sans quoi le son mourrait
 * dès que la carte suivante réaffirme l'ancienne valeur.
 */
class FeedAudioProbe {

    private val soundOnFlow = MutableStateFlow(false)
    private val tableFlow = MutableStateFlow(FeedAudioProbeTable())

    val isSoundOn: StateFlow<Boolean> = soundOnFlow.asStateFlow()

    /** Le muet imposé par le fil au lecteur : le contraire de l'intention. */
    val isForceMuted: Boolean get() = FeedReelAutoplay.isForceMuted(soundOnFlow.value)

    val table: StateFlow<FeedAudioProbeTable> = tableFlow.asStateFlow()

    fun toggleSound() = soundOnFlow.update { !it }

    fun setSoundOn(on: Boolean) {
        soundOnFlow.value = on
    }

    /** `probedTrackCount == null` : sondage impossible, on retentera ; une réponse déjà connue n'est jamais réécrite. */
    fun record(mediaId: String, probedTrackCount: Int?) = tableFlow.update { it.recording(mediaId, probedTrackCount) }

    fun hasAudioTrack(mediaId: String): Boolean = tableFlow.value.hasAudioTrack(mediaId)

    fun isProbed(mediaId: String): Boolean = tableFlow.value.isProbed(mediaId)
}
