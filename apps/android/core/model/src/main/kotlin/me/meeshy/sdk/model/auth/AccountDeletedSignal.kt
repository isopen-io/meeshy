package me.meeshy.sdk.model.auth

import java.util.Base64
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/**
 * « Ce compte a été supprimé » (miroir de iOS `AccountDeletedSignal`, contrat passerelle #10264) : le seul refus qui dise
 * quelque chose du COMPTE plutôt que du jeton. L'appareil y retire le compte NOMMÉ ; d'où deux bornes.
 *
 * - le SIGNAL : `code == "ACCOUNT_DELETED"` avec `accountId` (401 de toute requête, refus de `/auth/refresh`, événement
 *   socket `error`), ou `deletedAccountId` (`auth:session-revoked` à la purge). Ni `AUTH_FAILED`, ni `SESSION_REVOKED`, ni
 *   un 401 sans code : un jeton expiré ou une session révoquée ne disent rien du compte ;
 * - le COMPTE : celui que le signal nomme, et seulement s'il est le PROPRIÉTAIRE du jeton présenté (requête) ou de la
 *   connexion (socket) — jamais le compte actif au moment de la réponse, une bascule a pu se faire pendant le vol.
 */
object AccountDeletedSignal {
    const val CODE: String = "ACCOUNT_DELETED"
    private const val ACCOUNT_KEY = "accountId"
    private const val DELETED_ACCOUNT_KEY = "deletedAccountId"
    private const val MAX_ID_LENGTH = 128

    private val json = Json { ignoreUnknownKeys = true }

    /** Un identifiant de compte a la forme d'un ObjectId ou d'un jeton d'URL : ce qui n'en a pas la forme ne nomme aucun compte. */
    fun isAccountId(value: String?): Boolean =
        !value.isNullOrEmpty() && value.length <= MAX_ID_LENGTH && value.all { it.code < 128 && (it.isLetterOrDigit() || it == '-' || it == '_') }

    private fun named(value: String?): String? = value?.takeIf(::isAccountId)

    /** Le compte nommé par un 401 `{ code: "ACCOUNT_DELETED", accountId }` — sous ce statut seulement. */
    fun namedAccount(statusCode: Int, body: String?): String? =
        if (statusCode != 401) null else namedAccountInPayload(body)

    /** Le compte nommé par l'événement socket `error` (sa charge JSON) ou par n'importe quel corps `{ code, accountId }`. */
    fun namedAccountInPayload(raw: String?): String? {
        val payload = objectOf(raw) ?: return null
        if (text(payload, "code") != CODE) return null
        return named(text(payload, ACCOUNT_KEY))
    }

    /** Le compte nommé par `auth:session-revoked` (`deletedAccountId`, purge confirmée seulement). */
    fun namedAccountInSessionRevoked(raw: String?): String? = named(objectOf(raw)?.let { text(it, DELETED_ACCOUNT_KEY) })

    /**
     * Le compte d'un JWT de session (claim `userId`). Lu sans vérifier la signature : la passerelle l'a vérifiée, l'appareil
     * ne s'en sert que pour savoir AU NOM DE QUI il a parlé.
     */
    fun ownerOfJwt(token: String?): String? {
        val bare = token?.removePrefix("Bearer ")?.trim()?.takeIf { it.isNotEmpty() } ?: return null
        val parts = bare.split('.')
        if (parts.size != 3) return null
        val claims = runCatching { String(Base64.getUrlDecoder().decode(parts[1].trimEnd('='))) }.getOrNull()
        return named(objectOf(claims)?.let { text(it, "userId") })
    }

    /**
     * Le propriétaire de ce qu'une requête PRÉSENTE : le JWT d'`Authorization` et, pour `/auth/refresh`, celui du corps
     * (`token`). Deux propriétaires différents ne désignent personne.
     */
    fun presentedOwner(authorization: String?, requestBody: String?): String? {
        val bodyToken = objectOf(requestBody)?.let { text(it, "token") }
        val owners = setOfNotNull(ownerOfJwt(authorization), ownerOfJwt(bodyToken))
        return owners.singleOrNull()
    }

    /** La loi : le compte nommé n'est retenu que s'il est le propriétaire. */
    fun owned(namedAccount: String?, owner: String?): String? =
        if (namedAccount != null && owner != null && namedAccount == owner) namedAccount else null

    private fun objectOf(raw: String?): JsonObject? =
        if (raw.isNullOrBlank()) null else runCatching { json.parseToJsonElement(raw) as? JsonObject }.getOrNull()

    private fun text(payload: JsonObject, key: String): String? =
        (payload[key] as? JsonPrimitive)?.takeIf { it.isString }?.content
}
