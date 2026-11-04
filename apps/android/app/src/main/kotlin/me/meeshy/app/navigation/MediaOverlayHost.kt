package me.meeshy.app.navigation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.State
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavHostController
import androidx.navigation.compose.currentBackStackEntryAsState
import me.meeshy.app.audio.MiniPlayerUiEffect
import me.meeshy.app.audio.MiniPlayerUiEvent
import me.meeshy.app.audio.MiniPlayerViewModel
import me.meeshy.app.chat.ChatViewModel
import me.meeshy.sdk.model.playback.MiniPlayerVisibility
import me.meeshy.ui.component.audio.MiniAudioPlayerBar
import me.meeshy.ui.component.audio.MiniAudioPlayerBarModel
import me.meeshy.ui.theme.hexColor

/**
 * Le point d'appel UNIQUE des calques media poses par-dessus la navigation (lecteur plein ecran persistant).
 * Le mini-lecteur n'est pas un calque : il POUSSE la destination, comme la pastille d'appel, et se monte donc dans
 * la colonne de la racine par [MediaTopBarSlot].
 */
@Suppress("UNUSED_PARAMETER")
@Composable
internal fun MediaOverlayHost(navController: NavHostController) = Unit

/**
 * Le mini-lecteur (iOS `MiniAudioPlayerBar`), dans la colonne de la racine juste SOUS la pastille d'appel. Il suit le
 * coordinateur unique de lecture, se masque dans la conversation qui joue et sous un ecran qui couvre le chrome
 * ([screenCoversChrome] : l'appel, qu'iOS presente en plein ecran par-dessus la racine), et ouvre, au toucher, la
 * conversation du vocal.
 */
@Composable
internal fun MediaTopBarSlot(
    navController: NavHostController,
    navigator: AppNavigator,
    callPillShown: Boolean,
    screenCoversChrome: Boolean = false,
    viewModel: MiniPlayerViewModel = hiltViewModel(),
) {
    val backStackEntry by navController.currentBackStackEntryAsState()
    val openConversationId = backStackEntry
        ?.takeIf { it.destination.route == Routes.CHAT }
        ?.arguments?.getString(ChatViewModel.CONVERSATION_ID_ARG)
    LaunchedEffect(openConversationId) { viewModel.onEvent(MiniPlayerUiEvent.CurrentConversation(openConversationId)) }
    LaunchedEffect(screenCoversChrome) { viewModel.onEvent(MiniPlayerUiEvent.ScreenCovered(screenCoversChrome)) }
    LaunchedEffect(viewModel, navigator) {
        viewModel.uiEffects.collect { effect ->
            when (effect) {
                is MiniPlayerUiEffect.OpenConversation ->
                    navigator.openConversation(effect.conversationId, effect.messageId.ifEmpty { null })
            }
        }
    }
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val progress by viewModel.progress.collectAsStateWithLifecycle()
    val bar = remember(state.bar) {
        state.bar?.let { MiniAudioPlayerBarModel(it.senderName, it.senderAvatarUrl, it.conversationName, hexColor(it.avatarAccentHex)) }
    }
    MiniAudioPlayerBar(
        model = bar,
        isLastBar = MiniPlayerVisibility.isLastBar(callPillShown),
        isPlaying = state.isPlaying,
        progress = { progress },
        onTogglePlay = { viewModel.onEvent(MiniPlayerUiEvent.TogglePlay) },
        onNext = { viewModel.onEvent(MiniPlayerUiEvent.Next) },
        onClose = { viewModel.onEvent(MiniPlayerUiEvent.Close) },
        onOpen = { viewModel.onEvent(MiniPlayerUiEvent.Open) },
    )
}

/** Vrai tant que la barre occupe le sommet : la destination en dessous consomme alors l'encart de la barre d'etat. */
@Composable
internal fun rememberMiniPlayerShown(viewModel: MiniPlayerViewModel = hiltViewModel()): State<Boolean> =
    viewModel.shown.collectAsStateWithLifecycle()
