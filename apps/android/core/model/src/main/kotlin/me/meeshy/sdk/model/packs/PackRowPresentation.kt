package me.meeshy.sdk.model.packs

import me.meeshy.sdk.model.game.GameSpend

/** Le geste qu'une rangée de la vitrine offre à droite, et un seul (iOS `UnifiedShopView.PackRow`). */
sealed interface PackRowAction {
    /** Pas encore débloqué : ni « Acheter » ni « Installer », le serveur refuserait. */
    data object Locked : PackRowAction

    /** « Acheter · N » : payant, pas à moi, débloqué. [meeshes] est le prix servi. */
    data class Buy(val meeshes: Int) : PackRowAction

    data object Install : PackRowAction

    data object Remove : PackRowAction

    /** Un pack non retirable, ou ni achetable ni installable : pas de bouton. */
    data object None : PackRowAction
}

/**
 * Ce que la rangée d'un pack montre, décidé hors de Compose : l'écran n'est qu'une projection de cette valeur, elle se
 * prouve donc sans interface. Rien ici ne calcule un solde ni ne devine une possession.
 */
data class PackRowPresentation(
    val action: PackRowAction,
    /** Pastille « Possédé » : un pack PAYANT que je possède. */
    val showsOwned: Boolean,
    /** Pastille « Gratuit » : sans prix, à moi, débloqué. */
    val showsFree: Boolean,
    /** Les Meeshes qui manquent pour « Acheter », dits AVANT le geste (#20529) ; `null` = rien à dire. */
    val shortfall: Int? = null,
) {
    companion object {
        /** [balance] est le solde que `GET /packs/shop` sert ; `null` (ancien serveur) ne dit aucun manque. */
        fun of(pack: ShopPack, balance: Int? = null): PackRowPresentation {
            val price = pack.meeshes
            val action = when {
                pack.isLocked && !pack.isOwned -> PackRowAction.Locked
                pack.canBuy && price != null -> PackRowAction.Buy(price)
                pack.canToggleInstall && !pack.installed -> PackRowAction.Install
                pack.canToggleInstall && pack.removable -> PackRowAction.Remove
                else -> PackRowAction.None
            }
            return PackRowPresentation(
                action = action,
                showsOwned = price != null && pack.isOwned,
                showsFree = price == null && pack.isOwned && !pack.isLocked,
                shortfall = (action as? PackRowAction.Buy)?.let { PackMeeshShortfall.missing(balance, it.meeshes, pack.isOwned) },
            )
        }
    }
}

/**
 * **Ce qui manque pour acheter un pack** (tranche Android de #17378, miroir de `apps/web/src/lib/packs/shortfall.ts` et
 * de `PackMeeshShortfall.swift`) : l'écart de [GameSpend.preview], la loi de tout geste qui dépense. Le serveur reste
 * juge — la ligne montre, « Acheter » reste offert.
 */
object PackMeeshShortfall {
    /** `null` = rien à dire : solde inconnu, pack possédé, gratuit ou abordable. */
    fun missing(balance: Int?, price: Int?, owned: Boolean): Int? {
        if (owned || price == null || balance == null) return null
        val preview = GameSpend.preview(held = balance.toLong(), cost = price.toLong())
        return if (preview.affordable) null else preview.missing.toInt()
    }
}

/** Ce que la vitrine d'un domaine peint : des lignes fantômes à froid seulement, jamais un spinner sur un cache non vide. */
enum class PackShelfPhase {
    SKELETON,
    ERROR,
    EMPTY,
    CONTENT,
    ;

    companion object {
        /**
         * [packs] `null` = jamais lue. Un échec ne remplace jamais une vitrine connue (hors ligne comprise) : [loadFailed]
         * ne vaut que si [packs] est `null`.
         */
        fun of(packs: List<ShopPack>?, loadFailed: Boolean): PackShelfPhase = when {
            packs == null && loadFailed -> ERROR
            packs == null -> SKELETON
            packs.isEmpty() -> EMPTY
            else -> CONTENT
        }
    }
}
