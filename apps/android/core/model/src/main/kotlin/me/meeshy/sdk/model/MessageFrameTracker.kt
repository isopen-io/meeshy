package me.meeshy.sdk.model

/**
 * Cadres des cellules de message, bornés en LRU (miroir de iOS `MessageFrameTracker`, plafond 200).
 *
 * Écrit à chaque mesure de cellule, lu une seule fois au geste d'appui long : une conversation de groupe
 * longue ne doit pas la faire croître sans borne. Un cadre republié est promu au plus récent ; au-delà du
 * plafond, le moins récemment publié ou lu est évincé. Accès depuis le fil principal uniquement.
 */
public class MessageFrameTracker<F : Any>(public val maxEntries: Int = DEFAULT_MAX_ENTRIES) {
    private val frames = object : LinkedHashMap<String, F>(INITIAL_CAPACITY, LOAD_FACTOR, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, F>?): Boolean = size > maxEntries
    }

    public val size: Int get() = frames.size

    public fun update(messageId: String, frame: F) {
        frames[messageId] = frame
    }

    public fun update(newFrames: Map<String, F>) {
        newFrames.forEach { (id, frame) -> frames[id] = frame }
    }

    public fun frame(messageId: String): F? = frames[messageId]

    public fun removeFrame(messageId: String) {
        frames.remove(messageId)
    }

    /** L'ordre du plus ancien au plus récent, pour les témoins. */
    public fun ids(): List<String> = frames.keys.toList()

    public companion object {
        public const val DEFAULT_MAX_ENTRIES: Int = 200
        private const val INITIAL_CAPACITY = 16
        private const val LOAD_FACTOR = 0.75f
    }
}
