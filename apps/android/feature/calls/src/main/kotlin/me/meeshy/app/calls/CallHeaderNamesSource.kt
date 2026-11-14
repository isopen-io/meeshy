package me.meeshy.app.calls

import androidx.compose.runtime.Composable
import androidx.compose.runtime.State
import androidx.compose.runtime.produceState
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import me.meeshy.sdk.model.call.CallHeaderNames

/** #17341 — porte jusqu'à l'écran les noms que la capsule de l'en-tête lit dans la conversation en cache. */
@HiltViewModel
class CallHeaderNamesViewModel @Inject constructor(
    private val resolver: CallFrameTextsResolver,
) : ViewModel() {
    suspend fun names(conversationId: String?): CallHeaderNames = resolver.headerNames(conversationId, knownGroupTitle = null)
}

/**
 * Le nom donné (duo) ou le nom du groupe, CACHE-FIRST : vide tant que le cache n'a pas répondu, jamais de requête. L'appel
 * réduit (P18.10) les lit aussi ; composé dans la fenêtre d'une visionneuse, il reçoit le [viewModel] pris à la racine.
 */
@Composable
fun rememberCallHeaderNames(
    conversationId: String?,
    viewModel: CallHeaderNamesViewModel = hiltViewModel(),
): State<CallHeaderNames> {
    return produceState(CallHeaderNames(givenName = null, groupName = null), conversationId) {
        value = viewModel.names(conversationId)
    }
}
