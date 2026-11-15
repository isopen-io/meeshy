package me.meeshy.sdk.model.playback

import me.meeshy.sdk.model.QueuedAudio

/**
 * **La piste d'un vocal est-elle la bonne ?** Une même pièce a une piste par langue (la voix d'origine, une voix traduite) ; un
 * drapeau choisi pendant l'écoute — dans la bulle ou dans le plein écran — change la piste SERVIE sans que le moteur le sache.
 * La bulle et le plein écran partagent cette loi : une seule définition de « périmée », deux appelants.
 */
public object VoiceVariant {

    /**
     * La piste en lecture ([playing]) n'est pas celle que l'hôte sert maintenant ([served]) : même pièce, autre adresse ET autre
     * langue (ou autre nature, traduite ou non). Une autre pièce n'est jamais périmée ; une adresse changée sans changer de langue
     * non plus.
     */
    public fun isStale(playing: QueuedAudio, served: QueuedAudio): Boolean =
        playing.attachmentId == served.attachmentId && playing.fileUrl != served.fileUrl &&
            (playing.isTranslatedTrack != served.isTranslatedTrack || !playing.trackLanguage.equals(served.trackLanguage, ignoreCase = true))
}
