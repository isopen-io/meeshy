package me.meeshy.sdk.net

import me.meeshy.sdk.model.net.ClientIdentity
import me.meeshy.sdk.model.net.ClientIdentityHeaders
import okhttp3.Interceptor
import okhttp3.Response

/**
 * Pose sur chaque requête l'identité du client (`X-Meeshy-*`, `X-App-Version`, `X-App-Platform`).
 * Un en-tête déjà posé par l'appelant fait autorité : rien ne l'écrase.
 */
class ClientInfoInterceptor(
    private val identity: () -> ClientIdentity,
) : Interceptor {

    constructor(provider: ClientInfoProvider) : this(provider::identity)

    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        val missing = ClientIdentityHeaders.build(identity()).filterKeys { request.header(it) == null }
        if (missing.isEmpty()) return chain.proceed(request)
        val builder = request.newBuilder()
        missing.forEach { (name, value) -> builder.header(name, value) }
        return chain.proceed(builder.build())
    }
}
