package me.meeshy.sdk.net

import me.meeshy.sdk.model.net.EndpointPolicy
import okhttp3.Interceptor
import okhttp3.Response
import java.io.IOException

/** Une adresse refusée AVANT envoi : le réseau n'a pas été touché. */
class InvalidUrlException(path: String) : IOException("URL invalide : $path")

/**
 * Refuse, avant tout appel réseau, un chemin à segment vide, à double slash ou à slash
 * final — miroir de `APIClient.containsEmptyPathSegment` (iOS). Un identifiant vide
 * interpolé (`conversations//messages`) tomberait sinon sur une AUTRE route du serveur.
 */
class UrlGuardInterceptor : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val path = chain.request().url.encodedPath
        if (EndpointPolicy.hasEmptyPathSegment(path)) throw InvalidUrlException(path)
        return chain.proceed(chain.request())
    }
}
