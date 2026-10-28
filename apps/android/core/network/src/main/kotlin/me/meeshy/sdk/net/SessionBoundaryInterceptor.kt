package me.meeshy.sdk.net

import okhttp3.Interceptor
import okhttp3.Response
import java.io.IOException

/** The session that asked for this response ended while it was in flight: the response was dropped unread. */
public class SessionEndedDuringRequestException : IOException("The session this request belonged to ended while it was in flight")

/**
 * **The account boundary of every REST response** (#13558). A response that lands after the session that asked for it
 * ended (logout, account switch: [SessionTransitionFlags.generation] moved while the request was in flight) is closed
 * unread and surfaces as an [IOException], so no repository can write the departed account's data into the caches of
 * the next one. Outermost interceptor: the generation is read before any retry or refresh, and judged after them.
 */
public class SessionBoundaryInterceptor(private val transition: SessionTransitionFlags) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val askedUnder = transition.generation
        val response = chain.proceed(chain.request())
        if (transition.generation == askedUnder) return response
        response.close()
        throw SessionEndedDuringRequestException()
    }
}
