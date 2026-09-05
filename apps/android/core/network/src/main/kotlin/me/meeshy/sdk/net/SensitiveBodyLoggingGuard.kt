package me.meeshy.sdk.net

import okhttp3.Interceptor
import okhttp3.Response
import okhttp3.logging.HttpLoggingInterceptor

/**
 * Empeche un mot de passe de partir en clair dans logcat quand le logging BODY
 * est actif (#4811).
 *
 * `HttpLoggingInterceptor` n'offre de redaction que sur les EN-TETES
 * (`redactHeader`) — rien sur le corps. Ajoute a l'OkHttpClient JUSTE AVANT
 * [logger], ce garde abaisse son niveau a BASIC (methode + URL + statut, sans
 * corps ni en-tetes) pour toute route dont le corps de requete porte un mot de
 * passe en clair, et le restaure a [fullLevel] pour les autres. `logger.level`
 * est un `var` mutable lu par [logger] au moment ou il s'execute, juste apres
 * ce garde dans la chaine — c'est ce couplage d'ordre qui permet a une seule
 * instance de `HttpLoggingInterceptor` de varier par requete sans dupliquer le
 * client OkHttp.
 */
class SensitiveBodyLoggingGuard(
    private val logger: HttpLoggingInterceptor,
    private val fullLevel: HttpLoggingInterceptor.Level,
) : Interceptor {

    override fun intercept(chain: Interceptor.Chain): Response {
        val path = chain.request().url.encodedPath
        logger.level = if (SENSITIVE_PATHS.any { path.endsWith(it) }) {
            HttpLoggingInterceptor.Level.BASIC
        } else {
            fullLevel
        }
        return chain.proceed(chain.request())
    }

    companion object {
        /**
         * Routes dont le corps de requete porte un mot de passe en clair.
         * `/auth/login` et `/auth/register` (le mot de passe choisi) ;
         * `/auth/2fa/disable` (confirmation par mot de passe) ;
         * `/users/me/password` (l'ancien ET le nouveau) ; `/me/account/deletion`
         * (#4811 — le site qui a declenche cette garde).
         */
        internal val SENSITIVE_PATHS = setOf(
            "/auth/login",
            "/auth/register",
            "/auth/2fa/disable",
            "/users/me/password",
            "/me/account/deletion",
        )
    }
}
