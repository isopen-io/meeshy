package me.meeshy.sdk.media

import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit

/**
 * Téléverse un lot EN PARALLÈLE BORNÉ et rend les résultats dans l'ordre des ENTRÉES, jamais dans l'ordre où les envois
 * finissent (miroir d'iOS `OrderedParallelUpload`) : l'ordre des entrées est celui du composeur, que la passerelle fait rang de
 * pièce (`attachmentIds`). La première exception annule les frères et remonte.
 */
internal object OrderedParallelUpload {
    const val DEFAULT_PARALLELISM = 3
    const val MAX_PARALLELISM = 4

    suspend fun <I, O> run(
        items: List<I>,
        parallelism: Int = DEFAULT_PARALLELISM,
        upload: suspend (index: Int, item: I) -> O,
    ): List<O> = coroutineScope {
        val pool = Semaphore(parallelism.coerceIn(1, MAX_PARALLELISM))
        items.mapIndexed { index, item -> async { pool.withPermit { upload(index, item) } } }.awaitAll()
    }
}
