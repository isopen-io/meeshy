package me.meeshy.sdk.media

import androidx.work.ForegroundInfo
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.job
import kotlinx.coroutines.withContext
import java.util.concurrent.atomic.AtomicBoolean
import me.meeshy.sdk.model.media.UploadLeaseEnd
import me.meeshy.sdk.model.media.UploadLeasePlan

/**
 * Couture du bail d'arrière-plan (miroir de `BackgroundTaskProviding`, iOS) : [begin] prend le bail AVANT que le
 * travail démarre, [end] le relâche. L'expiration (timeout `dataSync`) est annoncée par `onExpired`. Un double factice
 * déclenche l'expiration en test, sans application hôte.
 */
interface UploadLeaseProvider {
    suspend fun begin(name: String, onExpired: () -> Unit)
    suspend fun end()

    /** Le système reprend la main (timeout `dataSync`, arrêt du worker) : déclenche le `onExpired` reçu à [begin]. */
    fun expire()
}

/** Issue d'un travail sous bail : [expired] dit si le système a repris la main avant la fin. */
sealed interface LeasedOutcome<out T> {
    data class Completed<T>(val value: T) : LeasedOutcome<T>
    data object Expired : LeasedOutcome<Nothing>
}

/**
 * Exécute un envoi lourd sous un bail qui se termine exactement une fois. À l'expiration le travail est annulé ; le
 * point de reprise TUS est déjà écrit après chaque tronçon accepté, donc rien n'est à écrire ici : la ligne reste à
 * reprendre et l'outbox rejoue à l'offset accepté.
 */
class UploadForegroundLease(private val provider: UploadLeaseProvider) {

    suspend fun <T> run(name: String, isFailure: (T) -> Boolean = { false }, work: suspend () -> T): LeasedOutcome<T> {
        var plan = UploadLeasePlan.idle()
        val expired = AtomicBoolean(false)
        suspend fun finish(reason: UploadLeaseEnd) {
            val transition = plan.end(reason)
            plan = transition.plan
            if (transition.releases) withContext(NonCancellable) { provider.end() }
        }
        return try {
            coroutineScope {
                val scope = coroutineContext.job
                provider.begin(name) {
                    expired.set(true)
                    scope.cancel(CancellationException(EXPIRED_MESSAGE))
                }
                plan = plan.begin()
                ensureActive()
                val value = work()
                when {
                    expired.get() -> {
                        finish(UploadLeaseEnd.EXPIRED)
                        LeasedOutcome.Expired
                    }
                    else -> {
                        finish(if (isFailure(value)) UploadLeaseEnd.FAILED else UploadLeaseEnd.SUCCEEDED)
                        LeasedOutcome.Completed(value)
                    }
                }
            }
        } catch (cancelled: CancellationException) {
            if (expired.get()) {
                finish(UploadLeaseEnd.EXPIRED)
                LeasedOutcome.Expired
            } else {
                finish(UploadLeaseEnd.CANCELLED)
                throw cancelled
            }
        } catch (failure: Exception) {
            finish(UploadLeaseEnd.FAILED)
            throw failure
        }
    }

    private companion object {
        const val EXPIRED_MESSAGE = "upload lease expired"
    }
}

/** La notification discrète « Envoi en cours… » d'un envoi sous bail (canal des notifications en cours, sans son). */
fun interface UploadLeaseNotifier {
    fun foregroundInfo(progressPercent: Int?): ForegroundInfo
}
