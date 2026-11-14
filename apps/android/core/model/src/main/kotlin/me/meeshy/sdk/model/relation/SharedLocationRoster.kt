package me.meeshy.sdk.model.relation

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/**
 * À qui je montre ma position, à quelle précision et jusqu'à quand (#16985), iso `SharedLocationRoster.swift` (#16983).
 * Le serveur ne connaît qu'UN partage, dont la durée vaut pour toute la liste (1 h ou 8 h) ; la liste garde l'échéance
 * choisie pour CHAQUE personne, et le centre retire la personne du partage serveur à SON échéance. Le terme serveur
 * n'est jamais plus court que la plus lointaine des échéances, et c'est lui qui coupe tout si l'appareil se tait.
 *
 * Un « Arrêter » qui n'a pas pu partir (hors ligne, accusé perdu) devient un RETRAIT EN ATTENTE (#18204), iso
 * `SharedLocationRoster.swift` : la personne sort de la liste, son identifiant reste gardé jusqu'à ce que le serveur ait
 * reçu une liste sans elle, au plus huit heures (aucun partage serveur ne court plus longtemps qu'un `start` de 8 h). Le
 * doigt ne se rejoue jamais : c'est le centre qui rejoue l'intention.
 *
 * Ce qui en est gardé sur l'appareil ([stored]) : des identifiants, des précisions et des échéances, jamais une position.
 */
public class SharedLocationRoster private constructor(
    private val entries: Map<String, Entry>,
    withdrawals: Map<String, Long> = emptyMap(),
) {
    /** Les personnes retirées que le serveur peut encore servir, et jusqu'à quand il le pourrait au plus. */
    private val withdrawals: Map<String, Long> = withdrawals.filterKeys { it !in entries }

    public data class Entry(val precision: SharedLocationPrecision, val untilMillis: Long)

    /** Rien à garder : personne à qui montrer ma position, aucun retrait à faire partir. */
    public val isEmpty: Boolean get() = entries.isEmpty() && withdrawals.isEmpty()

    /** Au moins une personne voit ma position : c'est seulement alors que l'appareil a des relevés à envoyer. */
    public val hasRecipients: Boolean get() = entries.isNotEmpty()

    /** Un retrait demandé que le serveur n'a pas encore reçu. */
    public val hasPendingWithdrawals: Boolean get() = withdrawals.isNotEmpty()

    public fun isWithdrawalPending(userId: String): Boolean = userId.lowercase() in withdrawals

    public fun entry(userId: String): Entry? = entries[userId.lowercase()]

    /** Ajouter une personne, ou changer sa précision et son échéance : `now + durée`. */
    public fun adding(
        userId: String,
        precision: SharedLocationPrecision,
        duration: SharedLocationShareDuration,
        nowMillis: Long,
    ): SharedLocationRoster =
        SharedLocationRoster(entries + (userId.lowercase() to Entry(precision, nowMillis + duration.millis)), withdrawals)

    public fun removing(userId: String): SharedLocationRoster = SharedLocationRoster(entries - userId.lowercase(), withdrawals)

    /**
     * « Arrêter » n'a pas pu partir : la personne sort de la liste et son retrait attend le réseau, au plus jusqu'au terme
     * le plus long qu'un partage serveur puisse avoir encore. Une personne absente de la liste ne change rien.
     */
    public fun withdrawing(userId: String, nowMillis: Long): SharedLocationRoster {
        val id = userId.lowercase()
        if (id !in entries) return this
        return SharedLocationRoster(entries - id, withdrawals + (id to nowMillis + SharedLocationShareDuration.EIGHT_HOURS.millis))
    }

    /** La liste que le serveur doit recevoir : la même, sans retrait en attente — l'envoyer les solde tous. */
    public fun settled(): SharedLocationRoster = SharedLocationRoster(entries)

    /**
     * Ceux de cette liste ET de [other], [other] l'emportant pour une même personne : quand on ne sait pas laquelle des
     * deux listes le serveur sert, on garde « Arrêter » pour toutes les personnes qu'il peut servir.
     */
    public fun union(other: SharedLocationRoster): SharedLocationRoster = SharedLocationRoster(
        entries + other.entries,
        (withdrawals.keys + other.withdrawals.keys).associateWith { maxOf(withdrawals[it] ?: 0L, other.withdrawals[it] ?: 0L) },
    )

    /** Sans ceux dont l'échéance est passée, ni les retraits que plus aucun partage serveur ne peut servir. */
    public fun pruned(nowMillis: Long): SharedLocationRoster = SharedLocationRoster(
        entries.filterValues { it.untilMillis > nowMillis },
        withdrawals.filterValues { it > nowMillis },
    )

    /** Ce que le serveur sert est-il exactement ce que je veux : aucune échéance passée, aucun retrait en attente ? */
    public fun isSettled(nowMillis: Long): Boolean = pruned(nowMillis).settled() == this

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
        StoredRoster(entries.mapValues { (_, entry) -> StoredEntry(entry.precision.wire, entry.untilMillis) }, withdrawals),
    )

    override fun equals(other: Any?): Boolean =
        other is SharedLocationRoster && entries == other.entries && withdrawals == other.withdrawals

    override fun hashCode(): Int = 31 * entries.hashCode() + withdrawals.hashCode()

    override fun toString(): String = "SharedLocationRoster($entries, withdrawals=${withdrawals.keys})"

    @Serializable
    private data class StoredEntry(val precision: String? = null, val untilMillis: Long)

    /** Une liste gardée avant #18204 n'a pas de retraits en attente. */
    @Serializable
    private data class StoredRoster(
        val entries: Map<String, StoredEntry> = emptyMap(),
        val withdrawals: Map<String, Long> = emptyMap(),
    )

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
                stored.withdrawals.mapKeys { it.key.lowercase() },
            )
        }
    }
}
