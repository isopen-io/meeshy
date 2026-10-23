package me.meeshy.sdk.model.chrome

/**
 * La TEINTE de la bande de chrome du haut (miroir de iOS `TopChromeTint`) : un aplat ARGB unique, partage
 * par la barre active ET par la bande sous la barre d'etat, pour que la couture soit continue par construction.
 */
public data class TopChromeTint(val bandColorArgb: Long) {
    public companion object {
        /** Indigo600 `#4F46E5` : l'arret haut calibre contre le blanc (6,3:1), aplat de l'appel. */
        public const val CALL_ARGB: Long = 0xFF4F46E5

        /** Meme valeur que l'appel : deux barres distinctes, pas deux couleurs. */
        public const val AUDIO_ARGB: Long = 0xFF4F46E5

        public val call: TopChromeTint = TopChromeTint(CALL_ARGB)
        public val audio: TopChromeTint = TopChromeTint(AUDIO_ARGB)

        /** `null` = aucune barre active = aucune bande. Priorite : appel, puis audio, puis banniere. */
        public fun resolve(callIsActive: Boolean, audioIsActive: Boolean, bannerArgb: Long? = null): TopChromeTint? = when {
            callIsActive -> call
            audioIsActive -> audio
            else -> bannerArgb?.let(::TopChromeTint)
        }
    }
}
