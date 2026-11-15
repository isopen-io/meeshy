package me.meeshy.app.chat

import android.content.Context
import android.view.inputmethod.InputMethodManager
import android.widget.Toast
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.flow.MutableStateFlow
import me.meeshy.feature.chat.R

/**
 * Les effets de coque de l'écran de conversation (iOS `ConversationBodyLifecycle` + `ConversationRouterWatch`) :
 * les demandes du routeur appliquées à chaud, l'accès retiré (toast d'erreur puis retour), la langue de composition
 * par défaut (clavier actif, jamais la locale appareil) et la mise à l'abri à `ON_STOP` (brouillon, puis crochets
 * des sous-écrans : enregistrement vers le plateau).
 */
@Composable
internal fun ChatShellEffects(
    viewModel: ChatViewModel,
    hooks: ChatLifecycleHooks,
    leave: () -> Unit,
) {
    val context = LocalContext.current
    val router = remember(viewModel) { viewModel.controllers.find<ChatRouterController>() }
    LaunchedEffect(router) {
        router?.events?.collect { event ->
            when (event) {
                is ChatRouterEvent.Highlight -> viewModel.landOnMessage(event.messageId)
                ChatRouterEvent.OpenSearch -> viewModel.openSearch()
            }
        }
    }

    val realtime = remember(viewModel) { viewModel.controllers.find<ChatRealtimeController>() }
    val realtimeState by (realtime?.state ?: NO_REALTIME).collectAsStateWithLifecycle()
    val fallbackNotice = stringResource(R.string.conversation_accessRevoked)
    LaunchedEffect(realtimeState.accessRevokedReason) {
        val reason = realtimeState.accessRevokedReason ?: return@LaunchedEffect
        Toast.makeText(context, reason.ifBlank { fallbackNotice }, Toast.LENGTH_LONG).show()
        leave()
    }

    LaunchedEffect(viewModel) { viewModel.seedComposerLanguageFromKeyboard(context.activeKeyboardLanguageTag()) }

    LifecycleEventEffect(Lifecycle.Event.ON_STOP) {
        viewModel.flushDraft()
        hooks.fireStop()
    }
}

private val NO_REALTIME = MutableStateFlow(ChatRealtimeState())

private fun Context.activeKeyboardLanguageTag(): String? = runCatching {
    getSystemService(InputMethodManager::class.java)?.currentInputMethodSubtype?.languageTag
}.getOrNull()?.takeIf { it.isNotBlank() }
