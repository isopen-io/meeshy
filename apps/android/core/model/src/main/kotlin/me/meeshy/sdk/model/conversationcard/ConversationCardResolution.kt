package me.meeshy.sdk.model.conversationcard

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import me.meeshy.sdk.model.deeplink.ConversationCardTarget

/**
 * Le verdict d'une résolution de carte, CACHÉ tel quel : une carte privée ou indisponible se relit
 * sans rappel réseau au défilement (iOS `ConversationCardResolution`).
 */
@Serializable
sealed interface ConversationCardResolution {
    @Serializable
    @SerialName("card")
    data class Card(val card: ConversationCard) : ConversationCardResolution

    /** Lien DIRECT refusé (403/404) : non-membre ou conversation inexistante — indistinguables, rien du titre ne fuit. */
    @Serializable
    @SerialName("private")
    data object PrivateConversation : ConversationCardResolution

    /** Serveur sans la route, lien inconnu : la bulle retombe sur l'aperçu de lien générique. */
    @Serializable
    @SerialName("unavailable")
    data object Unavailable : ConversationCardResolution

    companion object {
        /**
         * Un refus du serveur (4xx) est un VERDICT, qui se cache ; une panne (réseau, 5xx) n'en est
         * pas un (`null`). Sur un lien direct, 403 et 404 disent la même chose : « pas pour toi ».
         */
        fun definitiveVerdict(httpStatus: Int?, target: ConversationCardTarget): ConversationCardResolution? {
            if (httpStatus == null || httpStatus !in 400..499) return null
            val refusesDirect = target is ConversationCardTarget.Direct && (httpStatus == 403 || httpStatus == 404)
            return if (refusesDirect) PrivateConversation else Unavailable
        }
    }
}
