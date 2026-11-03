package me.meeshy.sdk.model.scene

/**
 * Ce qu'un appui long sur le FOND doit ouvrir (miroir de `StoryCanvasBackgroundLongPress`, iOS #5041) :
 * une scène vraiment vide ouvre le viseur caméra ; un média de fond ouvre les outils du fond (niveau « Fond ») ;
 * un objet garde son propre geste, le fond ne fait rien. Le geste n'est reconnu qu'en édition.
 */
public sealed interface BackgroundLongPressOutcome {
    public data object OpenViewfinder : BackgroundLongPressOutcome
    public data class SelectBackground(val mediaObjectId: String) : BackgroundLongPressOutcome
    public data object Nothing : BackgroundLongPressOutcome

    public companion object {
        /**
         * [hitObjectId] : l'objet de premier plan sous le doigt, s'il y en a un. [backgroundMediaObjectId] : le média
         * de fond de la diapo (nul = couleur, dégradé, scène neuve). [hostSelectsBackground] : l'hôte sait-il
         * sélectionner le fond ? Sinon le geste retombe sur le viseur plutôt que de rester muet.
         */
        public fun resolve(
            isEditing: Boolean,
            hitObjectId: String?,
            backgroundMediaObjectId: String?,
            hostSelectsBackground: Boolean = true,
        ): BackgroundLongPressOutcome = when {
            !isEditing || hitObjectId != null -> Nothing
            hostSelectsBackground && !backgroundMediaObjectId.isNullOrEmpty() -> SelectBackground(backgroundMediaObjectId)
            else -> OpenViewfinder
        }
    }
}
