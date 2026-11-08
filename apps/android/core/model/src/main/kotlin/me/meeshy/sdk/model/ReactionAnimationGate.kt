package me.meeshy.sdk.model

/**
 * Marque les réactions qui doivent jouer l'entrée en « comète » à leur prochain rendu (iOS
 * `ReactionAnimationGate`). Alimentée UNIQUEMENT par un vrai évènement « réaction ajoutée » — la
 * bascule locale ET `reaction:added` — jamais par un chargement de liste ni par le recyclage d'une
 * cellule : la nouveauté est un évènement du modèle, pas de la vue. Une clé expire après [window]
 * (la durée de la comète) pour qu'un défilement ultérieur la rende à l'état final.
 */
public class ReactionAnimationGate(private val nowMillis: () -> Long = System::currentTimeMillis) {
    private val expiries = HashMap<String, Long>()

    /** Enregistre une réaction réellement nouvelle ; purge au passage les entrées expirées. */
    @Synchronized
    public fun markAdded(messageId: String, emoji: String) {
        val now = nowMillis()
        expiries.values.removeAll { it <= now }
        expiries[key(messageId, emoji)] = now + WINDOW_MILLIS
    }

    /** Vrai seulement dans la fenêtre qui suit un [markAdded]. */
    @Synchronized
    public fun shouldAnimate(messageId: String, emoji: String): Boolean {
        val expiry = expiries[key(messageId, emoji)] ?: return false
        return expiry > nowMillis()
    }

    private fun key(messageId: String, emoji: String): String = "$messageId\u001F$emoji"

    public companion object {
        /** Doit couvrir la durée de la comète (iOS : 1,3 s). */
        public const val WINDOW_MILLIS: Long = 1_300L

        /** Le portail du processus, partagé par le contrôleur de l'écran et la bande des bulles. */
        public val Shared: ReactionAnimationGate = ReactionAnimationGate()
    }
}
