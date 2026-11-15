package me.meeshy.sdk.e2ee.libsignal

import kotlinx.coroutines.flow.Flow
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.conversation.LocalMessage
import me.meeshy.sdk.model.MeeshyUser

/**
 * Ce que le fil d'une conversation chiffrée de bout en bout demande à l'E2EE (#14591) : envoyer un TEXTE scellé pour
 * chaque appareil de la directe, et relire au coffre le clair des messages qu'il affiche. Les pièces, les lieux et les
 * groupes ne se chiffrent pas encore sur Android (comme sur iOS, ils restent refusés et l'interface le dit).
 */
public interface EndToEndThreadAccess {

    /** Le texte part chiffré ; la bulle optimiste ne porte dans Room que le littéral `[Encrypted]`. Rend son `cid_`. */
    public suspend fun sendText(
        conversationId: String,
        peerUserId: String,
        text: String,
        language: String?,
        sender: MeeshyUser,
        replyToId: String?,
    ): String

    /**
     * Le fil projeté de [conversationId] : chaque message e2ee dont le coffre tient le clair À SA PLACE se rend lisible,
     * en mémoire (#14631) ; le clair d'un message supprimé, échu ou vu une fois quitte le coffre (#14633).
     */
    public fun overlay(conversationId: String, stream: Flow<CacheResult<List<LocalMessage>>>): Flow<CacheResult<List<LocalMessage>>>

    /**
     * « Supprimer pour moi » (#14655), purement local et irréversible : le clair de ces messages quitte le coffre, comme
     * le retrait pour moi d'iOS. Sans E2EE, rien à retirer.
     */
    public suspend fun forgetHiddenForMe(messageIds: Collection<String>) {}

    public companion object {
        /** Aucun E2EE : rien ne part, rien ne se projette (témoins, et tout hôte qui ne l'a pas). */
        public val None: EndToEndThreadAccess = object : EndToEndThreadAccess {
            override suspend fun sendText(
                conversationId: String,
                peerUserId: String,
                text: String,
                language: String?,
                sender: MeeshyUser,
                replyToId: String?,
            ): String = throw IllegalStateException("end-to-end encryption unavailable")

            override fun overlay(
                conversationId: String,
                stream: Flow<CacheResult<List<LocalMessage>>>,
            ): Flow<CacheResult<List<LocalMessage>>> = stream
        }
    }
}
