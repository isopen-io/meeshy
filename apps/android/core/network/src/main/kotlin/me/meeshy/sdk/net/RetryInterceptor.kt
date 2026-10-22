package me.meeshy.sdk.net

import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import me.meeshy.sdk.model.net.RetryDecision
import okhttp3.Interceptor
import okhttp3.Response
import java.io.IOException

/**
 * Rejoue un 429 / 503 jusqu'à [RetryDecision.MAX_ATTEMPTS] fois, après `Retry-After`
 * (plafonné à 30 s) ou `2^tentative` secondes. La quatrième réponse remonte telle quelle.
 *
 * Jamais rejoué : un 429 `DAILY_*` / `NEWCOMER_SLOW_MODE` (la limite se DIT à l'auteur),
 * une route dont la politique est « jamais » (`/signal/…`), une méthode [NeverRetried].
 */
class RetryInterceptor(
    private val sleeper: (Long) -> Unit = { Thread.sleep(it) },
    private val clock: () -> Long = System::currentTimeMillis,
) : Interceptor {

    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        var attempt = 0
        while (true) {
            val response = chain.proceed(request)
            val delay = delayBeforeReplay(response, attempt) ?: return response
            response.close()
            pause(delay)
            attempt++
        }
    }

    private fun delayBeforeReplay(response: Response, attempt: Int): Long? {
        val request = response.request
        if (response.code !in RetryDecision.RETRYABLE_STATUS_CODES || request.isNeverRetried()) return null
        val refusalCode = if (response.code == 429) refusalCodeOf(response) else null
        if (!RetryDecision.shouldRetry(response.code, attempt, request.routePolicy().retryPolicy, refusalCode)) return null
        return RetryDecision.delayMillis(response.code, attempt, response.header("Retry-After"), clock())
    }

    private fun pause(millis: Long) {
        try {
            sleeper(millis)
        } catch (e: InterruptedException) {
            Thread.currentThread().interrupt()
            throw IOException("Réessai interrompu", e)
        }
    }

    private fun refusalCodeOf(response: Response): String? = runCatching {
        val body = response.peekBody(PEEK_LIMIT_BYTES).string()
        MeeshyApi.json.parseToJsonElement(body).jsonObject["code"]?.jsonPrimitive?.contentOrNull
    }.getOrNull()

    private companion object {
        const val PEEK_LIMIT_BYTES = 8_192L
    }
}
