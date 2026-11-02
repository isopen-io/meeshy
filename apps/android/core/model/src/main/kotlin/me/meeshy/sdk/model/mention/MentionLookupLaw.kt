package me.meeshy.sdk.model.mention

import me.meeshy.sdk.model.MentionCandidate

/** Où la liste « @ » cherche pour une saisie donnée : le cache local seul, ou le réseau en plus. */
enum class MentionLookupStage { LOCAL, REMOTE }

/**
 * La loi de déclenchement de la mention (#14053, directive porteur 2026-10-31) — miroir de
 * `mentionLookupStage` et `mergeMentionSuggestions` (`packages/shared/utils/mention-lookup.ts`),
 * que le web consomme et dont iOS porte `MentionLookupRule` :
 *
 * - « @ » ouvre TOUJOURS d'abord le cache local de contacts, filtré par la saisie ;
 * - le réseau n'est appelé qu'à partir du TROISIÈME caractère, pour faire remonter les autres
 *   personnes du contexte ;
 * - sauf si les deux premières lettres ne trouvent personne en local : le réseau part alors dès
 *   la SECONDE lettre.
 *
 * La liste servie met les correspondances locales d'abord, puis le serveur dans SON ordre
 * (connaissances, contexte, contacts, annuaire), sans doublon et sans l'appelant.
 */
object MentionLookupLaw {

    const val REMOTE_MIN_CHARS: Int = 3
    const val REMOTE_EARLY_CHARS: Int = 2

    fun stage(query: String, localMatchCount: Int): MentionLookupStage {
        val length = query.trim().length
        if (length >= REMOTE_MIN_CHARS) return MentionLookupStage.REMOTE
        if (length == REMOTE_EARLY_CHARS && localMatchCount == 0) return MentionLookupStage.REMOTE
        return MentionLookupStage.LOCAL
    }

    fun <T> merge(local: List<T>, remote: List<T>, selfId: String?, id: (T) -> String): List<T> =
        (local + remote).fold(emptyList()) { kept, candidate ->
            val key = id(candidate)
            if (key == selfId || kept.any { id(it) == key }) kept else kept + candidate
        }

    /**
     * [merge] appliquée aux candidats : un pseudo vide ne s'adresse pas, et un même pseudo
     * (casse et espaces ignorées) ne s'offre qu'une fois — le premier venu, donc le local, gagne.
     */
    fun mergeCandidates(
        local: List<MentionCandidate>,
        remote: List<MentionCandidate>,
        selfId: String?,
    ): List<MentionCandidate> =
        merge(local, remote, selfId) { it.id }.fold(emptyList()) { kept, candidate ->
            val handle = candidate.handleKey()
            if (handle.isEmpty() || kept.any { it.handleKey() == handle }) kept else kept + candidate
        }

    /** Le filtre de la saisie : sous-chaîne, sans casse, du pseudo OU du nom affiché ; vide ⇒ tout le monde. */
    fun filter(candidates: List<MentionCandidate>, query: String): List<MentionCandidate> {
        val needle = query.trim().lowercase()
        if (needle.isEmpty()) return candidates
        return candidates.filter {
            it.username.lowercase().contains(needle) || it.displayName.lowercase().contains(needle)
        }
    }

    /**
     * Ce que le cache local sert, instantanément, pour [query] : les [contacts] (amis acceptés)
     * d'abord, puis les personnes du [context] (membres, intervenants). Une portée fermée
     * ([MentionableScope.INTERLOCUTOR], [MentionableScope.MEMBERS]) ne propose que les personnes
     * du contexte, les contacts parmi eux en tête : la passerelle ignorerait à l'envoi la mention
     * de quelqu'un d'autre, et une suggestion sans effet n'est pas affichée (#14071). Sans portée
     * (`null` : type inconnu), personne.
     */
    fun localMatches(
        contacts: List<MentionCandidate>,
        context: List<MentionCandidate>,
        query: String,
        selfId: String?,
        scope: MentionableScope?,
    ): List<MentionCandidate> {
        if (scope == null) return emptyList()
        val pool = if (scope != MentionableScope.DIRECTORY) {
            val contactIds = contacts.map { it.id }.toSet()
            val (known, others) = context.partition { it.id in contactIds }
            known + others
        } else {
            contacts + context
        }
        return mergeCandidates(filter(pool, query), emptyList(), selfId)
    }

    /**
     * Les personnes du contexte que la liste peut proposer (#14183) : le roster SERVI (participants
     * actifs), jamais les auteurs du fil — partis peut-être, ils seraient proposés puis ignorés.
     * Sauf pour un INVITÉ de lien : la passerelle ne lui sert que sa propre ligne (#10205), et les
     * auteurs du fil qu'elle lui a servis sont alors ses membres connus — miroir de web et iOS.
     */
    fun knownRoster(
        roster: List<MentionCandidate>,
        threadAuthors: List<MentionCandidate>,
        isGuest: Boolean,
    ): List<MentionCandidate> =
        if (isGuest) merge(roster, threadAuthors, selfId = null) { it.id } else roster

    private fun MentionCandidate.handleKey(): String = username.trim().lowercase()
}
