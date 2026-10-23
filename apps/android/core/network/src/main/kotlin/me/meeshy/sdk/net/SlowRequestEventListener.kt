package me.meeshy.sdk.net

import android.util.Log
import okhttp3.Call
import okhttp3.EventListener
import java.io.IOException

/** Destination du journal des requêtes lentes. Jamais un corps, jamais un en-tête. */
fun interface SlowRequestSink {
    fun slow(message: String)
}

internal object LogcatSlowRequestSink : SlowRequestSink {
    override fun slow(message: String) {
        Log.w("MeeshyNet", message)
    }
}

/**
 * Journalise « Slow request » au-delà d'1 s, avec la ventilation réseau / décodage :
 * le réseau court de l'appel à la fin de la lecture du corps, le décodage de la fin
 * de lecture à la libération de la réponse (le convertisseur lit puis décode).
 *
 * Seuls la méthode et le chemin sont écrits — ni requête, ni en-tête, ni corps.
 */
class SlowRequestEventListener(
    private val sink: SlowRequestSink,
    private val clockMillis: () -> Long = System::currentTimeMillis,
    private val thresholdMillis: Long = SLOW_THRESHOLD_MILLIS,
) : EventListener() {

    private var startedAt = 0L
    private var bodyEndedAt: Long? = null

    override fun callStart(call: Call) {
        startedAt = clockMillis()
    }

    override fun responseBodyEnd(call: Call, byteCount: Long) {
        bodyEndedAt = clockMillis()
    }

    override fun callEnd(call: Call) = report(call)

    override fun callFailed(call: Call, ioe: IOException) = report(call)

    private fun report(call: Call) {
        val endedAt = clockMillis()
        val total = endedAt - startedAt
        if (total < thresholdMillis) return
        val network = (bodyEndedAt ?: endedAt) - startedAt
        val decoding = total - network
        val request = call.request()
        sink.slow(
            "Slow request ${request.method} ${request.url.encodedPath} " +
                "${total}ms (network ${network}ms, decoding ${decoding}ms)",
        )
    }

    companion object {
        const val SLOW_THRESHOLD_MILLIS: Long = 1_000L

        fun factory(sink: SlowRequestSink = LogcatSlowRequestSink): EventListener.Factory =
            EventListener.Factory { SlowRequestEventListener(sink) }
    }
}
