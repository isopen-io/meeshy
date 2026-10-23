package me.meeshy.sdk.sync

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import me.meeshy.sdk.model.sync.PageFetchPlan

/**
 * Le réessai par page et le chargement parallèle — miroir de `fetchPageWithRetry` et du groupe de
 * tâches de `ConversationSyncEngine+Chargement.swift`. Le plan (bornes, attentes) est pur et vit
 * dans [PageFetchPlan] ; ce fichier n'y ajoute que la coroutine.
 */
internal suspend fun <T> fetchPageWithRetry(
    waitMillis: suspend (Long) -> Unit = { delay(it) },
    block: suspend () -> T,
): Result<T> {
    var attempt = 0
    while (true) {
        try {
            return Result.success(block())
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (failure: Exception) {
            if (!PageFetchPlan.shouldRetry(attempt)) return Result.failure(failure)
            waitMillis(PageFetchPlan.retryDelayMillis(attempt))
            attempt += 1
        }
    }
}

/**
 * Charge [pages] avec au plus [maxParallel] requêtes en vol. Rend les pages LIVRÉES ; une page
 * perdue après ses réessais n'interrompt jamais les autres, elle manque simplement au résultat
 * (voir [PageFetchPlan.droppedPages]).
 */
internal suspend fun <T> fetchPagesInParallel(
    pages: List<Int>,
    maxParallel: Int = PageFetchPlan.MAX_PARALLEL,
    waitMillis: suspend (Long) -> Unit = { delay(it) },
    fetch: suspend (Int) -> T,
): Map<Int, T> = coroutineScope {
    val permits = Semaphore(maxParallel)
    pages.map { page ->
        async {
            permits.withPermit { page to fetchPageWithRetry(waitMillis) { fetch(page) }.getOrNull() }
        }
    }.awaitAll().mapNotNull { (page, value) -> value?.let { page to it } }.toMap()
}
