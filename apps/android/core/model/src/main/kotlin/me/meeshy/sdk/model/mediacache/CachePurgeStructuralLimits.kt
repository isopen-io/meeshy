package me.meeshy.sdk.model.mediacache

/**
 * Table des limites structurelles (miroir de `CachePurgeService.measure`, iOS). Chaque croisement
 * type x domaine a exactement un verdict : `null` = mesurable (donc purgeable), sinon la raison.
 */
public object CachePurgeStructuralLimits {

    public fun limitation(kind: CacheDataKind, domain: CacheDomain): CachePurgeLimitation? = when (kind) {
        CacheDataKind.DOCUMENTS -> CachePurgeLimitation.NO_DEDICATED_STORE
        CacheDataKind.REACTIONS -> CachePurgeLimitation.EMBEDDED_IN_PAYLOAD
        CacheDataKind.MESSAGES ->
            if (domain == CacheDomain.CONVERSATIONS) null else CachePurgeLimitation.NOT_APPLICABLE
        CacheDataKind.PAYLOADS ->
            if (domain == CacheDomain.REELS) CachePurgeLimitation.INDIVISIBLE_FROM_POSTS else null
        CacheDataKind.IMAGES, CacheDataKind.VIDEOS, CacheDataKind.AUDIO -> null
    }

    public fun isMeasurable(kind: CacheDataKind, domain: CacheDomain): Boolean =
        limitation(kind, domain) == null

    /** Disponibilité d'une case : la limite si elle existe, sinon les octets mesurés (clampés à 0). */
    public fun availability(kind: CacheDataKind, domain: CacheDomain, measuredBytes: Long): CachePurgeAvailability =
        limitation(kind, domain)
            ?.let { CachePurgeAvailability.Unavailable(it) }
            ?: CachePurgeAvailability.Purgeable(measuredBytes.coerceAtLeast(0L))
}
