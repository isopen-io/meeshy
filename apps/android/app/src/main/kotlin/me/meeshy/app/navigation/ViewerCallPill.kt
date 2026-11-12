package me.meeshy.app.navigation

import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavHostController
import me.meeshy.app.calls.CallHeaderNamesViewModel
import me.meeshy.app.calls.CallScreenShareViewModel
import me.meeshy.app.calls.CallViewModel
import me.meeshy.ui.component.viewer.LocalViewerTopOverlay
import me.meeshy.ui.theme.MeeshySpacing

/**
 * P18.8 (`docs/product/appels-vue-finale.md`) — l'appel réduit reste atteignable au-dessus des visionneuses image, vidéo et
 * média. Elles sont des `Dialog` : une fenêtre à part qui recouvre celle de l'application, pastille comprise. La pastille
 * se redessine donc DANS leur fenêtre ([LocalViewerTopOverlay]), tant que l'appel est réduit ([shown]).
 *
 * Les modèles de vue sont pris ICI, à la racine, comme ceux de la pastille de l'application : une pastille composée dans la
 * fenêtre d'une visionneuse lirait sinon ceux de l'écran qui l'héberge. Un seul état d'appel, une seule pastille à la fois.
 */
@Composable
internal fun ProvideViewerCallPill(
    callViewModel: CallViewModel,
    navController: NavHostController,
    shown: Boolean,
    content: @Composable () -> Unit,
) {
    val screenShare: CallScreenShareViewModel = hiltViewModel()
    val namesSource: CallHeaderNamesViewModel = hiltViewModel()
    val pill = remember<@Composable () -> Unit>(callViewModel, navController, screenShare, namesSource) {
        {
            MinimizedCallPill(
                callViewModel = callViewModel,
                navController = navController,
                modifier = Modifier.statusBarsPadding().padding(vertical = MeeshySpacing.xs),
                screenShare = screenShare,
                namesSource = namesSource,
            )
        }
    }
    CompositionLocalProvider(LocalViewerTopOverlay provides if (shown) pill else null, content = content)
}
