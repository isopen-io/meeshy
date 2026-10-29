package me.meeshy.app.chat.conversationcard

import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Stable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.link.LinkCacheRepository
import me.meeshy.sdk.model.auth.ServerEnvironmentResolver
import me.meeshy.sdk.model.conversationcard.ConversationCardActions
import me.meeshy.sdk.model.conversationcard.ConversationCardResolution
import me.meeshy.sdk.model.conversationcard.ConversationLinkCardState
import me.meeshy.sdk.model.deeplink.ConversationCardTarget
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.sharelink.ShareLinkJoinRepository

/**
 * Ce que les cartes de conversation d'un fil savent faire (#13672) — la couture que la bulle consomme,
 * remplaçable par un double en test. Absente (aucun hôte ne la fournit), la bulle garde l'aperçu de
 * lien générique : aucune régression.
 */
@Stable
internal interface ConversationLinkCards {
    /** L'origine web de l'environnement, qui décide si une URL désigne une conversation Meeshy. */
    val webOrigin: String

    /** L'état d'une carte, servi du cache d'abord ; l'appel lance la lecture au premier abonné. */
    fun state(target: ConversationCardTarget): StateFlow<ConversationLinkCardState>

    /** Rejoindre avec le compte (`ShareLinkJoinRepository.joinAuthenticated`), puis [onJoined] avec l'id servi. */
    fun join(target: ConversationCardTarget, onJoined: (conversationId: String) -> Unit, onFailed: () -> Unit)

    /** Quitter (`ConversationRepository.leave`, le chemin du menu de la liste), optimiste et rétabli sur un refus. */
    fun leave(target: ConversationCardTarget, onDone: (succeeded: Boolean) -> Unit)
}

internal val LocalConversationLinkCards = staticCompositionLocalOf<ConversationLinkCards?> { null }

/** Monte les cartes de conversation pour le fil qu'enveloppe [content] (une instance par entrée de navigation). */
@Composable
fun ProvideConversationLinkCards(content: @Composable () -> Unit) {
    val cards: ConversationLinkCardsViewModel = hiltViewModel()
    CompositionLocalProvider(LocalConversationLinkCards provides cards, content = content)
}

/**
 * Les cartes de conversation des bulles d'un fil — miroir d'iOS `ConversationLinkCardViewModel`, une
 * entrée par cible. Toute décision (phase, boutons, optimisme, rollback) est dans
 * [ConversationLinkCardState] (`:core:model`) ; ici on ne fait que brancher le cache et les gestes.
 */
@HiltViewModel
internal class ConversationLinkCardsViewModel @Inject constructor(
    private val linkCache: LinkCacheRepository,
    private val shareLinkJoin: ShareLinkJoinRepository,
    private val conversations: ConversationRepository,
    config: MeeshyConfig,
) : ViewModel(), ConversationLinkCards {

    override val webOrigin: String =
        ServerEnvironmentResolver.webOrigin(ServerEnvironmentResolver.serverOrigin(config.apiBaseUrl))

    private val states = mutableMapOf<ConversationCardTarget, MutableStateFlow<ConversationLinkCardState>>()

    override fun state(target: ConversationCardTarget): StateFlow<ConversationLinkCardState> =
        entry(target).asStateFlow()

    override fun join(target: ConversationCardTarget, onJoined: (String) -> Unit, onFailed: () -> Unit) {
        val flow = entry(target)
        val action = flow.value.actions(target) as? ConversationCardActions.Join ?: return
        flow.value = flow.value.joinStarted(target) ?: return
        viewModelScope.launch {
            when (val result = shareLinkJoin.joinAuthenticated(action.identifier)) {
                is NetworkResult.Success -> {
                    flow.update { it.joined(result.data) }
                    (flow.value.phase as? ConversationLinkCardState.Phase.Card)?.let {
                        linkCache.storeCard(target, ConversationCardResolution.Card(it.card))
                    }
                    forgetOthers(result.data, origin = target)
                    onJoined(result.data)
                }
                is NetworkResult.Failure -> {
                    flow.update { it.joinFailed(result.error.httpStatus) }
                    onFailed()
                }
            }
        }
    }

    override fun leave(target: ConversationCardTarget, onDone: (Boolean) -> Unit) {
        val flow = entry(target)
        val action = flow.value.actions(target) as? ConversationCardActions.LeaveOrOpen ?: return
        flow.value = flow.value.leaveStarted(target) ?: return
        viewModelScope.launch {
            when (conversations.leave(action.conversationId)) {
                is NetworkResult.Success -> {
                    flow.update { it.left() }
                    linkCache.forgetCard(target)
                    forgetOthers(action.conversationId, origin = target)
                    onDone(true)
                }
                is NetworkResult.Failure -> {
                    flow.update { it.leaveFailed() }
                    onDone(false)
                }
            }
        }
    }

    private fun entry(target: ConversationCardTarget): MutableStateFlow<ConversationLinkCardState> =
        states.getOrPut(target) { MutableStateFlow(ConversationLinkCardState()).also { watch(target, it) } }

    private fun watch(target: ConversationCardTarget, flow: MutableStateFlow<ConversationLinkCardState>) {
        viewModelScope.launch {
            linkCache.card(target, onRevalidateError = { flow.update { it.refreshFailed() } }).collect { result ->
                when (result) {
                    is CacheResult.Fresh -> flow.update { it.served(result.value, isFresh = true) }
                    is CacheResult.Stale -> flow.update { it.served(result.value, isFresh = false) }
                    is CacheResult.Syncing -> result.value?.let { cached -> flow.update { it.served(cached, isFresh = false) } }
                    CacheResult.Empty -> Unit
                }
            }
        }
    }

    /** Une jonction ou un départ périme toute AUTRE carte de la même conversation (lien de partage ↔ direct, #8138). */
    private suspend fun forgetOthers(conversationId: String, origin: ConversationCardTarget) {
        states.filter { (target, flow) -> target != origin && flow.value.designates(conversationId, target) }
            .keys
            .forEach { linkCache.forgetCard(it) }
    }
}
