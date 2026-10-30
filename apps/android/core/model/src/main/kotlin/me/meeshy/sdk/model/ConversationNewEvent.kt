package me.meeshy.sdk.model

import kotlinx.serialization.Serializable

/**
 * `conversation:new` : une conversation vient d'être créée, ou vient de m'accueillir (ajout par un administrateur).
 * La passerelle l'adresse à la room personnelle de chaque participant (`participantIds`, créateur compris) ; un direct
 * encore vide reste silencieux pour l'autre côté. La charge est minimale : la fiche (mode de chiffrement, rôle,
 * effectif) se relit par `GET /conversations/:id`, jamais se devine d'ici.
 */
@Serializable
data class ConversationNewEvent(
    val conversationId: String,
    val conversationType: String? = null,
    val title: String? = null,
    val creatorId: String? = null,
    val participantIds: List<String> = emptyList(),
    val createdAt: String? = null,
) {
    /**
     * Cette annonce regarde-t-elle le compte [accountId] ? Fail-closed : un compte inconnu, ou une liste qui ne
     * le nomme pas, ne concerne PERSONNE. Une trame retardée d'un compte précédent ne lit ni n'écrit rien.
     */
    fun concerns(accountId: String?): Boolean =
        !accountId.isNullOrEmpty() && accountId in participantIds
}
