package me.meeshy.sdk.share

import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import me.meeshy.sdk.model.share.ShareSearchResults
import me.meeshy.sdk.model.share.ShareSheetState
import java.util.concurrent.atomic.AtomicInteger

/**
 * **La session de recherche de la feuille de partage** (#14774) — miroir de `ShareSheetViewModel.search`
 * (iOS). Le texte tapé est publié à chaque frappe (le filtre local le suit sans attendre) ; dès deux
 * caractères, et après [debounceMillis] sans nouvelle frappe, la recherche serveur s'y fusionne.
 *
 * Une réponse dont le jeton n'est plus courant est rejetée en silence ; un texte trop court remet les
 * résultats serveur à zéro. Hors ligne, [search] rend le vide : le local seul reste affiché.
 */
class ShareRecipientSearchSession(
    private val search: suspend (String) -> ShareSearchResults,
    private val debounceMillis: Long = DEBOUNCE_MILLIS,
) {
    data class State(val query: String = "", val results: ShareSearchResults? = null)

    private val token = AtomicInteger()
    private val mutable = MutableStateFlow(State())
    val state: StateFlow<State> = mutable.asStateFlow()

    suspend fun onQuery(text: String) {
        val mine = token.incrementAndGet()
        val trimmed = text.trim()
        if (trimmed.length < ShareSheetState.SEARCH_MINIMUM_LENGTH) {
            mutable.value = State(query = text, results = null)
            return
        }
        mutable.update { it.copy(query = text) }
        delay(debounceMillis)
        if (mine != token.get()) return
        val found = search(trimmed)
        if (mine != token.get()) return
        mutable.update { it.copy(results = found) }
    }

    companion object {
        const val DEBOUNCE_MILLIS: Long = 300L
    }
}
