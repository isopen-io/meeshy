package me.meeshy.sdk.model.relation

/**
 * Ce que montrait le partage quand « Montrer ta position réelle ? » a été posée (#20248, iso
 * `SharedLocationPointReplacement.swift` #20127 et `shared-location-point-replacement.ts` du web) : son démarrage servi et
 * ceux qui voient le point choisi. La confirmation ne vaut que pour CE partage-là : un autre démarrage, ou une personne
 * ajoutée depuis (un autre appareil du compte), et la question se repose avec la liste à jour. Une personne sortie entre
 * la question et la réponse ne la rend pas caduque : elle ne verra rien du tout.
 */
public class SharedLocationPointReplacement(public val startedAt: String?, recipientIds: Set<String>) {
    public val recipientIds: Set<String> = recipientIds.map { it.lowercase() }.toSet()

    /** Une réponse donnée à [asked] vaut-elle encore devant ce partage-ci ? */
    public fun isCoveredBy(asked: SharedLocationPointReplacement): Boolean =
        startedAt == asked.startedAt && asked.recipientIds.containsAll(recipientIds)

    /** Ceux que la question nomme, et combien d'autres elle compte. */
    public data class Audience(val named: List<String>, val others: Int)

    /**
     * Ceux que la question nomme : au plus [limit], dans l'ordre des noms connus, chacun une fois ; les autres, inconnus
     * d'ici compris (ajoutés depuis un autre appareil), se comptent. Un nom vide ne se nomme pas.
     */
    public fun audience(knownNames: List<Pair<String, String>>, limit: Int = 3): Audience {
        val named = knownNames
            .map { (id, name) -> id.lowercase() to name.trim() }
            .filter { (id, name) -> id in recipientIds && name.isNotEmpty() }
            .distinctBy { it.first }
            .take(limit)
            .map { it.second }
        return Audience(named, recipientIds.size - named.size)
    }

    override fun equals(other: Any?): Boolean =
        other is SharedLocationPointReplacement && startedAt == other.startedAt && recipientIds == other.recipientIds

    override fun hashCode(): Int = 31 * startedAt.hashCode() + recipientIds.hashCode()

    override fun toString(): String = "SharedLocationPointReplacement($startedAt, $recipientIds)"
}

/** La question à poser devant le point choisi que cette liste montre, depuis ce démarrage servi. */
public fun SharedLocationRoster.pointReplacement(startedAt: String?): SharedLocationPointReplacement =
    SharedLocationPointReplacement(startedAt, recipients.map { it.userId }.toSet())
