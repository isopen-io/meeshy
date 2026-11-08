package me.meeshy.sdk.model

/**
 * Le cache des sondes de piste audio des vidéos du fil (iOS `ReelFeedSoundIntent.audioTrackPresence`) : « ce média porte-t-il
 * du son ? » par id de média. Une clé absente n'est PAS « muet » : le bouton son ne clignote jamais pour un clip non sondé.
 * Borné : le plus ancien sondage sort quand la capacité est dépassée (un média revu sera simplement re-sondé).
 */
public data class FeedAudioProbeTable(
    val presence: Map<String, Boolean> = emptyMap(),
    private val order: List<String> = emptyList(),
) {
    public fun hasAudioTrack(mediaId: String): Boolean = presence[mediaId] ?: false

    public fun isProbed(mediaId: String): Boolean = presence[mediaId] != null

    /**
     * Enregistre un sondage. `probedTrackCount == null` (asset injoignable) ne change rien, pour retenter ; un média déjà
     * sondé garde sa première réponse.
     */
    public fun recording(mediaId: String, probedTrackCount: Int?, capacity: Int = CAPACITY): FeedAudioProbeTable {
        if (isProbed(mediaId)) return this
        val merged = StoryAudioAvailability.merging(presence, mediaId, probedTrackCount)
        if (merged[mediaId] == null) return this
        val nextOrder = (order + mediaId).takeLast(capacity)
        return FeedAudioProbeTable(merged.filterKeys { it in nextOrder }, nextOrder)
    }

    public companion object {
        public const val CAPACITY: Int = 400
    }
}
