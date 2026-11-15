package me.meeshy.sdk.model.call

/** Le rang d'un élément parmi ceux du carrousel, tel que la voix le dit. */
public data class CallModeCarouselOrdinal(val rank: Int, val count: Int)

/** Ce que l'activation (double toucher de TalkBack) fait : appliquer ce qui est annoncé, ou confirmer ce qui est déjà posé. */
public sealed interface CallModeCarouselActivation<out T> {
    public data class Apply<T>(val item: T) : CallModeCarouselActivation<T>

    public data object Confirm : CallModeCarouselActivation<Nothing>
}

/**
 * #18192 — sous TalkBack, le carrousel est UN élément : la position PARCOURUE (ce que la voix annonce) est distincte
 * de l'effet APPLIQUÉ. Un pas déplace la position sans rien poser ; l'activation applique ce qui est annoncé — ou,
 * si c'est déjà l'effet posé, se contente de confirmer (la barre rend son menu de base, C1 généralisée) ; quitter
 * l'élément oublie la position. Une [variant] (la déclinaison d'un cadre) se parcourt de même, à partir de celle qui
 * est posée. Miroir de iOS `CallModeCarouselBrowse` (`CallModeRules.swift`), mêmes vecteurs.
 */
public data class CallModeCarouselBrowse<T>(val browsed: T? = null, val variant: T? = null) {
    public val isBrowsing: Boolean get() = browsed != null || variant != null

    public fun position(applied: T): T = browsed ?: applied

    /** Le pas suivant / précédent depuis la position parcourue ; `null` au bord, sans rien bouger. */
    public fun step(by: Int, items: List<T>, applied: T): CallModeCarouselBrowse<T>? {
        val from = position(applied)
        val next = CallModeCarouselRule.stepping(from, items, by)
        return if (next == from) null else CallModeCarouselBrowse(browsed = next, variant = null)
    }

    /** Le pas de déclinaison du cadre annoncé, depuis celle qui est posée ; `null` sans déclinaison ou au bord. */
    public fun stepVariant(by: Int, applied: T, variants: (T) -> List<T>, current: (T) -> T): CallModeCarouselBrowse<T>? {
        val base = position(applied)
        val list = variants(base)
        val from = variant ?: current(base)
        if (list.size <= 1 || from !in list) return null
        val next = CallModeCarouselRule.stepping(from, list, by)
        return if (next == from) null else CallModeCarouselBrowse(browsed = base, variant = next)
    }

    public fun activation(applied: T, current: (T) -> T = { it }): CallModeCarouselActivation<T> {
        val declination = variant
        if (declination != null) {
            return if (declination == current(position(applied))) CallModeCarouselActivation.Confirm else CallModeCarouselActivation.Apply(declination)
        }
        val target = position(applied)
        return if (target == applied) CallModeCarouselActivation.Confirm else CallModeCarouselActivation.Apply(target)
    }

    public fun leave(): CallModeCarouselBrowse<T> = CallModeCarouselBrowse()
}
