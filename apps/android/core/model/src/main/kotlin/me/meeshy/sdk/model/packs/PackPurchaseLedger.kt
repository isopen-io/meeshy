package me.meeshy.sdk.model.packs

import me.meeshy.sdk.model.appearance.AppearancePackDomain
import me.meeshy.sdk.model.game.GameErrorCode

/** Pourquoi un achat n'a pas abouti ; le texte appartient à l'écran. */
enum class PackShopFailure { INSUFFICIENT_MEESHES, GENERIC }

/**
 * Un refus lu pour ce qu'il dit : [definitive] = le geste est tranché (4xx hors 408/429), son identifiant d'intention
 * est clos ; un réseau coupé ou un 5xx laisse le geste rejouable avec le MÊME identifiant, le serveur ne débite qu'une fois.
 * [failure] `null` = rien n'a échoué à dire : `PACK_ALREADY_OWNED`, le pack est à moi (une réponse perdue, un autre
 * appareil) et la vitrine relue le montre possédé.
 */
data class PackPurchaseRefusal(val failure: PackShopFailure?, val definitive: Boolean) {
    companion object {
        const val ALREADY_OWNED = "PACK_ALREADY_OWNED"

        fun of(httpStatus: Int?, code: String?): PackPurchaseRefusal = PackPurchaseRefusal(
            failure = when (code) {
                GameErrorCode.InsufficientMeeshes.wire -> PackShopFailure.INSUFFICIENT_MEESHES
                ALREADY_OWNED -> null
                else -> PackShopFailure.GENERIC
            },
            definitive = httpStatus != null && httpStatus in 400..499 && httpStatus != 408 && httpStatus != 429,
        )

        /** Une panne que la couche réseau n'a pas su lire : rien ne dit que le serveur n'a pas débité, le geste reste rejouable. */
        val UNREAD: PackPurchaseRefusal = PackPurchaseRefusal(PackShopFailure.GENERIC, definitive = false)
    }
}

/** Un achat qui peut partir : le registre à jour et l'identifiant d'intention à envoyer. */
data class PackPurchaseBegun(val ledger: PackPurchaseLedger, val requestId: String)

/**
 * **Le registre des achats en vol — sans une seule écriture sur un solde ni sur une possession.**
 *
 * Contrairement à l'achat optimiste d'iOS, le geste ne change RIEN à la vitrine : le pack ne devient possédé et le solde
 * ne baisse que quand le serveur a répondu ([PackShopResponse.applying]). Ce registre ne tient que ce que le client sait
 * de SON geste : quels packs sont en vol (un second toucher est ignoré), l'identifiant d'intention de chacun (né au geste,
 * gardé tant que le geste n'est pas tranché), et le dernier échec à dire.
 */
data class PackPurchaseLedger(
    val pending: Set<String> = emptySet(),
    val requestIds: Map<String, String> = emptyMap(),
    val failure: PackShopFailure? = null,
) {
    /** `null` si le pack est inconnu, gratuit, déjà à moi, pas débloqué, ou déjà en vol. */
    fun begin(domain: AppearancePackDomain, pack: ShopPack?, makeRequestId: () -> String): PackPurchaseBegun? {
        val key = key(domain, pack?.slug ?: return null)
        if (key in pending || !pack.canBuy) return null
        val requestId = requestIds[key] ?: makeRequestId()
        return PackPurchaseBegun(
            copy(pending = pending + key, requestIds = requestIds + (key to requestId), failure = null),
            requestId,
        )
    }

    /** Le serveur a confirmé : le geste est clos. */
    fun settled(domain: AppearancePackDomain, slug: String): PackPurchaseLedger {
        val key = key(domain, slug)
        return copy(pending = pending - key, requestIds = requestIds - key)
    }

    /** Un refus clôt le geste s'il est définitif ; sinon l'identifiant reste pour le nouvel essai. */
    fun refused(domain: AppearancePackDomain, slug: String, refusal: PackPurchaseRefusal): PackPurchaseLedger {
        val key = key(domain, slug)
        return copy(
            pending = pending - key,
            requestIds = if (refusal.definitive) requestIds - key else requestIds,
            failure = refusal.failure,
        )
    }

    fun dismissFailure(): PackPurchaseLedger = copy(failure = null)

    /** Les slugs en vol dans CE domaine. */
    fun pendingIn(domain: AppearancePackDomain): Set<String> {
        val prefix = "${domain.wire}."
        return pending.filter { it.startsWith(prefix) }.map { it.removePrefix(prefix) }.toSet()
    }

    companion object {
        fun key(domain: AppearancePackDomain, slug: String): String = "${domain.wire}.$slug"
    }
}
