package me.meeshy.sdk.model.media

/** Ce que fait une image : en route, retenue par la politique, tombee, ou affichee. */
public enum class ImagePhase {
    LOADING, DEFERRED, FAILED, LOADED;

    public companion object {
        /** Une requete a reseau interdit qui echoue est retenue (un geste la leve), pas tombee. */
        public fun afterError(networkAllowed: Boolean): ImagePhase = if (networkAllowed) FAILED else DEFERRED
    }
}

/** Le chrome d'etat : la variante decorative n'en porte aucun. */
public enum class ImageChrome {
    NONE, RETRY, TAP_TO_DOWNLOAD;

    public companion object {
        public fun of(phase: ImagePhase, showsStatusOverlays: Boolean): ImageChrome = when {
            !showsStatusOverlays -> NONE
            phase == ImagePhase.FAILED -> RETRY
            phase == ImagePhase.DEFERRED -> TAP_TO_DOWNLOAD
            else -> NONE
        }
    }
}

/** Miroir de `MediaFetchGate` (iOS) : cache -> politique -> reseau en un seul endroit. */
public object ImageLoadPolicy {
    public fun shouldSkipNetworkFetch(
        autoLoad: Boolean,
        isLocalFile: Boolean,
        hasLocalCacheHit: Boolean,
        policyAllowsAutoLoad: Boolean,
    ): Boolean = !autoLoad && !isLocalFile && !hasLocalCacheHit && !policyAllowsAutoLoad

    /** Un fichier de l'appareil : aucun octet reseau ne peut partir, la politique ne s'y applique jamais. */
    public fun isLocalFile(url: String): Boolean =
        url.startsWith("file://") || url.startsWith("content://") || url.startsWith("/")
}

/**
 * Miroir de `WarmImageProbe` (iOS) : ne memorise que l'ABSENCE (jamais l'image) pour ne pas refaire une sonde disque
 * dont on connait la reponse negative. La residence est consultee avant le memo et l'efface. Borne : au plafond on vide.
 */
public class AbsencePresenceMemo(private val cap: Int = 512) {
    private val missing = HashSet<String>()

    public val missCount: Int @Synchronized get() = missing.size

    @Synchronized
    public fun isOnDevice(key: String, resident: (String) -> Boolean, probe: (String) -> Boolean): Boolean {
        if (resident(key)) {
            missing.remove(key)
            return true
        }
        if (key in missing) return false
        if (probe(key)) return true
        if (missing.size >= cap) missing.clear()
        missing.add(key)
        return false
    }

    @Synchronized
    public fun reset() { missing.clear() }
}
