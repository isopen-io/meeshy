package me.meeshy.sdk.model.pack

import me.meeshy.sdk.model.appearance.AppearancePackDomain
import me.meeshy.sdk.model.packs.PackPurchaseLedger
import me.meeshy.sdk.model.packs.PackPurchaseRefusal
import me.meeshy.sdk.model.packs.PackPurchaseResponse
import me.meeshy.sdk.model.packs.PackShopFailure
import me.meeshy.sdk.model.packs.PackShopResponse
import me.meeshy.sdk.model.packs.ShopPack

/** Ce qu'un toucher sur « Acheter » devient : un achat qui part, un toucher ignoré, ou un refus hors ligne. */
sealed interface PackPurchaseStart {
    data class Started(val state: PackShopState, val requestId: String) : PackPurchaseStart

    /** Pack inconnu, gratuit, déjà à moi, pas débloqué, ou déjà en vol : rien ne change. */
    data object Ignored : PackPurchaseStart

    /** Hors ligne : l'achat est refusé sans partir, aucun identifiant d'intention n'est consommé. */
    data class Offline(val state: PackShopState) : PackPurchaseStart
}

/**
 * **L'état de la vitrine et ses transitions pures** — miroir de `PackShopState` d'iOS, sans réseau ni horloge.
 *
 * [shop] `null` = la vitrine n'a JAMAIS été lue (cache vide) : seul cet état peint des lignes fantômes, jamais un
 * spinner sur une vitrine connue, même périmée. Un achat ne change ni possession ni solde avant la réponse du serveur
 * ([purchaseSettled]) ; chaque pack est en vol SEUL (par slug), les autres restent actifs. Un `403` arme [needsReload] :
 * la vitrine affichée n'est plus la vérité du serveur et se relit.
 */
data class PackShopState(
    val shop: PackShopResponse? = null,
    val loading: Boolean = false,
    val loadFailed: Boolean = false,
    val ledger: PackPurchaseLedger = PackPurchaseLedger(),
    val offline: Boolean = false,
    val needsReload: Boolean = false,
) {
    val balance: Int? get() = shop?.balance
    val failure: PackShopFailure? get() = ledger.failure

    /** Lignes fantômes : démarrage à froid seulement, tant que rien n'a échoué. */
    val showsPlaceholders: Boolean get() = shop == null && !loadFailed

    /** L'écran d'échec « Recharger » : à froid seulement — une vitrine connue n'est jamais remplacée par une erreur. */
    val showsLoadFailure: Boolean get() = shop == null && loadFailed

    fun packs(domain: AppearancePackDomain): List<ShopPack>? = shop?.packs(domain)

    fun isPending(domain: AppearancePackDomain, slug: String): Boolean =
        PackPurchaseLedger.key(domain, slug) in ledger.pending

    fun startLoading(): PackShopState = copy(loading = true, loadFailed = false)

    /** Une vitrine servie (cache ou réseau) : elle fait foi, et l'éventuel rechargement attendu est satisfait. */
    fun loaded(response: PackShopResponse): PackShopState =
        copy(shop = response, loading = false, loadFailed = false, needsReload = false)

    /** Un échec de lecture n'efface JAMAIS une vitrine connue ; il n'est montré que sur cache vide. */
    fun loadFailed(): PackShopState = copy(loading = false, loadFailed = true)

    fun connectivity(isOnline: Boolean): PackShopState = copy(offline = !isOnline)

    fun beginPurchase(domain: AppearancePackDomain, slug: String, makeRequestId: () -> String): PackPurchaseStart {
        val pack = shop?.packs(domain)?.firstOrNull { it.slug == slug }
        if (offline) {
            if (pack == null || !pack.canBuy || isPending(domain, slug)) return PackPurchaseStart.Ignored
            return PackPurchaseStart.Offline(copy(ledger = ledger.copy(failure = PackShopFailure.OFFLINE)))
        }
        val begun = ledger.begin(domain, pack, makeRequestId) ?: return PackPurchaseStart.Ignored
        return PackPurchaseStart.Started(copy(ledger = begun.ledger), begun.requestId)
    }

    /** Le serveur a confirmé : son pack et son solde font foi. */
    fun purchaseSettled(domain: AppearancePackDomain, slug: String, purchase: PackPurchaseResponse): PackShopState =
        copy(shop = shop?.applying(domain, purchase), ledger = ledger.settled(domain, slug))

    /** Le refus clôt le SEUL geste concerné ; possession et solde restent ceux du serveur. */
    fun purchaseRefused(domain: AppearancePackDomain, slug: String, refusal: PackPurchaseRefusal): PackShopState =
        copy(ledger = ledger.refused(domain, slug, refusal), needsReload = needsReload || refusal.reloadsShop)

    fun dismissFailure(): PackShopState = copy(ledger = ledger.dismissFailure())
}
