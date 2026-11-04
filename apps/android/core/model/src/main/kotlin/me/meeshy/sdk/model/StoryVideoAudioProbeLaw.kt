package me.meeshy.sdk.model

/**
 * La sonde de piste audio des vidéos d'une story, côté loi (iOS `StoryVideoAudioProbe` + `StoryAudioAvailability`).
 *
 * Trois états par vidéo : sondée (présence vraie ou fausse), PAS ENCORE sondée (le bouton son ne clignote pas pour un clip
 * qui s'avère muet) et sondage EN ÉCHEC (asset injoignable : le bouton est conservé, un échec n'est jamais « muet »).
 */
object StoryVideoAudioProbeLaw {

    /** Nombre de pistes audio, ou `null` quand la sonde n'a PAS pu aboutir (URL non résolue, lecture qui lève). */
    fun trackCount(url: String?, count: (String) -> Int?): Int? {
        if (url.isNullOrBlank()) return null
        return try {
            count(url)
        } catch (e: Exception) {
            null
        }
    }

    /** La table à passer à [StoryAudioAvailability] : les sondages réussis, plus les échecs comptés comme audibles. */
    fun tracksForButton(probed: Map<String, Boolean>, failed: Set<String>): Map<String, Boolean> =
        failed.associateWith { true } + probed

    /** Le bouton son du rail : montré seulement si la story est audible (voir [StoryAudioAvailability.needsSoundButton]). */
    fun showsSoundButton(
        effects: StoryEffects?,
        probed: Map<String, Boolean>,
        failed: Set<String>,
        backgroundSoundIsAnnounced: Boolean,
    ): Boolean = StoryAudioAvailability.needsSoundButton(effects, tracksForButton(probed, failed), backgroundSoundIsAnnounced)
}
