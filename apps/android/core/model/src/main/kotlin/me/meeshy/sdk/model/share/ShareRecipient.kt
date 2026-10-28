package me.meeshy.sdk.model.share

import java.text.Normalizer

/**
 * **Un destinataire de l'écran de partage** (#13469) — une conversation existante, ou une
 * personne sans conversation encore ouverte. Miroir de `ShareRecipient` (iOS). L'identifiant est
 * une clé d'état stable : `conv:<id>`, `user:<id>`.
 *
 * Aucune présence ici : elle se lit, par rangée, sur la carte unique servie par la passerelle
 * (règle de visibilité : amis acceptés seulement) — le destinataire ne la fabrique ni ne la garde.
 */
data class ShareRecipient(
    val id: String,
    val kind: Kind,
    val conversationId: String?,
    val userId: String?,
    val title: String,
    val detail: Detail,
    val avatarUrl: String? = null,
    val accentHex: String? = null,
) {
    enum class Kind { CONVERSATION, PERSON }

    /** Ce que la ligne dit sous le nom — composé en mots par la vue, jamais ici. */
    sealed interface Detail {
        data object Direct : Detail
        data class Group(val members: Int) : Detail
        data object FriendWithoutConversation : Detail
        data class Handle(val handle: String) : Detail
    }

    val isGroup: Boolean get() = detail is Detail.Group

    /** Une conversation chiffrée de bout en bout n'est jamais proposée (Android ne chiffre pas encore, #13015). */
    val destination: ShareDestination get() = ShareDestination(id = id, encrypted = false)

    companion object {
        fun conversation(
            conversationId: String,
            title: String,
            detail: Detail,
            avatarUrl: String?,
            accentHex: String?,
            peerUserId: String?,
        ) = ShareRecipient("conv:$conversationId", Kind.CONVERSATION, conversationId, peerUserId, title, detail, avatarUrl, accentHex)

        fun person(userId: String, title: String, detail: Detail, avatarUrl: String?) =
            ShareRecipient("user:$userId", Kind.PERSON, null, userId, title, detail, avatarUrl)
    }
}

/** La fusion et le filtre des destinataires — une personne n'apparaît jamais deux fois. */
object ShareRecipientMerge {

    /**
     * Ordre : conversations (dans l'ordre reçu), puis personnes non absorbées. Une personne dont
     * la conversation directe est déjà listée est ABSORBÉE par elle. Les ids sont dédoublonnés.
     */
    fun merge(conversations: List<ShareRecipient>, people: List<ShareRecipient>): List<ShareRecipient> {
        val seen = mutableSetOf<String>()
        val joined = mutableSetOf<String>()
        val kept = conversations.filter { recipient ->
            if (!seen.add(recipient.id)) return@filter false
            recipient.userId?.let(joined::add)
            true
        }
        val others = people.filter { person ->
            if (!seen.add(person.id)) return@filter false
            person.userId?.let { it !in joined } ?: true
        }
        return kept + others
    }

    /** Un filtre local sur le nom, insensible à la casse et aux accents. */
    fun matching(recipients: List<ShareRecipient>, query: String): List<ShareRecipient> {
        val needle = fold(query.trim())
        if (needle.isEmpty()) return recipients
        return recipients.filter { fold(it.title).contains(needle) }
    }

    private fun fold(text: String): String =
        Normalizer.normalize(text, Normalizer.Form.NFD).replace(Regex("\\p{Mn}+"), "").lowercase()
}
