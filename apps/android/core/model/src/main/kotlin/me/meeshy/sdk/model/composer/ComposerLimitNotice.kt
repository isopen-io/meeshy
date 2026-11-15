package me.meeshy.sdk.model.composer

/**
 * Une limite ne se dit qu'au moment où on l'atteint (#13838, directive porteur du 2026-10-30 : « les détails nombre de
 * caractères, nombre max… sont inutiles : on l'indique quand on atteint la limite »). Sous le plafond, rien : ni compteur, ni
 * plafond. À la limite, un mot bref et un retour haptique, une seule fois, au geste qui l'atteint.
 */
object ComposerLimitNotice {
    /** [REACHED] : on est au plafond ; [EXCEEDED] : on l'a dépassé (un collage), et la publication le refusera. */
    enum class Kind { REACHED, EXCEEDED }

    fun visibleAt(used: Int, cap: Int): Kind? = when {
        cap <= 0 || used < cap -> null
        used == cap -> Kind.REACHED
        else -> Kind.EXCEEDED
    }

    /** Le geste qui fait passer de « rien à dire » à « limite atteinte » : c'est lui seul qui vibre. */
    fun crossed(previous: Int, current: Int, cap: Int): Boolean =
        visibleAt(previous, cap) == null && visibleAt(current, cap) != null

    /** L'horloge « 0:00 / 0:06 » du plan ne dit rien tant que la tête de lecture n'a pas quitté le début. */
    fun showsPlanClock(playheadSeconds: Float): Boolean = playheadSeconds > 0f
}
