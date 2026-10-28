package me.meeshy.app.chat

import me.meeshy.sdk.model.share.ShareDelivery
import me.meeshy.sdk.model.share.SharePlan
import me.meeshy.sdk.model.share.ShareRecipient
import me.meeshy.sdk.model.share.ShareRecipientListing
import me.meeshy.sdk.model.share.ShareRecipientSections
import me.meeshy.sdk.model.share.ShareServed

/**
 * Ce que la feuille de partage unique DESSINE (#13469, #13477) — une seule forme pour toutes les portes :
 * la porte « message » du fil et l'hôte d'application (story, post, réel, profil, lien, autre app) la
 * produisent, la vue ne connaît ni l'un ni l'autre. Le plan décide de ce qui est offert ; ce modèle ne
 * relit aucun drapeau de protection.
 */
internal data class ShareSheetModel(
    val plan: SharePlan?,
    /** Les messages source du fil (porte « message ») : « Ce qui part · N sur M ». 0 hors porte message. */
    val sourceMessageCount: Int = 0,
    /** Ce qui part quand ce n'est pas un message : le texte, le lien, le titre d'une carte, le nom des fichiers. */
    val contentLines: List<String> = emptyList(),
    val caption: String = "",
    val chosenDurationSeconds: Int? = null,
    val query: String = "",
    val sections: ShareRecipientSections = ShareRecipientSections(emptyList(), emptyList(), emptyList()),
    val selectedIds: Set<String> = emptySet(),
    val deliveries: Map<String, ShareDelivery> = emptyMap(),
    val firstServed: ShareServed? = null,
    val isOffline: Boolean = false,
    /** Cache vide, première ouverture : le seul cas où un squelette est permis. */
    val isLoading: Boolean = false,
    val recipientLimitExceeded: Boolean = false,
    /** Un partage entrant à froid : la session se restaure (chargement) ou n'existe pas (rien ne part). */
    val isSessionLoading: Boolean = false,
    val isSignedOut: Boolean = false,
    /** Le lien du contenu (carte, lien, adresse reçue) : « Copier le lien », quand le plan l'offre. */
    val copyableLink: String? = null,
    /** Le texte qui part hors de Meeshy (« Partager hors de Meeshy »), quand le plan l'offre. */
    val shareOutText: String? = null,
)

internal fun ForwardTarget.toRecipient(): ShareRecipient = ShareRecipient.conversation(
    conversationId = conversationId,
    title = title,
    detail = if (isDirect) ShareRecipient.Detail.Direct else ShareRecipient.Detail.Group(memberCount),
    avatarUrl = avatar,
    accentHex = accentHex,
    peerUserId = peerUserId,
)

/** La porte « message » du fil vue par la feuille unique : ses cibles sont des conversations, récents en tête. */
internal fun ForwardUiState.toSheetModel(): ShareSheetModel {
    val conversations = targets.map { it.toRecipient() }
    val selected = selectedConversationIds.map { "conv:$it" }.toSet()
    val servedFirst = selectedConversationIds.firstOrNull { deliveries[it].let { d -> d == ShareDelivery.Sent || d == ShareDelivery.Queued } }
    return ShareSheetModel(
        plan = plan,
        sourceMessageCount = 1 + additionalSourceMessageIds.size,
        caption = caption,
        chosenDurationSeconds = chosenDurationSeconds,
        query = query,
        sections = ShareRecipientListing.of(conversations, emptyList(), query),
        selectedIds = selected,
        deliveries = deliveries.mapKeys { (key, _) -> "conv:$key" },
        firstServed = servedFirst?.let { id -> conversations.firstOrNull { it.conversationId == id }?.let { ShareServed(it, id) } },
        recipientLimitExceeded = (plan?.limits?.overRecipients ?: 0) > 0,
    )
}
