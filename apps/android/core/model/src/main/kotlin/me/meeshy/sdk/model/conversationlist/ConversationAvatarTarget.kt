package me.meeshy.sdk.model.conversationlist

import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.interlocutor
import me.meeshy.sdk.model.isDirectConversationType

/** La sorte de participant que la passerelle sert pour un invité sans compte (`ParticipantType`). */
private const val ANONYMOUS_PARTICIPANT_TYPE: String = "anonymous"

/**
 * Ce qu'ouvre le toucher de l'avatar d'une ligne — miroir de `ConversationAvatarTarget.swift` (#15887).
 *
 * Le profil du pair d'une directe, quand il existe et qu'on peut le montrer ; les détails de la
 * conversation dans tous les autres cas. Jamais rien : un avatar qu'on touche sans effet est un geste
 * mort. L'anonyme, le pair bloqué et le compte fermé (#15717) n'ont pas de profil à montrer — la fiche
 * resterait vide, ou montrerait ce que le blocage et la fermeture retirent.
 */
sealed interface ConversationAvatarTarget {
    data class Profile(val userId: String) : ConversationAvatarTarget

    data object ConversationInfo : ConversationAvatarTarget

    val opensProfile: Boolean get() = this is Profile

    companion object {
        fun resolve(
            type: String?,
            peerUserId: String?,
            peerBlocked: Boolean,
            peerAccountClosed: Boolean,
            peerAnonymous: Boolean = false,
        ): ConversationAvatarTarget {
            val shown = isDirectConversationType(type) && !peerBlocked && !peerAccountClosed && !peerAnonymous
            val userId = peerUserId?.takeIf { shown && it.isNotEmpty() } ?: return ConversationInfo
            return Profile(userId)
        }
    }
}

/**
 * La cible du toucher d'avatar de CETTE ligne, pour le lecteur [readerId] : le pair est celui de l'unique
 * élection [interlocutor] (le nom, l'anneau et l'humeur de la ligne viennent de la même). Le blocage n'est
 * pas porté par la conversation : l'appelant le lit au toucher.
 */
fun ApiConversation.avatarTarget(readerId: String?, isPeerBlocked: Boolean): ConversationAvatarTarget {
    val peer = interlocutor(readerId)
    return ConversationAvatarTarget.resolve(
        type = type,
        peerUserId = peer?.userId,
        peerBlocked = isPeerBlocked,
        peerAccountClosed = peer?.participant?.accountClosed == true,
        peerAnonymous = peer?.participant?.type == ANONYMOUS_PARTICIPANT_TYPE,
    )
}

/**
 * Ce que devient le toucher de l'avatar d'une ligne — miroir de iOS `ConversationAvatarRoute` : le profil
 * du pair, les détails de la conversation, ou — verrouillée, quel que soit son type — la porte du code
 * PUIS les détails. Un profil ne contourne pas le verrou ; le fil n'est jamais la destination.
 */
sealed interface ConversationAvatarRoute {
    data class Profile(val userId: String) : ConversationAvatarRoute

    data object Info : ConversationAvatarRoute

    data object UnlockThenInfo : ConversationAvatarRoute

    val opensProfile: Boolean get() = this is Profile

    companion object {
        fun route(target: ConversationAvatarTarget, isLocked: Boolean): ConversationAvatarRoute = when {
            isLocked -> UnlockThenInfo
            target is ConversationAvatarTarget.Profile -> Profile(target.userId)
            else -> Info
        }
    }
}
