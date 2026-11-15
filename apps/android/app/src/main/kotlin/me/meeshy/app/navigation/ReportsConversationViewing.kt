package me.meeshy.app.navigation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.remember
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.LocalLifecycleOwner
import dagger.hilt.android.lifecycle.HiltViewModel
import me.meeshy.sdk.socket.ConversationViewingBinding
import me.meeshy.sdk.socket.ConversationViewingReporter
import javax.inject.Inject

/** Porte les singletons « est dans la conversation » aux composables, sans les exposer au graphe. */
@HiltViewModel
class ConversationViewingViewModel @Inject constructor(
    val reporter: ConversationViewingReporter,
    val binding: ConversationViewingBinding,
) : ViewModel()

/**
 * « Est dans la conversation » (#8892, #9052) : l'ecran de la conversation rapporte sa VISIBILITE.
 * `viewing:start` part quand il est RESUMED (et l'app au premier plan, ce que le reporter tient) ;
 * `viewing:stop` quand un ecran le couvre (pile de navigation, appel), que l'app passe en
 * arriere-plan ou que l'ecran se ferme. Pose chez l'hote de navigation de la conversation, jamais
 * sur un apercu : un apercu ne fait pas entrer dans la conversation. Miroir de
 * `ConversationViewingVisibilityModifier` (iOS).
 */
@Composable
fun ReportsConversationViewing(
    conversationId: String,
    viewModel: ConversationViewingViewModel = hiltViewModel(),
) {
    val lifecycleOwner = LocalLifecycleOwner.current
    val reporter = viewModel.reporter
    DisposableEffect(conversationId, lifecycleOwner) {
        var appeared = false
        fun settle() {
            if (!appeared) return
            appeared = false
            reporter.screenDisappeared(conversationId)
        }
        fun resume() {
            if (appeared) return
            appeared = true
            reporter.screenAppeared(conversationId)
        }
        reporter.conversationOpened(conversationId)
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) resume()
            if (event == Lifecycle.Event.ON_PAUSE) settle()
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
            settle()
            reporter.conversationClosed(conversationId)
        }
    }
}

/**
 * Un plein ecran presente DEPUIS la conversation (galerie, visionneuse, camera, editeur) la couvre
 * tant qu'il est monte : l'activite part avec `focus`. A poser dans le contenu presente.
 */
@Composable
fun CoversConversationViewing(viewModel: ConversationViewingViewModel = hiltViewModel()) {
    val reporter = remember(viewModel) { viewModel.reporter }
    DisposableEffect(reporter) {
        reporter.coverBegan()
        onDispose { reporter.coverEnded() }
    }
}

/** L'ecran d'appel affiche en grand fait quitter la conversation tant qu'il est la. */
@Composable
fun ReportsCallScreenOverConversation(isShown: Boolean, viewModel: ConversationViewingViewModel = hiltViewModel()) {
    val reporter = remember(viewModel) { viewModel.reporter }
    DisposableEffect(reporter, isShown) {
        reporter.setCallScreenShown(isShown)
        onDispose { reporter.setCallScreenShown(false) }
    }
}
