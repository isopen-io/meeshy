package me.meeshy.sdk.conversation

import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import timber.log.Timber

/** Les caches voisins de la liste qu'un tirer-pour-rafraîchir réussi invalide (iOS `invalidatePullRefreshScope`). */
enum class ListRefreshNeighbour { MESSAGES, PARTICIPANTS, STORIES, PREFERENCES, LABELS, PROFILES, TRANSLATIONS }

/**
 * Un cache voisin, contribué en `@IntoSet` par le lot qui le possède : il est invalidé (périmé,
 * relu paresseusement au prochain accès) seulement quand TOUS les rechargements du geste ont
 * réussi. Les médias n'en font jamais partie (téléchargé une fois = jamais re-téléchargé).
 */
interface ListRefreshInvalidation {
    val neighbour: ListRefreshNeighbour

    suspend fun invalidate()
}

/** Le résultat d'un geste : l'échec de chaque rechargement, dans l'ordre demandé (`null` = réussi). */
class ListRefreshOutcome(val failures: List<Throwable?>) {
    val allSucceeded: Boolean get() = failures.all { it == null }

    fun failureAt(index: Int): Throwable? = failures.getOrNull(index)
}

/**
 * Le tirer-pour-rafraîchir de la liste (miroir de iOS `pullToRefresh`) : les rechargements
 * (conversations, stories, statuts, regroupements) partent EN PARALLÈLE ; un échec n'arrête pas
 * les autres. Puis — fetch-then-replace — les caches voisins ne sont invalidés que si tout a
 * réussi : un geste hors ligne laisse chaque cache exactement comme il l'a trouvé.
 */
@Singleton
class ListRefreshCoordinator @Inject constructor(
    private val invalidations: Set<@JvmSuppressWildcards ListRefreshInvalidation>,
) {
    suspend fun refresh(reloads: List<suspend () -> Unit>): ListRefreshOutcome {
        val failures = coroutineScope {
            reloads.map { reload -> async { attempt(reload) } }.awaitAll()
        }
        val outcome = ListRefreshOutcome(failures)
        if (outcome.allSucceeded) invalidateNeighbours()
        return outcome
    }

    private suspend fun attempt(reload: suspend () -> Unit): Throwable? =
        try {
            reload()
            null
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            e
        }

    private suspend fun invalidateNeighbours() {
        invalidations.sortedBy { it.neighbour.ordinal }.forEach { invalidation ->
            try {
                invalidation.invalidate()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                Timber.w(e, "Invalidation %s en echec", invalidation.neighbour)
            }
        }
    }
}
