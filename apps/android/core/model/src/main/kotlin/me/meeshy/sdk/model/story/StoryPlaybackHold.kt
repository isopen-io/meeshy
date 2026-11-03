package me.meeshy.sdk.model.story

/**
 * **Une story retenue se FIGE ou BOUCLE, jamais rien d'autre** — port de iOS `StoryPlaybackHold` (#9821).
 *
 * Elle ne se fige (image arrêtée, son coupé) que pour poser une réaction, sur la pause de l'utilisateur, sous un
 * geste ou une interruption. Ouvrir les commentaires, le menu, les langues, la légende, la transcription ou une
 * feuille la laisse JOUER : à sa fin elle repart à son début au lieu d'avancer. `null` : rien ne la retient.
 */
public enum class StoryPlaybackHold {
    Pause,
    Loop,
    ;

    /** Ce que la fin de la story déclenche. */
    public enum class EndAction { Advance, RestartInPlace }

    public companion object {
        /** Pause > boucle > avance : une réaction posée pendant qu'on compose fige l'image le temps de son vol. */
        public fun resolve(causes: StoryPlaybackCauses): StoryPlaybackHold? = when {
            causes.freezes -> Pause
            causes.engaged -> Loop
            else -> null
        }

        public fun endAction(hold: StoryPlaybackHold?): EndAction =
            if (hold == Loop) EndAction.RestartInPlace else EndAction.Advance
    }
}

/**
 * Les raisons qu'a la story d'être retenue, rangées par effet.
 *
 * - [explicitPause] : l'appui long de l'utilisateur ;
 * - [reacting] : barre ou sélecteur de réactions ouvert, réaction en vol ;
 * - [gestureInFlight] : glissé du lecteur, parcours du rail, transition, fermeture ;
 * - [coveredByScreen] : un écran plein recouvre la story (elle ne joue pas son son derrière) ;
 * - [interrupted] : un appel, une interruption audio du système, un événement du jeu ;
 * - [engaged] : commentaires, composition, menu, langues, légende, transcription, feuilles — elle boucle.
 */
public data class StoryPlaybackCauses(
    val explicitPause: Boolean = false,
    val reacting: Boolean = false,
    val gestureInFlight: Boolean = false,
    val coveredByScreen: Boolean = false,
    val interrupted: Boolean = false,
    val engaged: Boolean = false,
) {
    val freezes: Boolean
        get() = explicitPause || reacting || gestureInFlight || coveredByScreen || interrupted
}
