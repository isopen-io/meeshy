package me.meeshy.app.navigation

import android.os.SystemClock
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import me.meeshy.app.auth.AuthViewModel
import me.meeshy.sdk.model.rootnav.RootSplashGate

/**
 * Porte le rideau de demarrage au niveau de l'Activity : il survit a une rotation (le splash ne
 * rejoue pas) et son plafond vit dans SA coroutine, jamais dans la chaine de demarrage qu'il borne.
 */
@HiltViewModel
class RootSplashViewModel @Inject constructor() : ViewModel() {
    private val start = SystemClock.elapsedRealtime()

    val gate: RootSplashGate = RootSplashGate(elapsedMs = { SystemClock.elapsedRealtime() - start })

    init {
        viewModelScope.launch { gate.holdUntilCeiling() }
    }

    /** Le demarrage a resolu la session : le rideau se leve des que le plancher est passe. */
    fun markReady() {
        viewModelScope.launch { gate.markReady() }
    }
}

/** Le rideau courant, lu par la racine (opacite du contenu) et par [SplashOverlay]. `null` hors racine. */
val LocalRootSplashGate = compositionLocalOf<RootSplashGate?> { null }

@Composable
fun ProvideRootSplash(content: @Composable () -> Unit) {
    val viewModel: RootSplashViewModel = hiltViewModel()
    // Le rideau tient le temps que la session sauvegardée hors de l'app soit renouvelée (#14058), borné par
    // son plafond : l'écran de connexion ne clignote pas avant l'ouverture connectée.
    val auth: AuthViewModel = hiltViewModel()
    val restoring by remember(auth) { auth.state.map { it.isRestoringSession }.distinctUntilChanged() }
        .collectAsStateWithLifecycle(initialValue = auth.state.value.isRestoringSession)
    LaunchedEffect(restoring) { if (!restoring) viewModel.markReady() }
    CompositionLocalProvider(LocalRootSplashGate provides viewModel.gate, content = content)
}
