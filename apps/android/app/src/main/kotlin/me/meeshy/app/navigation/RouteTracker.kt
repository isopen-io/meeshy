package me.meeshy.app.navigation

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/** Une page de la pile telle que la voit le suivi : l'identité de l'entrée, son motif et sa route RÉSOLUE. */
internal data class TrackedRoute(val entryId: String, val pattern: String?, val route: String)

/**
 * **Le suivi de route** (iOS `Router.path.didSet` → `AnalyticsManager.trackRoute`) : chaque changement de destination
 * y passe, une fois. Il tient aussi le miroir de la pile en routes résolues, que [AppNavigator] lit pour appliquer
 * la règle de hub — le miroir est un indice : l'opération réelle sur la pile (`popBackStack`) dit si le hub y est.
 *
 * Fil principal uniquement (c'est l'écouteur de destination du contrôleur qui l'alimente).
 */
internal class RouteTracker(private val onTrack: (route: String) -> Unit = {}) {
    private val tracked = mutableListOf<TrackedRoute>()
    private val _current = MutableStateFlow<String?>(null)

    /** La route résolue de l'écran courant ; `null` avant la première destination. */
    val current: StateFlow<String?> = _current.asStateFlow()

    val stack: List<TrackedRoute> get() = tracked.toList()

    val resolvedStack: List<String> get() = tracked.map { it.route }

    fun onDestinationChanged(entryId: String, pattern: String?, argument: (String) -> String?) {
        val route = resolve(pattern, argument)
        val existing = tracked.indexOfFirst { it.entryId == entryId }
        // Un retour : tout ce qui est au-dessus de l'entrée retrouvée est parti.
        if (existing >= 0) tracked.subList(existing + 1, tracked.size).clear() else tracked += TrackedRoute(entryId, pattern, route)
        if (_current.value == route) return
        _current.value = route
        onTrack(pattern ?: route)
    }

    companion object {
        private val placeholder = Regex("\\{([^}]+)\\}")

        /**
         * Remplace chaque `{argument}` du motif par sa valeur ; un couple `clé={argument}` de la requête dont la valeur
         * manque disparaît (`chat/{id}?messageId={messageId}` sans message est `chat/42`).
         */
        fun resolve(pattern: String?, argument: (String) -> String?): String {
            if (pattern == null) return ""
            val path = pattern.substringBefore('?')
            val query = pattern.substringAfter('?', "")
            val resolvedPath = placeholder.replace(path) { argument(it.groupValues[1]).orEmpty() }
            val resolvedQuery = query.split('&').filter { it.isNotEmpty() }.mapNotNull { pair ->
                val value = placeholder.find(pair)?.let { argument(it.groupValues[1]) }
                when {
                    placeholder.containsMatchIn(pair) && value.isNullOrEmpty() -> null
                    else -> placeholder.replace(pair) { argument(it.groupValues[1]).orEmpty() }
                }
            }
            return if (resolvedQuery.isEmpty()) resolvedPath else "$resolvedPath?${resolvedQuery.joinToString("&")}"
        }
    }
}
