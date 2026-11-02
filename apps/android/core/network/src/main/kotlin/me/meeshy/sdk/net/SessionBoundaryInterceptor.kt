package me.meeshy.sdk.net

import okhttp3.Interceptor
import okhttp3.MediaType
import okhttp3.Response
import okhttp3.ResponseBody
import okio.Buffer
import okio.BufferedSource
import okio.ForwardingSource
import okio.buffer
import java.io.IOException

/** The session that asked for this response ended while it was in flight: the response was dropped unread. */
public class SessionEndedDuringRequestException : IOException("The session this request belonged to ended while it was in flight")

/**
 * **The account boundary of every REST response** (#13558). A response that lands after the session that asked for it
 * ended (logout, account switch: [SessionTransitionFlags.generation] moved while the request was in flight) is closed
 * unread and surfaces as an [IOException], so no repository can write the departed account's data into the caches of
 * the next one. Outermost interceptor: the generation is read before any retry or refresh, and judged after them.
 *
 * The headers are not the whole response: the body streams AFTER this interceptor returns, while the converter decodes
 * it. Every read of the body is judged too — a session that ends while its body is still on the wire stops the decode.
 */
public class SessionBoundaryInterceptor(private val transition: SessionTransitionFlags) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val askedUnder = transition.generation
        val response = chain.proceed(chain.request())
        if (transition.generation != askedUnder) {
            response.close()
            throw SessionEndedDuringRequestException()
        }
        val body = response.body ?: return response
        return response.newBuilder().body(SessionBoundBody(body, transition, askedUnder)).build()
    }
}

private class SessionBoundBody(
    private val delegate: ResponseBody,
    private val transition: SessionTransitionFlags,
    private val askedUnder: Long,
) : ResponseBody() {
    private val bounded: BufferedSource by lazy {
        object : ForwardingSource(delegate.source()) {
            override fun read(sink: Buffer, byteCount: Long): Long {
                ensureSameSession()
                val read = super.read(sink, byteCount)
                ensureSameSession()
                return read
            }
        }.buffer()
    }

    private fun ensureSameSession() {
        if (transition.generation != askedUnder) throw SessionEndedDuringRequestException()
    }

    override fun contentType(): MediaType? = delegate.contentType()

    override fun contentLength(): Long = delegate.contentLength()

    override fun source(): BufferedSource = bounded

    override fun close() {
        delegate.close()
    }
}
