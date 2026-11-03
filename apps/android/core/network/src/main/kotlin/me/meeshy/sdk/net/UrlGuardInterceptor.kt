package me.meeshy.sdk.net

import me.meeshy.sdk.model.net.EndpointPolicy
import me.meeshy.sdk.model.net.PathSegment
import okhttp3.Interceptor
import okhttp3.Response
import java.io.IOException

/** Une adresse refusée AVANT envoi : le réseau n'a pas été touché. */
class InvalidUrlException(path: String) : IOException("URL invalide : $path")

/**
 * Refuse, avant tout appel réseau, un chemin à segment vide, à double slash ou à slash
 * final — miroir de `APIClient.containsEmptyPathSegment` (iOS). Un identifiant vide
 * interpolé (`conversations//messages`) tomberait sinon sur une AUTRE route du serveur. Les routes du jeu n'acceptent
 * que `A-Za-z0-9-_~` par segment ([PathSegment]) : un `/`, un `?` ou un `..` redirigeraient l'écriture (#9378).
 */
class UrlGuardInterceptor : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        // A WebSocket upgrade is not a REST route: the Socket.IO handshake path is
        // `/socket.io/` by protocol, trailing slash included (shared client, #12102).
        if (request.header("Upgrade").equals("websocket", ignoreCase = true)) return chain.proceed(request)
        val path = request.url.encodedPath
        if (EndpointPolicy.hasEmptyPathSegment(path) || PathSegment.hasForbiddenGameSegment(path)) throw InvalidUrlException(path)
        return chain.proceed(request)
    }
}
