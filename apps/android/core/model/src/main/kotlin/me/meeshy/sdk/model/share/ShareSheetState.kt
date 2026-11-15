package me.meeshy.sdk.model.share

/** Le destinataire servi en premier et la conversation où il l'a été. */
data class ShareServed(val recipient: ShareRecipient, val conversationId: String)

/** Où en est l'envoi vers UN destinataire (V6). */
sealed interface ShareDelivery {
    data object Sending : ShareDelivery

    data object Sent : ShareDelivery

    /** Hors ligne : dans la file durable, partira au retour du réseau. */
    data object Queued : ShareDelivery

    data class Failed(val reason: ShareFailure) : ShareDelivery
}

/** Pourquoi un envoi ne part pas — la vue le DIT avec ses mots, jamais un texte serveur brut. */
enum class ShareFailure {
    /** Aucun contenu à emporter pour ce destinataire (pièce introuvable, source non synchronisée). */
    NOTHING_TO_SEND,

    /** Une source chiffrée de bout en bout ne se copie pas : Android ne la déchiffre pas encore. */
    SEALED_SOURCE,

    /** Le destinataire est chiffré de bout en bout : Android n'y envoie rien (fail-closed). */
    SEALED_DESTINATION,

    /** La personne n'a pas de conversation et la création exige le réseau. */
    UNREACHABLE,

    GENERIC,
}

/**
 * **L'état de la feuille de partage unique** (#13469) — pur, immuable : chaque geste rend un nouvel
 * état. Le plan ([SharePlanner]) se relit toujours depuis l'entrée et la sélection ; cet état ne
 * relit aucun drapeau de protection.
 */
data class ShareSheetState(
    val selection: List<ShareRecipient> = emptyList(),
    val removedMessageIds: Set<String> = emptySet(),
    val query: String = "",
    val caption: String = "",
    val grouping: ShareGrouping = ShareGrouping.TOGETHER,
    val chosenDurationSeconds: Int? = null,
    val deliveries: Map<String, ShareDelivery> = emptyMap(),
    /** La première destination servie : la confirmation « Envoyé à X · Ouvrir » (D5). */
    val firstServed: ShareServed? = null,
) {
    val hasSent: Boolean get() = deliveries.values.any { it != ShareDelivery.Sending }

    val isSending: Boolean get() = deliveries.values.any { it == ShareDelivery.Sending }

    fun isSelected(recipient: ShareRecipient): Boolean = selection.any { it.id == recipient.id }

    /** Toucher une rangée la coche ; la retoucher la décoche. Une rangée déjà servie est inerte. */
    fun toggled(recipient: ShareRecipient): ShareSheetState = when {
        deliveries[recipient.id].let { it != null && it !is ShareDelivery.Failed } -> this
        isSelected(recipient) -> copy(selection = selection.filterNot { it.id == recipient.id })
        else -> copy(selection = selection + recipient)
    }

    fun removingMessage(id: String): ShareSheetState = copy(removedMessageIds = removedMessageIds + id)

    fun withCaption(text: String): ShareSheetState = copy(caption = text.take(ShareLimits.MAX_CAPTION_LENGTH))

    fun withQuery(text: String): ShareSheetState = copy(query = text)

    fun withDelivery(recipientId: String, state: ShareDelivery): ShareSheetState = copy(deliveries = deliveries + (recipientId to state))

    /**
     * Un destinataire est servi : sa rangée passe à « envoyé » (ou « en file » hors ligne), et le premier
     * servi nomme la confirmation. [conversationId] est la conversation où le message est vraiment parti
     * (la directe qu'un envoi vers une personne vient d'ouvrir).
     */
    fun served(recipient: ShareRecipient, conversationId: String, queued: Boolean): ShareSheetState = copy(
        deliveries = deliveries + (recipient.id to if (queued) ShareDelivery.Queued else ShareDelivery.Sent),
        firstServed = firstServed ?: ShareServed(recipient, conversationId),
    )

    /** La durée choisie ne dépasse jamais celle de la flamme source (D8). */
    fun withDuration(seconds: Int?, plan: SharePlan): ShareSheetState {
        val bound = plan.flameMaxDurationSeconds
        return copy(chosenDurationSeconds = if (seconds != null && bound != null) minOf(seconds, bound) else seconds)
    }

    /** Les destinataires à servir : cochés et pas encore servis (un échec se retente). */
    val pending: List<ShareRecipient>
        get() = selection.filter { val d = deliveries[it.id]; d == null || d is ShareDelivery.Failed }

    companion object {
        /** Ceux que la feuille propose d'emblée : les plus récents, hors la source (D6). */
        const val RECENTS_COUNT = 8
        const val SEARCH_MINIMUM_LENGTH = 2
    }
}
