package me.meeshy.sdk.link

import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.link.TrackedLinkOutcome
import me.meeshy.sdk.model.link.TrackedLinkOutcomes
import me.meeshy.sdk.net.NetworkResult

/** Ce que la résolution d'un `/l/<jeton>` rend à la racine. */
sealed interface TrackedLinkResolution {
    data class Resolved(val outcome: TrackedLinkOutcome) : TrackedLinkResolution

    /** Le serveur a refusé ([httpStatus] 404, 410, 403…) ou n'a pas été joint (`null`). */
    data class Failed(val httpStatus: Int?) : TrackedLinkResolution
}

/**
 * Résout un lien de suivi HORS du chemin de navigation (iOS `DeepLinkRouter.resolveTrackedLink`) : le clic est
 * compté À CÔTÉ de la résolution, jamais devant elle, puis la cible typée devient une destination de l'app.
 */
@Singleton
class TrackedLinkResolver @Inject constructor(
    private val repository: TrackedLinkRepository,
) {
    suspend fun resolve(token: String, environmentWebOrigin: String): TrackedLinkResolution = coroutineScope {
        launch { repository.recordClick(token) }
        when (val result = repository.resolve(token)) {
            is NetworkResult.Success ->
                TrackedLinkResolution.Resolved(TrackedLinkOutcomes.outcome(result.data, token, environmentWebOrigin))
            is NetworkResult.Failure -> TrackedLinkResolution.Failed(result.error.httpStatus)
        }
    }
}
