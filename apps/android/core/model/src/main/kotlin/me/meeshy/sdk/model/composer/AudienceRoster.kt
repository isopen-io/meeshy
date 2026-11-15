package me.meeshy.sdk.model.composer

/** Une personne proposée par le sélecteur d'audience : l'identité minimale, jamais une présence. */
data class AudienceCandidate(
    val id: String,
    val username: String,
    val displayName: String? = null,
    val avatar: String? = null,
) {
    val label: String get() = displayName?.trim()?.takeIf { it.isNotEmpty() } ?: username
}

/**
 * Le tableau des personnes que l'auteur peut cibler — miroir du `AudienceUserPickerViewModel`
 * (iOS) : les contacts du cache d'abord (instantanés), complétés par la recherche d'annuaire.
 * Soi et les personnes bloquées n'y figurent JAMAIS, quelle que soit la source.
 */
object AudienceRoster {

    fun contacts(friends: List<AudienceCandidate>, selfId: String?, blocked: Set<String>): List<AudienceCandidate> =
        friends.filter { it.id != selfId && it.id !in blocked }.distinctBy { it.id }

    fun filterLocal(contacts: List<AudienceCandidate>, query: String): List<AudienceCandidate> {
        val needle = query.trim()
        if (needle.isEmpty()) return contacts
        return contacts.filter {
            it.label.contains(needle, ignoreCase = true) || it.username.contains(needle, ignoreCase = true)
        }
    }

    fun merge(
        local: List<AudienceCandidate>,
        remote: List<AudienceCandidate>,
        selfId: String?,
        blocked: Set<String>,
    ): List<AudienceCandidate> =
        (local + remote).filter { it.id != selfId && it.id !in blocked }.distinctBy { it.id }

    /** Ajoute [id] à la fin, ou le retire s'il y est ; au plafond, un ajout est refusé sans bruit. */
    fun toggle(selected: List<String>, id: String): List<String> = when {
        id in selected -> selected - id
        selected.size >= ComposerAudienceSelection.MAX_USERS -> selected
        else -> selected + id
    }
}
