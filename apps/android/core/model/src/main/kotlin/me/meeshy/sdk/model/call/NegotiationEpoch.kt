package me.meeshy.sdk.model.call

/**
 * L'époque de la négociation (§3.5), miroir de iOS `CallSdpSignaler` + `isStaleNegotiation` /
 * `isFreshLinkOffer`. La marque haute est la plus grande génération ENVOYÉE ou VUE ; un signal strictement plus
 * ancien est écarté sans toucher au moteur. La génération 0 (passerelle ou client ancien) et 1 sont toujours
 * acceptées en tête d'appel ; un lien NEUF compte depuis 1 : la première offre d'un pair revenu fait converger
 * la marque au lieu d'être jetée par un compteur resté haut (#9111).
 */
class NegotiationEpoch {
    var highWaterMark: Int = 0
        private set

    fun reset() {
        highWaterMark = 0
    }

    /** Une offre locale ouvre une nouvelle génération ; la réponse et l'ICE réutilisent la courante. */
    fun beginOutgoing(): Int {
        highWaterMark += 1
        return highWaterMark
    }

    fun isFreshLinkOffer(incoming: Int, isOffer: Boolean): Boolean =
        isOffer && incoming <= 1 && incoming < highWaterMark

    fun isStale(incoming: Int, isOffer: Boolean): Boolean =
        incoming < highWaterMark && !isFreshLinkOffer(incoming, isOffer)

    /** Accepte [generation] (`null` = 0) et avance la marque ; un lien neuf la REPREND à sa valeur. */
    fun accept(generation: Int?, isOffer: Boolean): Boolean {
        val incoming = generation ?: 0
        if (isStale(incoming, isOffer)) return false
        val fresh = isFreshLinkOffer(incoming, isOffer)
        highWaterMark = if (fresh) incoming else maxOf(highWaterMark, incoming)
        return true
    }

    /** Une relance d'une génération [generation] ne part plus si une négociation plus récente l'a remplacée. */
    fun supersedes(generation: Int): Boolean = generation < highWaterMark
}
