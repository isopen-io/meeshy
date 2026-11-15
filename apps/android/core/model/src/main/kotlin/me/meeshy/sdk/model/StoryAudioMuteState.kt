package me.meeshy.sdk.model

/**
 * Le mute LOCAL du lecteur de stories (iOS `isGlobalMuted` + `StoryReaderAudioMuteRegistry`) : un interrupteur global
 * qui vaut pour les pistes ET les vidéos, et un ensemble de pistes coupées une à une par un tap sur leur pastille.
 * Rien ne part au serveur ; l'état est neuf à chaque ouverture ([cleared] à chaque changement de slide).
 */
data class StoryAudioMuteState(
    val isGlobalMuted: Boolean = false,
    val mutedTrackIds: Set<String> = emptySet(),
) {
    fun toggleGlobal(): StoryAudioMuteState = copy(isGlobalMuted = !isGlobalMuted)

    fun toggleTrack(trackId: String): StoryAudioMuteState =
        copy(mutedTrackIds = if (trackId in mutedTrackIds) mutedTrackIds - trackId else mutedTrackIds + trackId)

    /** La pastille dessine « coupée » pour sa seule coupure ; le global se lit sur le baffle du rail. */
    fun isTrackMuted(trackId: String): Boolean = trackId in mutedTrackIds

    /** Ce qui sort réellement : le global coupe tout, la coupure d'une piste ne coupe que la sienne. */
    fun isAudible(trackId: String): Boolean = !isGlobalMuted && trackId !in mutedTrackIds

    /** Les pistes reviennent à neutre (changement de slide) ; le global, lui, dure toute la session. */
    fun cleared(): StoryAudioMuteState = if (mutedTrackIds.isEmpty()) this else copy(mutedTrackIds = emptySet())
}
