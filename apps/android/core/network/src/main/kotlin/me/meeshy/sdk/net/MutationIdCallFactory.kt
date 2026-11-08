package me.meeshy.sdk.net

import kotlinx.coroutines.ThreadContextElement
import kotlinx.coroutines.asContextElement
import kotlinx.coroutines.withContext
import me.meeshy.sdk.model.ClientIdFormat
import me.meeshy.sdk.net.api.CLIENT_MUTATION_ID_HEADER
import okhttp3.Call
import okhttp3.Request

/**
 * The `cmid` of the outbox row being delivered, carried by the coroutine that delivers it. Retrofit builds the OkHttp call on
 * the calling coroutine's thread, where [MutationIdCallFactory] reads it: the sender never has to thread the key through each
 * API method for the gateway's MutationLog to recognise a replay.
 */
public object MutationIdContext {
    private val current = ThreadLocal<String?>()

    internal fun currentCmid(): String? = current.get()

    internal fun element(cmid: String): ThreadContextElement<String?> = current.asContextElement(cmid)
}

/** Runs [block] with every request it makes carrying `X-Client-Mutation-Id: [cmid]` (only a well-formed `cmid_<uuid>`). */
public suspend fun <T> withMutationId(cmid: String, block: suspend () -> T): T =
    if (ClientIdFormat.isValidCmid(cmid)) withContext(MutationIdContext.element(cmid)) { block() } else block()

/**
 * A [Call.Factory] that stamps `X-Client-Mutation-Id` from [MutationIdContext] on a request that does not carry its own (a
 * sender that already sets the header, like a post creation, keeps its value).
 */
public class MutationIdCallFactory(public val delegate: Call.Factory) : Call.Factory {
    override fun newCall(request: Request): Call = delegate.newCall(stamped(request))

    private fun stamped(request: Request): Request {
        val cmid = MutationIdContext.currentCmid() ?: return request
        if (request.header(CLIENT_MUTATION_ID_HEADER) != null) return request
        return request.newBuilder().header(CLIENT_MUTATION_ID_HEADER, cmid).build()
    }
}
