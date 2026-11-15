package me.meeshy.sdk.model.call

/**
 * **Ce que la lecture de Meeshy fait quand l'état d'un appel change** — port de iOS
 * `CallRingPlaybackLaw` (#11063).
 *
 * - L'appel entrant sonne : la vidéo et le vocal en cours baissent, restent audibles sous la sonnerie.
 * - On décroche : la lecture s'arrête, marquée interrompue (elle reprend au raccrochage) ; le volume
 *   revient à sa valeur d'avant.
 * - On refuse, l'appel est manqué ou annulé : le volume remonte, sans interruption.
 * - Un appel sortant arrête la lecture tout de suite.
 *
 * Un appel téléphonique natif ne passe pas par ici : Android interrompt par le focus audio.
 */
object CallRingPlaybackLaw {

    enum class Effect {
        None,

        /** L'appel entrant sonne : baisser. */
        Duck,

        /** L'appel prend la main : arrêter, marqué interrompu. */
        Interrupt,

        /** L'appel entrant est décroché : arrêter, puis rendre le volume. */
        InterruptAndRestore,

        /** L'appel entrant a cessé de sonner sans être pris : rendre le volume. */
        Restore,
    }

    fun effect(old: CallState, new: CallState): Effect {
        val wasRingingIn = isRingingIn(old)
        val ringsIn = isRingingIn(new)
        if (wasRingingIn) {
            if (ringsIn) return Effect.None
            return if (new.isActive) Effect.InterruptAndRestore else Effect.Restore
        }
        if (old.isActive || !new.isActive) return Effect.None
        return if (ringsIn) Effect.Duck else Effect.Interrupt
    }

    /**
     * `true` : l'interruption des lecteurs à timeline commence ; `false` : elle finit ; `null` : rien
     * ne change. Le panneau de fin garde l'interruption (la vue d'appel est encore là) : seul le
     * retour au repos la lève.
     */
    fun interruption(state: CallState): Boolean? = when {
        state.isActive -> true
        state is CallState.Idle -> false
        else -> null
    }

    private fun isRingingIn(state: CallState): Boolean =
        state is CallState.Ringing && !state.isOutgoing
}
