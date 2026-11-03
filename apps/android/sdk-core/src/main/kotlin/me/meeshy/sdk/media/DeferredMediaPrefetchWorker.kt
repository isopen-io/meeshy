package me.meeshy.sdk.media

import android.content.Context
import androidx.hilt.work.HiltWorker
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject
import me.meeshy.sdk.model.media.AttachmentDownloadEvent
import me.meeshy.sdk.model.mediacache.MediaCacheCategory
import me.meeshy.sdk.model.mediacache.MediaCacheKey
import me.meeshy.sdk.model.mediacache.MediaTransferProfile
import javax.inject.Inject

/** Reprend un préchargement différé dès que le réseau n'est plus facturé, par le MÊME registre que les taps. */
@HiltWorker
class DeferredMediaPrefetchWorker @AssistedInject constructor(
    @Assisted context: Context,
    @Assisted params: WorkerParameters,
    private val center: AttachmentDownloadCenter,
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        val url = inputData.getString(KEY_URL).orEmpty()
        val category = runCatching { MediaCacheCategory.valueOf(inputData.getString(KEY_CATEGORY).orEmpty()) }.getOrNull()
        if (url.isEmpty() || category == null) return Result.failure()
        val key = center.key(url)
        center.prefetch(url, inputData.getLong(KEY_SIZE, 0L), category, MediaTransferProfile.prefetch(meteredAllowed = false))
        return when (val end = center.awaitEnd(key)) {
            is AttachmentDownloadEvent.Failed -> if (end.gone) Result.success() else Result.retry()
            else -> Result.success()
        }
    }

    companion object {
        const val KEY_URL = "url"
        const val KEY_SIZE = "size"
        const val KEY_CATEGORY = "category"

        fun uniqueName(url: String): String = "media-prefetch-" + MediaCacheKey.of(url)
    }
}

class WorkManagerDeferredMediaScheduler @Inject constructor(
    private val workManager: WorkManager,
) : DeferredMediaScheduler {
    override fun scheduleUnmetered(url: String, expectedSize: Long, category: MediaCacheCategory) {
        val request = OneTimeWorkRequestBuilder<DeferredMediaPrefetchWorker>()
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.UNMETERED).build())
            .setInputData(
                workDataOf(
                    DeferredMediaPrefetchWorker.KEY_URL to url,
                    DeferredMediaPrefetchWorker.KEY_SIZE to expectedSize,
                    DeferredMediaPrefetchWorker.KEY_CATEGORY to category.name,
                ),
            )
            .build()
        workManager.enqueueUniqueWork(DeferredMediaPrefetchWorker.uniqueName(url), ExistingWorkPolicy.KEEP, request)
    }
}
