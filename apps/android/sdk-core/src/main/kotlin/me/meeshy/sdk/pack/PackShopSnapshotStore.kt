package me.meeshy.sdk.pack

import me.meeshy.sdk.cache.CachePolicy
import me.meeshy.sdk.model.appearance.AppearancePackDomain
import me.meeshy.sdk.model.packs.PackShopResponse

/**
 * Le dernier contenu connu de la vitrine — miroir de `PackShopSnapshotStore` d'iOS (Cache-First).
 *
 * La vitrine s'ouvre sur ce qu'elle a lu la dernière fois, jamais sur des lignes fantômes quand un contenu existe, même
 * périmé : **frais une minute** (servi tel quel, aucune relecture), **servable périmé jusqu'à sept jours** (servi puis
 * relu en silence), au-delà la lecture repart de zéro (lignes fantômes à froid seulement). La ligne est rangée dans le
 * cache clé-JSON par compte ([KEY_OFFERED] pour l'ensemble des domaines que la boutique propose, une clé par autre
 * ensemble) ; sa charge est celle de la réponse du serveur, dont les domaines et champs inconnus sont tolérés au décodage.
 */
object PackShopSnapshotStore {
    const val NAMESPACE: String = "pack-shop"

    /** La clé de l'ensemble des domaines que la boutique propose, inchangée depuis la première version du cache. */
    const val KEY_OFFERED: String = "offered"

    private const val MINUTE_MILLIS = 60_000L
    private const val DAY_MILLIS = 24 * 60 * MINUTE_MILLIS

    /** Frais une minute ; servable (périmé) sept jours, au-delà la lecture repart de zéro. */
    val POLICY: CachePolicy = CachePolicy(freshForMillis = MINUTE_MILLIS, keepForMillis = 7 * DAY_MILLIS)

    /** La clé par ENSEMBLE de domaines : l'ordre demandé et les doublons n'y changent rien. */
    fun key(domains: List<AppearancePackDomain>): String {
        val wanted = domains.map { it.wire }.toSortedSet()
        return if (wanted == PackShopResponse.OFFERED.map { it.wire }.toSortedSet()) KEY_OFFERED else wanted.joinToString(",")
    }
}
