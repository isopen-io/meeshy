package me.meeshy.sdk.conversation

import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.net.ApiError

/**
 * Ce que rend le résolveur UNIQUE de « la conversation directe avec cette personne »
 * ([ConversationRepository.directConversationWith], miroir de `DirectConversationResolver`
 * iOS, #11615) : la réponse à une story, à une humeur et le bouton Message d'un profil
 * l'appellent tous, et deux gestes différents ne choisissent donc jamais deux conversations
 * pour un même auteur.
 */
sealed interface DirectConversationResolution {

    /** Un direct existait déjà — [fromCache] dit s'il a été lu du cache local (hors ligne compris). */
    data class Found(val conversation: ApiConversation, val fromCache: Boolean) : DirectConversationResolution

    /** Aucun direct n'existait : celui-ci vient d'être créé. */
    data class Created(val conversation: ApiConversation) : DirectConversationResolution

    /** Hors ligne et rien en cache : la création a été mise en file, le direct s'ouvrira au retour du réseau. */
    data class Queued(val userId: String) : DirectConversationResolution

    /** Ni trouvé, ni créé, ni mis en file. [offline] distingue l'absence de réseau d'un refus du serveur. */
    data class Failed(val error: ApiError, val offline: Boolean) : DirectConversationResolution
}

/** La conversation à ouvrir, quand le résolveur en a une. */
val DirectConversationResolution.conversationOrNull: ApiConversation?
    get() = when (this) {
        is DirectConversationResolution.Found -> conversation
        is DirectConversationResolution.Created -> conversation
        is DirectConversationResolution.Queued, is DirectConversationResolution.Failed -> null
    }

/**
 * Couture de la file hors ligne : met en file la création d'un direct avec [userId] quand le
 * réseau manque. Rend `true` quand la création est bien mise en file.
 *
 * Inerte tant qu'aucune implémentation n'est passée au résolveur : la valeur d'outbox
 * correspondante appartient au lot des actions de conversation hors ligne
 * (`persist-outbox-kinds-compte-amis-conversations`), qui branchera sa file ici.
 */
fun interface DirectCreationQueue {
    suspend fun enqueue(userId: String): Boolean
}
