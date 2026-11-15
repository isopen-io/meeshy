package me.meeshy.sdk.net

import me.meeshy.sdk.model.net.EndpointPolicy
import me.meeshy.sdk.model.net.RoutePolicy
import okhttp3.Interceptor
import okhttp3.Request
import okhttp3.Response

/**
 * La politique de la route lue sur la requête : posée par [EndpointPolicyInterceptor], et
 * dérivée du chemin quand la requête n'est pas passée par lui — une couche en aval
 * n'a donc jamais à deviner.
 */
fun Request.routePolicy(): RoutePolicy =
    tag(RoutePolicy::class.java) ?: EndpointPolicy.of(url.encodedPath)

/** Attache à chaque requête la [RoutePolicy] de sa route (authentification, réessai, refus). */
class EndpointPolicyInterceptor : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        val tagged = request.newBuilder()
            .tag(RoutePolicy::class.java, EndpointPolicy.of(request.url.encodedPath))
            .build()
        return chain.proceed(tagged)
    }
}
