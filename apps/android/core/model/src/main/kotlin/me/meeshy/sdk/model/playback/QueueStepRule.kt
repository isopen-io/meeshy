package me.meeshy.sdk.model.playback

/** Ce que « précédent » fait d'un vocal de la file. */
public enum class PreviousStep {
    /** Recommencer le vocal en cours. */
    Restart,

    /** Revenir au vocal d'avant. */
    Rewind,
}

/**
 * **« Précédent » dans une file de vocaux** — miroir de iOS `ConversationAudioCoordinator.previous()` :
 * au-delà de [RESTART_THRESHOLD_MS] de lecture, ou sans vocal d'avant, on recommence celui qui joue ;
 * sinon on revient au précédent. Une seule règle pour l'app, la carte du système et le casque.
 */
public object QueueStepRule {

    public const val RESTART_THRESHOLD_MS: Long = 3_000L

    public fun previous(positionMs: Long, hasPrevious: Boolean): PreviousStep =
        if (!hasPrevious || positionMs > RESTART_THRESHOLD_MS) PreviousStep.Restart else PreviousStep.Rewind
}
