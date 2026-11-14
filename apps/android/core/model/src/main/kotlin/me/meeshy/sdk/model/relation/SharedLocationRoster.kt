package me.meeshy.sdk.model.relation

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/**
 * À qui je montre ma position, à quelle précision et jusqu'à quand (#16985), iso `SharedLocationRoster.swift` (#16983).
 * Le serveur ne connaît qu'UN partage, dont la durée vaut pour toute la liste (1 h ou 8 h) ; la liste garde l'échéance
 * choisie pour CHAQUE personne, et le centre retire la personne du partage serveur à SON échéance. Le terme serveur
 * n'est jamais plus court que la plus lointaine des échéances, et c'est lui qui coupe tout si l'appareil se tait.
 *
 * Ce qui en est gardé sur l'appareil ([stored]) : des identifiants, des précisions et des échéances, jamais une position.
 */
public class SharedLocationRoster private constructor(private val entries: Map<String, Entry>) {

    public data class Entry(val precision: SharedLocationPrecision, val untilMillis: Long)

    public val isEmpty: Boolean get() = entries.isEmpty()

    public fun entry(userId: String): Entry? = entries[userId.lowercase()]

    /** Ajouter une personne, ou changer sa précision et son échéance : `now + durée`. */
    public fun adding(
        userId: String,
        precision: SharedLocationPrecision,
        duration: SharedLocationShareDuration,
        nowMillis: Long,
    ): SharedLocationRoster = SharedLocationRoster(entries + (userId.lowercase() to Entry(precision, nowMillis + duration.millis)))

    public fun removing(userId: String): SharedLocationRoster = SharedLocationRoster(entries - userId.lowercase())

    /** Sans ceux dont l'échéance est passée. */
    public fun pruned(nowMillis: Long): SharedLocationRoster =
        SharedLocationRoster(entries.filterValues { it.untilMillis > nowMillis })

    /** La plus proche des échéances : le moment où la liste change d'elle-même. */
    public val nextDeadlineMillis: Long? get() = entries.values.minOfOrNull { it.untilMillis }

    /** La durée à demander au serveur : la plus courte qui couvre la plus lointaine des échéances. */
    public fun serverDuration(nowMillis: Long): SharedLocationShareDuration {
        val farthest = entries.values.maxOfOrNull { it.untilMillis } ?: nowMillis
        return if (farthest - nowMillis <= SharedLocationShareDuration.ONE_HOUR.millis) {
            SharedLocationShareDuration.ONE_HOUR
        } else {
            SharedLocationShareDuration.EIGHT_HOURS
        }
    }

    /** La liste telle que le serveur la reçoit, dans un ordre stable. */
    public val recipients: List<SharedLocationRecipient>
        get() = entries.keys.sorted().map { SharedLocationRecipient(it, entries.getValue(it).precision) }

    public fun stored(): String = codec.encodeToString(
        StoredRoster.serializer(),
        StoredRoster(entries.mapValues { (_, entry) -> StoredEntry(entry.precision.wire, entry.untilMillis) }),
    )

    override fun equals(other: Any?): Boolean = other is SharedLocationRoster && entries == other.entries

    override fun hashCode(): Int = entries.hashCode()

    override fun toString(): String = "SharedLocationRoster($entries)"

    @Serializable
    private data class StoredEntry(val precision: String? = null, val untilMillis: Long)

    @Serializable
    private data class StoredRoster(val entries: Map<String, StoredEntry> = emptyMap())

    public companion object {
        public val EMPTY: SharedLocationRoster = SharedLocationRoster(emptyMap())

        private val codec = Json { ignoreUnknownKeys = true }

        /** Une liste illisible se relit vide ; une précision inconnue se relit comme la ville, jamais plus ouverte. */
        public fun fromStored(raw: String?): SharedLocationRoster {
            val stored = raw?.let { runCatching { codec.decodeFromString(StoredRoster.serializer(), it) }.getOrNull() } ?: return EMPTY
            return SharedLocationRoster(
                stored.entries.mapKeys { it.key.lowercase() }.mapValues { (_, entry) ->
                    Entry(SharedLocationPrecision.of(entry.precision) ?: SharedLocationPrecision.CITY, entry.untilMillis)
                },
            )
        }
    }
}
