package me.meeshy.app.startup

import androidx.lifecycle.ViewModel
import dagger.hilt.android.lifecycle.HiltViewModel
import me.meeshy.app.navigation.graph.NavGraphContributor
import javax.inject.Inject

/** Les points d'extension de la coque, ordonnes de facon deterministe. */
class AppExtensions(
    overlays: Collection<AppOverlay>,
    localsProviders: Collection<AppLocalsProvider>,
    val graphContributors: List<NavGraphContributor>,
) {
    val overlays: List<AppOverlay> =
        overlays.sortedWith(compareBy<AppOverlay> { it.order }.thenBy { it.javaClass.name })
    val localsProviders: List<AppLocalsProvider> =
        localsProviders.sortedWith(compareBy<AppLocalsProvider> { it.order }.thenBy { it.javaClass.name })
}

@HiltViewModel
class AppExtensionsViewModel @Inject constructor(
    overlays: Set<@JvmSuppressWildcards AppOverlay>,
    localsProviders: Set<@JvmSuppressWildcards AppLocalsProvider>,
    graphContributors: Set<@JvmSuppressWildcards NavGraphContributor>,
) : ViewModel() {
    val extensions = AppExtensions(
        overlays = overlays,
        localsProviders = localsProviders,
        graphContributors = graphContributors.sortedBy { it.javaClass.name },
    )
}
