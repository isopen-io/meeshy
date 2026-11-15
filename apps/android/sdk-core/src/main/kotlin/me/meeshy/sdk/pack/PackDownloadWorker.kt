package me.meeshy.sdk.pack

import android.content.Context
import androidx.hilt.work.HiltWorker
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.Data
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequest
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject
import java.io.IOException
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import kotlinx.coroutines.CancellationException
import me.meeshy.sdk.model.pack.PackAssetRef
import me.meeshy.sdk.model.pack.PackFailureCause
import me.meeshy.sdk.model.pack.PackQueueReason

/** Ce qu'un téléchargement de pack a donné : prêt, ou la cause de la panne que la machine de présence reprend. */
sealed interface PackDownloadOutcome {
    data object Completed : PackDownloadOutcome
    data class Failed(val cause: PackFailureCause) : PackDownloadOutcome
}

/** Télécharge les fichiers d'un pack par le magasin (déjà présents = rien à faire, un seul vol par fichier). */
class PackDownloadRunner @Inject constructor(private val store: ContentAddressedStore) {
    suspend fun run(refs: List<PackAssetRef>, onProgress: suspend (doneBytes: Long) -> Unit = {}): PackDownloadOutcome {
        var done = 0L
        for (ref in refs) {
            try {
                store.data(ref)
            } catch (error: CancellationException) {
                throw error
            } catch (error: DigestMismatchException) {
                return PackDownloadOutcome.Failed(PackFailureCause.INTEGRITY)
            } catch (error: IOException) {
                return PackDownloadOutcome.Failed(if (error.isNoSpace()) PackFailureCause.SPACE else PackFailureCause.NETWORK)
            }
            done += ref.bytes
            onProgress(done)
        }
        return PackDownloadOutcome.Completed
    }

    private fun Throwable.isNoSpace(): Boolean =
        generateSequence(this) { it.cause }.any { it.message?.contains("ENOSPC", ignoreCase = true) == true || it.message?.contains("No space left", ignoreCase = true) == true }
}

/** Les contraintes d'une attente : Wi-Fi seulement (réseau non facturé), réseau, ou place disque. */
object PackDownloadConstraints {
    fun forReason(reason: PackQueueReason): Constraints = Constraints.Builder()
        .setRequiredNetworkType(if (reason == PackQueueReason.WIFI) NetworkType.UNMETERED else NetworkType.CONNECTED)
        .setRequiresStorageNotLow(true)
        .build()

    /** Une panne de place se reprend quand la place est libérée : le système ne relance qu'avec le stockage non bas. */
    fun forFailure(cause: PackFailureCause): Constraints = Constraints.Builder()
        .setRequiredNetworkType(NetworkType.CONNECTED)
        .setRequiresStorageNotLow(cause == PackFailureCause.SPACE)
        .build()
}

@HiltWorker
class PackDownloadWorker @AssistedInject constructor(
    @Assisted context: Context,
    @Assisted params: WorkerParameters,
    private val runner: PackDownloadRunner,
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        val refs = decodeRefs(inputData.getStringArray(KEY_FILES).orEmpty().toList()) ?: return Result.failure(failure(PackFailureCause.INTEGRITY))
        return when (val outcome = runner.run(refs) { done -> setProgress(workDataOf(KEY_DONE to done)) }) {
            PackDownloadOutcome.Completed -> Result.success()
            is PackDownloadOutcome.Failed -> when (outcome.cause) {
                // L'intégrité ne se rejoue pas en boucle : la session suivante seulement.
                PackFailureCause.INTEGRITY -> Result.failure(failure(outcome.cause))
                PackFailureCause.NETWORK, PackFailureCause.SPACE ->
                    if (runAttemptCount >= MAX_ATTEMPTS) Result.failure(failure(outcome.cause)) else Result.retry()
            }
        }
    }

    private fun failure(cause: PackFailureCause): Data = workDataOf(KEY_CAUSE to cause.wire)

    companion object {
        const val KEY_FILES = "files"
        const val KEY_DONE = "done"
        const val KEY_CAUSE = "cause"

        /** Au-delà, la file rend la main : la panne se reprend à la session suivante, pas en boucle. */
        const val MAX_ATTEMPTS = 8

        fun uniqueName(slug: String): String = "pack-download-$slug"

        fun encodeRefs(refs: List<PackAssetRef>): Array<String> = refs.map { "${it.src}|${it.bytes}|${it.sha256}" }.toTypedArray()

        fun decodeRefs(encoded: List<String>): List<PackAssetRef>? = encoded.map { line ->
            val parts = line.split('|')
            if (parts.size != 3) return null
            PackAssetRef.of(parts[0], parts[1].toLongOrNull() ?: return null, parts[2]) ?: return null
        }

        fun request(refs: List<PackAssetRef>, reason: PackQueueReason): OneTimeWorkRequest =
            OneTimeWorkRequestBuilder<PackDownloadWorker>()
                .setConstraints(PackDownloadConstraints.forReason(reason))
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
                .setInputData(workDataOf(KEY_FILES to encodeRefs(refs)))
                .build()
    }
}

/** Met un pack en file de téléchargement ; un pack déjà en file garde son tour. */
interface PackDownloadScheduler {
    fun enqueue(slug: String, refs: List<PackAssetRef>, reason: PackQueueReason)
    fun cancel(slug: String)
}

class WorkManagerPackDownloadScheduler @Inject constructor(
    private val workManager: WorkManager,
) : PackDownloadScheduler {
    override fun enqueue(slug: String, refs: List<PackAssetRef>, reason: PackQueueReason) {
        workManager.enqueueUniqueWork(PackDownloadWorker.uniqueName(slug), ExistingWorkPolicy.KEEP, PackDownloadWorker.request(refs, reason))
    }

    override fun cancel(slug: String) {
        workManager.cancelUniqueWork(PackDownloadWorker.uniqueName(slug))
    }
}
