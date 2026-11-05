package me.meeshy.sdk.model.playback

/**
 * **Où va le toucher d'un drapeau du pied d'un vocal.** Un drapeau qui porte un TEXTE dans sa langue reste un drapeau de
 * texte (la loi des drapeaux de la bulle s'applique) ; un drapeau qui ne porte qu'une PISTE de la pièce sélectionne cette
 * piste (la langue d'origine du vocal vaut la piste originale, `Audio(null)`) ; sans texte ni piste il est inerte.
 */
public object VoiceFlagRoute {

    public sealed interface Route {
        public data object Text : Route

        /** Sélectionne la piste [track] ; `null` ⇒ la piste originale. */
        public data class Audio(val track: String?) : Route

        public data object Inert : Route
    }

    public fun route(
        code: String,
        textContentCodes: Set<String>,
        audioOriginal: String?,
        audioTrackCodes: List<String>,
    ): Route {
        val tapped = code.trim().lowercase().takeIf { it.isNotEmpty() } ?: return Route.Inert
        if (textContentCodes.any { it.trim().lowercase() == tapped }) return Route.Text
        if (tapped == audioOriginal?.trim()?.lowercase()) return Route.Audio(null)
        if (audioTrackCodes.any { it.trim().lowercase() == tapped }) return Route.Audio(tapped)
        return Route.Inert
    }
}
