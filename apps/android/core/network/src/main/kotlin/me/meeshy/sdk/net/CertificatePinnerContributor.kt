package me.meeshy.sdk.net

import android.util.Log
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import me.meeshy.sdk.model.net.CertificatePinDecision
import me.meeshy.sdk.model.net.CertificatePinEvaluator
import me.meeshy.sdk.model.net.CertificatePinMode
import me.meeshy.sdk.model.net.CertificatePinPolicy
import okhttp3.Interceptor
import okhttp3.Response
import java.security.cert.X509Certificate
import java.util.concurrent.atomic.AtomicBoolean
import javax.net.ssl.SSLPeerUnverifiedException

/** Destination du journal d'épinglage : un hôte et des compteurs, JAMAIS la chaîne de certificats. */
fun interface PinLogSink {
    fun log(message: String)
}

internal object LogcatPinLogSink : PinLogSink {
    override fun log(message: String) {
        Log.w("MeeshyPin", message)
    }
}

/**
 * Vérifie, sur chaque connexion TLS vers un hôte épinglé, qu'un certificat de la chaîne porte
 * une empreinte SPKI attendue (courante ou de secours). Posé comme intercepteur RÉSEAU du
 * client PARTAGÉ : REST, Socket.IO (polling et WebSocket) passent tous par lui, avant que la
 * moindre requête (donc le moindre jeton) ne parte vers un serveur non conforme.
 */
class CertificatePinInterceptor(
    private val policy: CertificatePinPolicy,
    private val clock: () -> Long = System::currentTimeMillis,
    private val sink: PinLogSink = LogcatPinLogSink,
) : Interceptor {

    private val warnedExpired = AtomicBoolean(false)

    override fun intercept(chain: Interceptor.Chain): Response {
        val host = chain.request().url.host
        when (val mode = policy.modeFor(host, clock())) {
            CertificatePinMode.Unconfigured -> Unit
            CertificatePinMode.Expired -> warnExpiredOnce()
            is CertificatePinMode.Enforced -> enforce(chain, host, mode.pins)
        }
        return chain.proceed(chain.request())
    }

    private fun enforce(chain: Interceptor.Chain, host: String, pins: Set<String>) {
        val certificates = chain.connection()?.handshake()?.peerCertificates.orEmpty()
        val hashes = certificates.map { (it as? X509Certificate)?.let(CertificatePinning::spkiSha256Base64) }
        val decision = CertificatePinEvaluator.evaluate(hashes, pins)
        if (decision.isAllowed) return
        sink.log(
            when (decision) {
                CertificatePinDecision.ChainUnreadable -> "SPKI pin check could not read chain for $host — refused"
                else -> "SPKI pin mismatch for $host — refused (${pins.size} pins)"
            },
        )
        throw SSLPeerUnverifiedException("Certificate pinning failure for $host")
    }

    private fun warnExpiredOnce() {
        if (warnedExpired.compareAndSet(false, true)) {
            sink.log("TLS pin-set expired — system chain validation only; rotate the pins (decisions.md)")
        }
    }
}

object CertificatePinnerContributor {
    /** Entre l'intercepteur de garde d'URL et le réseau : un intercepteur réseau, l'ordre est local. */
    const val ID = "certificate-pinning"
    const val PRIORITY = 50

    fun of(
        policy: CertificatePinPolicy = GatewayPins.POLICY,
        clock: () -> Long = System::currentTimeMillis,
        sink: PinLogSink = LogcatPinLogSink,
    ): HttpClientContributor = HttpClientContributor.of(ID, PRIORITY) {
        it.addNetworkInterceptor(CertificatePinInterceptor(policy, clock, sink))
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal object CertificatePinningModule {
    @Provides
    @IntoSet
    fun providesCertificatePinning(): HttpClientContributor = CertificatePinnerContributor.of()
}
