package me.meeshy.sdk.model.guest

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/**
 * Pourquoi la passerelle a termine la session d'un invite de lien — la loi UNIQUE qui lit ces refus (miroir de iOS
 * `GuestSessionEnd`). Retenter l'un ou l'autre ne peut pas aboutir : l'ecran le dit et offre une sortie.
 */
enum class GuestSessionEnd(val code: String, val httpStatus: Int) {
    /** Le lien de partage a expire. */
    LINK_EXPIRED("SHARE_LINK_EXPIRED", 403),

    /** L'hote a retire l'acces de l'invite. */
    ACCESS_REVOKED("GUEST_ACCESS_REVOKED", 410),
    ;

    companion object {
        /** Un code (socket, ou REST deja lu) termine-t-il la session ? `null` pour tout autre code. */
        fun fromCode(code: String?): GuestSessionEnd? = entries.firstOrNull { it.code == code }

        /**
         * Le refus lu dans une reponse REST : le code se cherche dans `code` puis dans `error` (le 410 de revocation l'y
         * pose) et n'est reconnu que sous SON statut — un code egare sous un autre statut ne termine rien.
         */
        fun from(statusCode: Int, code: String?, error: String?): GuestSessionEnd? =
            (fromCode(code) ?: fromCode(error))?.takeIf { it.httpStatus == statusCode }

        /**
         * La réponse de `POST /anonymous/refresh` sur la session DÉTENUE : en plus des deux refus ci-dessus, la passerelle y
         * rend `410 LINK_EXPIRED` / `LINK_DEACTIVATED` / `CONVERSATION_CLOSED` — le lien ou la conversation de CETTE session.
         * Ces codes ne se lisent QUE sur cette réponse, jamais globalement ([from], l'intercepteur) : la jonction
         * `POST /links/:key/members` d'un AUTRE lien rend les mêmes 410 sous le jeton de l'invité courant, qu'ils ne
         * visent pas. Comme [from], le motif se cherche dans `code` PUIS dans `error` : `sendError(reply, 410, 'LINK_EXPIRED')`
         * le pose dans `error` et n'écrit aucune clé `code`.
         */
        fun fromRefresh(statusCode: Int?, code: String?, error: String? = null): GuestSessionEnd? =
            if (statusCode != 410) null else refreshEnd(code) ?: refreshEnd(error)

        private fun refreshEnd(reason: String?): GuestSessionEnd? = when (reason) {
            ACCESS_REVOKED.code -> ACCESS_REVOKED
            in REFRESH_LINK_GONE -> LINK_EXPIRED
            else -> null
        }

        private val REFRESH_LINK_GONE = setOf("LINK_EXPIRED", "LINK_DEACTIVATED", "CONVERSATION_CLOSED")

        /** Le refus lu dans la charge d'un evenement socket `error` (`{ message, code }`), tel que sa serialisation JSON. */
        fun fromSocketPayload(raw: String): GuestSessionEnd? {
            val payload = runCatching { Json.parseToJsonElement(raw) as? JsonObject }.getOrNull() ?: return null
            return fromCode((payload["code"] as? JsonPrimitive)?.takeIf { it.isString }?.content)
        }

        /**
         * La fin vise-t-elle la session courante ? Seulement si le refus NOMME son jeton et que c'est le sien : un refus
         * qui nomme un autre jeton vise une session deja quittee (l'ancienne socket gardee ouverte par un appel, un depart
         * refuse apres qu'un nouveau lien a ete ouvert), et un refus qui n'en nomme aucun ne vise personne.
         */
        fun targets(currentToken: String?, refusedToken: String?): Boolean =
            currentToken != null && refusedToken == currentToken
    }
}

/** Le lien d'invitation que l'invite colle : `/join/<id>` ou `/chat/<id>`, rien d'autre n'ouvre une session d'invite. */
object GuestNewLink {
    private val LINK = Regex(
        "^(?:https://(?:www\\.)?meeshy\\.me(?::443)?/(?:join|chat)|meeshy://join)/([A-Za-z0-9_-]{1,128})/?$",
        RegexOption.IGNORE_CASE,
    )

    fun identifier(text: String): String? = LINK.matchEntire(text.trim())?.groupValues?.get(1)
}
