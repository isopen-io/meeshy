package me.meeshy.app.navigation

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.app.conversations.ConversationLockPinSheet
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Affiche la feuille de code avant tout contenu quand la conversation est verrouillee ; [content]
 * (le fil, ses ViewModels, la presence « ici ») n'est compose qu'une fois la conversation admise.
 * Fermer la feuille quitte l'ecran : rien ne reste arme (recherche demandee abandonnee avec le code).
 */
@Composable
fun ChatLockGate(
    conversationId: String,
    onBack: () -> Unit,
    viewModel: ChatLockGateViewModel = hiltViewModel(),
    content: @Composable () -> Unit,
) {
    val initial = remember(conversationId) { viewModel.isAdmitted(conversationId) }
    val admittedFlow = remember(conversationId) { viewModel.admitted(conversationId) }
    val admitted by admittedFlow.collectAsStateWithLifecycle(initialValue = initial)
    if (admitted) {
        content()
        return
    }
    LaunchedEffect(conversationId) { viewModel.loadName(conversationId) }
    val prompt by viewModel.prompt.collectAsStateWithLifecycle()
    val name by viewModel.conversationName.collectAsStateWithLifecycle()
    Box(modifier = Modifier.fillMaxSize().background(MeeshyTheme.tokens.backgroundPrimary))
    ConversationLockPinSheet(
        prompt = prompt ?: viewModel.promptFor(conversationId),
        conversationName = name,
        onDigit = { viewModel.onDigit(conversationId, it) },
        onDelete = { viewModel.onDelete(conversationId) },
        onDismiss = onBack,
    )
}
