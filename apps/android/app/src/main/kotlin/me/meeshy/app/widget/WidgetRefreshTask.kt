package me.meeshy.app.widget

/** Ce qu'une exécution du filet a fait : repeint depuis le cache, ou repeint en état déconnecté. */
internal enum class WidgetRefreshOutcome { REFRESHED, SIGNED_OUT }

/**
 * Le corps du travail périodique, sans Android : sans session, les widgets sont repeints pour
 * s'effacer (jamais le contenu du compte sortant) ; avec session, ils sont repeints depuis le cache.
 */
internal class WidgetRefreshTask(
    private val currentUserId: () -> String?,
    private val repaintAll: suspend () -> Unit,
) {
    suspend fun run(): WidgetRefreshOutcome {
        val signedIn = !currentUserId().isNullOrBlank()
        repaintAll()
        return if (signedIn) WidgetRefreshOutcome.REFRESHED else WidgetRefreshOutcome.SIGNED_OUT
    }
}
