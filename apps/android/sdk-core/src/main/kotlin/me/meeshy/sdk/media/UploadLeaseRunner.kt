package me.meeshy.sdk.media

import androidx.work.CoroutineWorker
import timber.log.Timber
import java.util.concurrent.atomic.AtomicReference
import javax.inject.Inject

/**
 * Le bail d'un worker WorkManager : `setForeground` pose la notification « Envoi en cours… » (type `dataSync`) AVANT
 * le premier octet ; WorkManager la retire quand le worker se termine, donc aucune notification n'est orpheline.
 * [expire] est appelé quand le worker est annulé : l'arrêt par le système (timeout `dataSync`, contraintes perdues) annule le PATCH
 * en cours — le point de reprise TUS est déjà écrit après chaque tronçon accepté.
 */
class WorkerUploadLeaseProvider(
    private val worker: CoroutineWorker,
    private val notifier: UploadLeaseNotifier,
) : UploadLeaseProvider {
    private val onExpired = AtomicReference<(() -> Unit)?>(null)

    override suspend fun begin(name: String, onExpired: () -> Unit) {
        this.onExpired.set(onExpired)
        try {
            worker.setForeground(notifier.foregroundInfo(null))
        } catch (refused: IllegalStateException) {
            // Démarrage d'un service de premier plan refusé en arrière-plan : l'envoi continue sans notification.
            Timber.w(refused, "upload lease: foreground refused for %s", name)
        }
    }

    override suspend fun end() {
        onExpired.set(null)
    }

    override fun expire() {
        onExpired.getAndSet(null)?.invoke()
    }
}

/**
 * Exécute un travail d'envoi sous bail quand [leased] ; sans fournisseur ([Passthrough]) le travail court nu.
 * Rend `null` quand le système a repris la main : l'appelant laisse alors la ligne à reprendre.
 */
/** Un worker qui veut être prévenu de son bail pour l'expirer quand il est annulé. */
interface LeaseExpiringWorker {
    fun attachLease(provider: UploadLeaseProvider)
}

class UploadLeaseRunner(private val providerFor: (CoroutineWorker) -> UploadLeaseProvider?) {

    @Inject
    constructor(notifier: UploadLeaseNotifier) : this({ worker -> WorkerUploadLeaseProvider(worker, notifier) })

    suspend fun <T> run(
        worker: CoroutineWorker,
        leased: Boolean,
        isFailure: (T) -> Boolean = { false },
        work: suspend () -> T,
    ): T? {
        val provider = if (leased) providerFor(worker) else null
        if (provider == null) return work()
        (worker as? LeaseExpiringWorker)?.attachLease(provider)
        return when (val outcome = UploadForegroundLease(provider).run(LEASE_NAME, isFailure, work)) {
            is LeasedOutcome.Completed -> outcome.value
            LeasedOutcome.Expired -> null
        }
    }

    companion object {
        const val LEASE_NAME = "media-upload"
        val Passthrough: UploadLeaseRunner = UploadLeaseRunner(providerFor = { null })
    }
}
