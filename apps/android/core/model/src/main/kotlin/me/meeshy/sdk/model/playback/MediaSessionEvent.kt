package me.meeshy.sdk.model.playback

/**
 * Les événements de la session audio partagée qu'un lecteur reçoit — port de iOS
 * `MediaSessionCoordinator.Event`.
 *
 * Un lecteur se met en pause à [InterruptionBegan] et peut reprendre à
 * [InterruptionEndedShouldResume] ; il se met en pause à [RouteChangedOldDeviceUnavailable] (casque
 * débranché, haut-parleur Bluetooth perdu). Côté Android, la traduction depuis le focus audio et
 * les changements de sortie appartient au coordinateur du lot d'exécution : une perte de focus
 * permanente est un [InterruptionBegan] suivi d'un [InterruptionEndedShouldNotResume].
 */
public enum class MediaSessionEvent {
    InterruptionBegan,
    InterruptionEndedShouldResume,
    InterruptionEndedShouldNotResume,
    RouteChangedOldDeviceUnavailable,
    RouteChangedOther,

    /**
     * Un appel Meeshy vient de se terminer. Le démontage de l'appel ne publie pas toujours de fin
     * d'interruption système : ce signal explicite relance les médias qui s'étaient eux-mêmes
     * coupés pendant l'appel (audio de story, réels). À traiter exactement comme
     * [InterruptionEndedShouldResume] : reprendre seulement si le contenu est encore à l'écran et
     * que l'utilisateur ne l'a pas mis en pause.
     */
    CallEndedShouldResume,
}
