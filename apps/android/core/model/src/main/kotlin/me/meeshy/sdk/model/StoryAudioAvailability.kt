package me.meeshy.sdk.model

/**
 * Source unique : la story porte-t-elle un son AUDIBLE — donc faut-il montrer le bouton son ?
 * Miroir de `StoryAudioAvailability` (iOS).
 *
 * Une vidéo muette ou sans piste n'est jamais audible ; une note vocale l'est toujours.
 */
object StoryAudioAvailability {

    /**
     * @param videoAudioTracks `StoryMediaObject.id` -> `true` quand l'asset sondé porte une
     *   piste audio non vide. Une clé absente (pas encore sondé) vaut NON audible, pour que le
     *   bouton ne clignote jamais pour un clip qui s'avère muet.
     */
    fun hasAudibleSound(effects: StoryEffects?, videoAudioTracks: Map<String, Boolean>): Boolean {
        if (effects == null) return false
        if (effects.voiceAttachmentId != null) return true
        if (effects.backgroundAudioId != null && (effects.backgroundAudioVolume ?: 1f) > 0f) return true
        if (effects.audioPlayerObjects.orEmpty().any { it.volume > 0f }) return true
        return effects.mediaObjects.orEmpty().any {
            it.kind == StoryMediaKind.VIDEO && it.volume > 0f && videoAudioTracks[it.id] == true
        }
    }

    /**
     * Le baffle a-t-il encore un son à couper ? Quand le fond s'annonce par sa note de crédit,
     * le baffle ne reste que pour le reste (note vocale, piste non fond, piste propre d'une vidéo).
     */
    fun needsSoundButton(
        effects: StoryEffects?,
        videoAudioTracks: Map<String, Boolean>,
        backgroundSoundIsAnnounced: Boolean,
    ): Boolean {
        if (!backgroundSoundIsAnnounced) return hasAudibleSound(effects, videoAudioTracks)
        val rest = effects?.copy(
            backgroundAudioId = null,
            audioPlayerObjects = effects.audioPlayerObjects?.filter { it.isBackground != true },
        ) ?: return false
        return hasAudibleSound(rest, videoAudioTracks)
    }

    /** Les vidéos dont la piste audio doit être sondée ; une vidéo déjà muette est exclue. */
    fun videosNeedingAudioProbe(effects: StoryEffects?): List<StoryMediaObject> =
        effects?.mediaObjects.orEmpty().filter { it.kind == StoryMediaKind.VIDEO && it.volume > 0f }

    /**
     * Enregistre un sondage. `probedTrackCount == null` = sondage impossible (URL non résolue,
     * asset injoignable), surtout PAS « vidéo muette » : la table reste inchangée pour retenter.
     */
    fun merging(table: Map<String, Boolean>, id: String, probedTrackCount: Int?): Map<String, Boolean> =
        if (probedTrackCount == null) table else table + (id to (probedTrackCount > 0))
}
