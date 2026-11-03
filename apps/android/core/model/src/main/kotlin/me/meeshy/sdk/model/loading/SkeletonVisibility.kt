package me.meeshy.sdk.model.loading

import me.meeshy.sdk.model.cache.LoadState

/**
 * Miroir de `SkeletonVisibilityResolver` (iOS) : le squelette n'apparait que sur cache VIDE pendant un chargement
 * reel. Un cache perime compte comme donnee et se peint tout de suite.
 */
public object SkeletonVisibility {
    public fun shouldShow(loadState: LoadState, hasCachedData: Boolean): Boolean =
        !hasCachedData && loadState is LoadState.Loading

    public fun shouldShow(isLoading: Boolean, hasCachedData: Boolean): Boolean =
        !hasCachedData && isLoading
}

/** Ce que fait reellement le contenu derriere un placeholder (iOS `LoadingSheenPhase`). */
public enum class LoadingSheenPhase { LOADING, FAILED, DEFERRED }

/** Loi pure du reflet (iOS `LoadingSheenLaw`). */
public object LoadingSheenLaw {
    /** Seul un chargement reel anime, et jamais sous « Reduire les animations ». */
    public fun animates(phase: LoadingSheenPhase, reduceMotion: Boolean): Boolean =
        phase == LoadingSheenPhase.LOADING && !reduceMotion

    /** L'echec l'emporte sur la retenue : une requete partie puis tombee n'attend plus un geste. */
    public fun phase(hasUrl: Boolean, fetchDeferredByPolicy: Boolean, fetchFailed: Boolean): LoadingSheenPhase = when {
        !hasUrl || fetchFailed -> LoadingSheenPhase.FAILED
        fetchDeferredByPolicy -> LoadingSheenPhase.DEFERRED
        else -> LoadingSheenPhase.LOADING
    }
}
