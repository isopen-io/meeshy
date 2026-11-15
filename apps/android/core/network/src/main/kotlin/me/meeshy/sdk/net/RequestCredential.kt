package me.meeshy.sdk.net

import okhttp3.Request

/**
 * L'identifiant présenté à la passerelle, indissociable de SON en-tête (miroir de
 * `MeeshyRequestCredential`, iOS). Un compte inscrit s'annonce par `Authorization: Bearer`,
 * un invité de lien par `X-Session-Token` : présenter le second en Bearer rend « Invalid JWT
 * token », un refus qui ressemble à une panne alors que l'identité est valide.
 */
public sealed class RequestCredential(
    public val header: String,
    public val value: String,
    public val token: String,
) {
    public class Bearer(token: String) : RequestCredential(AUTHORIZATION, "Bearer $token", token)
    public class AnonymousSession(token: String) : RequestCredential(SESSION_TOKEN, token, token)

    /** Le JWT d'un compte inscrit, `null` pour un invité. */
    public val bearerToken: String? get() = (this as? Bearer)?.token

    public fun applyTo(builder: Request.Builder): Request.Builder = builder.header(header, value)

    public companion object {
        public const val AUTHORIZATION: String = "Authorization"
        public const val SESSION_TOKEN: String = "X-Session-Token"

        /** L'identité que la requête PORTE déjà (posée par l'appelant), s'il y en a une. */
        public fun carriedBy(request: Request): RequestCredential? {
            request.header(AUTHORIZATION)?.let { raw ->
                return if (raw.startsWith("Bearer ")) Bearer(raw.removePrefix("Bearer ")) else null
            }
            return request.header(SESSION_TOKEN)?.let { AnonymousSession(it) }
        }

        /** Le compte inscrit si un JWT est détenu, sinon l'invité — jamais les deux. */
        public fun of(tokenStore: TokenStore): RequestCredential? {
            tokenStore.jwt?.let { return Bearer(it) }
            return tokenStore.sessionToken?.let { AnonymousSession(it) }
        }
    }
}

/** Posé par l'intercepteur d'authentification : le jeton ci-dessous est celui de l'ENVOI. */
internal class SentCredential(val credential: RequestCredential?, val generation: Long, val pinned: Boolean)

internal fun Request.sentCredential(): SentCredential? = tag(SentCredential::class.java)
