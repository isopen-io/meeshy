package me.meeshy.sdk.model.game

/**
 * LE RETOUR (#17373, #20404) — celui qui revient après sept jours sans journée de jeu n'est pas tiré sur ses habitudes
 * d'avant : le jour du retour et les deux suivants, le Rêve est allégé, et le jour du retour, les aïeux lui ont GARDÉ
 * son Offrande, prête sans attendre les actes. La passerelle tient la règle ; le client ne fait que la lire. Miroir de
 * `packages/shared/utils/game/welcome-back.ts` et de `GameWelcomeBack` (iOS).
 */
public object GameWelcomeBack {
    /** Les jours de Rêve allégé, le jour du retour compris (`WELCOME_BACK_EASED_DAYS`). */
    public const val EASED_DAYS: Int = 3

    /**
     * Faut-il dire au joueur qui revient que les aïeux lui ont gardé son Offrande ? Tant qu'elle est prête, le jour du
     * retour : ouverte, elle ne se redit plus. Un serveur antérieur ne sert pas `kept` : rien ne se montre.
     */
    public fun announcesKeptOffering(kept: Boolean?, status: ChestStatus): Boolean =
        kept == true && status == ChestStatus.Ready
}
