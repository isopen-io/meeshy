package me.meeshy.sdk.model.call

import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.interlocutor
import me.meeshy.sdk.model.isDirect
import java.net.URI
import java.net.URLDecoder

/**
 * **Le lien d'appel DEMANDE, il ne compose pas** — miroir de `DeepLinkParser` (`case "call" where customScheme`),
 * `CallLinkTarget` et `CallLinkConfirmationController` (iOS, `Features/Contacts/CallLinkConfirmation.swift`, #13465).
 *
 * `meeshy://call?contactId=…&type=…` composait directement : n'importe quelle app, un QR code ou une page web faisait
 * passer un appel vidéo, caméra et micro ouverts, sans le moindre geste. Il devient une DEMANDE : la racine présente
 * « Appeler @x en vidéo ? », et seul « Appeler » compose. Un contact inconnu, une conversation de groupe ou un contact
 * bloqué donnent un refus propre.
 */
data class CallLinkRequest(val conversationId: String, val isVideo: Boolean) {
    companion object {
        private const val SCHEME = "meeshy"
        private const val HOST = "call"
        private const val VIDEO = "video"

        /**
         * Le schéma `meeshy://` SEUL (un lien web ne compose pas d'appel : l'App Link ne revendique pas `/call`), l'hôte
         * `call` nu — ni identifiants, ni port, ni chemin —, et un `contactId` non vide. `contactId` est l'identifiant de
         * la CONVERSATION, comme sur iOS. Une adresse illisible n'ouvre rien et ne lève rien.
         */
        fun parse(dataUri: String?): CallLinkRequest? {
            val uri = dataUri?.let { runCatching { URI(it) }.getOrNull() } ?: return null
            if (!uri.scheme.equals(SCHEME, ignoreCase = true)) return null
            if (uri.rawAuthority != HOST || uri.rawPath.orEmpty().isNotEmpty()) return null
            val query = uri.rawQuery.orEmpty().split('&').mapNotNull(::pair).toMap()
            val conversationId = query["contactId"]?.trim()?.takeIf { it.isNotEmpty() } ?: return null
            return CallLinkRequest(conversationId, isVideo = query["type"] == VIDEO)
        }

        private fun pair(raw: String): Pair<String, String>? {
            val separator = raw.indexOf('=').takeIf { it > 0 } ?: return null
            val value = runCatching { URLDecoder.decode(raw.substring(separator + 1).replace("+", "%2B"), "UTF-8") }.getOrNull()
            return value?.let { raw.substring(0, separator) to it }
        }
    }
}

/**
 * Ce que la feuille montre, et EXACTEMENT ce que « Appeler » composera : valeur figée à l'affichage — contact résolu,
 * mode, compte connecté. Rien n'est relu depuis un état mutable au moment du geste.
 */
data class CallLinkTarget(
    val conversationId: String,
    val userId: String,
    val displayName: String,
    val username: String?,
    val avatarUrl: String?,
    val isVideo: Boolean,
    /** Le compte connecté quand la feuille s'est affichée. */
    val accountId: String?,
    /** Une confirmation = un jeton : deux liens identiques donnent deux feuilles distinctes, et un geste sur l'ancienne ne vaut jamais pour la nouvelle. */
    val token: Long = 0,
) {
    /** `@pseudo` quand on le connaît, le nom sinon. */
    val handle: String get() = username?.takeIf { it.isNotEmpty() }?.let { "@$it" } ?: displayName
}

sealed interface CallLinkVerdict {
    data class Confirm(val target: CallLinkTarget) : CallLinkVerdict

    /** Conversation absente, inaccessible, ou qui n'est pas un échange à deux. */
    data object UnknownContact : CallLinkVerdict

    data object Blocked : CallLinkVerdict
}

object CallLinkRule {

    /** Résout la demande contre la conversation lue ; [isBlocked] est la liste de blocage du compte connecté. */
    fun resolve(
        request: CallLinkRequest,
        conversation: ApiConversation?,
        readerId: String?,
        isBlocked: (userId: String) -> Boolean,
    ): CallLinkVerdict {
        val peer = conversation?.takeIf { it.isDirect }?.interlocutor(readerId) ?: return CallLinkVerdict.UnknownContact
        if (isBlocked(peer.userId)) return CallLinkVerdict.Blocked
        return CallLinkVerdict.Confirm(
            CallLinkTarget(
                conversationId = request.conversationId,
                userId = peer.userId,
                displayName = peer.name ?: peer.userId,
                username = peer.username,
                avatarUrl = peer.avatarUrl,
                isVideo = request.isVideo,
                accountId = readerId,
            ),
        )
    }

    /** Le geste « Appeler » compose la cible montrée, et seulement si ni le compte ni le blocage n'ont changé depuis. */
    fun mayDial(shown: CallLinkTarget, accountNow: String?, isBlocked: Boolean): Boolean =
        accountNow != null && accountNow == shown.accountId && !isBlocked
}
