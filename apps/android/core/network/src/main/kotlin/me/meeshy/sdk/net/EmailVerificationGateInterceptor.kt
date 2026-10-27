package me.meeshy.sdk.net

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.async
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Protocol
import okhttp3.Request
import okhttp3.Response
import okhttp3.ResponseBody.Companion.toResponseBody
import java.io.IOException

/**
 * Le refus `EMAIL_NOT_VERIFIED` mène à la validation, PUIS l'action repart (#8365) — une fois, pour tous les
 * écrans et toutes les files (story, outbox, liens). Même corps : le brouillon n'est jamais perdu, et
 * l'appelant reçoit la réponse de la requête rejouée.
 *
 * Il se place AVANT l'authentification : le rejeu repasse par les jetons (le code a pu prendre des minutes,
 * le jeton a pu être renouvelé). Toutes les demandes en cours partagent UNE feuille et UN verdict
 * ([EmailVerificationGating]). Sans gardien posé, ou avec un corps qu'on ne peut pas rejouer, la réponse passe
 * telle quelle. L'attente bloque le fil réseau — pas le fil principal — et s'interrompt si l'appel est annulé.
 */
class EmailVerificationGateInterceptor(
    private val registry: EmailVerificationGateRegistry,
    private val apiPathPrefix: String,
    private val waitLimitMs: Long = WAIT_LIMIT_MS,
) : Interceptor {

    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        val gate = registry.current
        val reason = gate?.let { EmailVerificationGateRules.reason(request.method, request.url.encodedPath, apiPathPrefix) }
        if (gate == null || reason == null || request.body?.isOneShot() == true) return chain.proceed(request)

        if (EmailVerificationGateRules.isHeldBack(reason)) {
            val needsProof = await(chain) { gate.emailKnownUnproven() } == true
            if (needsProof && await(chain) { gate.verifyEmail(reason) } != true) return localRefusal(request)
        }
        val response = chain.proceed(request)
        val refusal = refusalText(response) ?: return response
        val verified = await(chain) { gate.verifyEmail(EmailVerificationGateRules.reasonAfterRefusal(reason, refusal.text)) }
        if (verified != true) return response
        response.close()
        return chain.proceed(request)
    }

    private fun <T> await(chain: Interceptor.Chain, block: suspend () -> T): T? = try {
        runBlocking {
            val work = async { withTimeoutOrNull(waitLimitMs) { block() } }
            val watcher = launch {
                while (!work.isCompleted) {
                    if (chain.call().isCanceled()) work.cancel()
                    delay(CANCEL_POLL_MS)
                }
            }
            try {
                work.await()
            } finally {
                watcher.cancel()
            }
        }
    } catch (canceled: CancellationException) {
        throw IOException("Canceled", canceled)
    }

    private class Refusal(val text: String?)

    private fun refusalText(response: Response): Refusal? {
        if (response.code != 403) return null
        val raw = response.peekBody(PEEK_LIMIT_BYTES).bytes()
        val body = runCatching { Json.parseToJsonElement(String(raw, Charsets.UTF_8)).jsonObject }.getOrNull() ?: return null
        if (!EmailVerificationGateRules.isRefusalCode(body["code"]?.jsonPrimitive?.contentOrNull)) return null
        return Refusal(text = body["error"]?.jsonPrimitive?.contentOrNull)
    }

    private fun localRefusal(request: Request): Response = Response.Builder()
        .request(request)
        .protocol(Protocol.HTTP_1_1)
        .code(403)
        .message("Forbidden")
        .body(LOCAL_REFUSAL_BODY.toResponseBody("application/json".toMediaType()))
        .build()

    private companion object {
        const val WAIT_LIMIT_MS = 15 * 60 * 1000L
        const val CANCEL_POLL_MS = 250L
        const val PEEK_LIMIT_BYTES = 64L * 1024L
        const val LOCAL_REFUSAL_BODY = """{"success":false,"error":"Email verification required","code":"EMAIL_NOT_VERIFIED"}"""
    }
}
