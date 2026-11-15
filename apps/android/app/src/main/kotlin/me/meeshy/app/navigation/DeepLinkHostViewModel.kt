package me.meeshy.app.navigation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.navigation.NavHostController
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.launch

/** Le fil principal de l'exécuteur de liens : un lien qui attend le réseau ne bloque ni la racine ni le geste. */
@HiltViewModel
class DeepLinkHostViewModel @Inject constructor(
    private val dispatcher: DeepLinkDispatcher,
) : ViewModel() {
    /** `true` si la racine prend ce lien (le graphe ne le lit pas), sinon rien n'est fait et l'appelant le rejoue. */
    fun open(raw: String, navController: NavHostController): Boolean {
        if (!DeepLinkRouter.ownsLink(raw)) return false
        viewModelScope.launch { dispatcher.dispatch(raw, navController) }
        return true
    }
}
