package me.meeshy.app.chat

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import javax.inject.Inject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import me.meeshy.sdk.conversation.ConversationAnalysisRepository
import me.meeshy.sdk.model.ConversationAnalysisProjection
import me.meeshy.sdk.model.reading.summary.LivingSummaryAgentGate
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.session.AnonymousSessionStore
import me.meeshy.sdk.session.SessionRepository

/**
 * L'enrichissement de l'agent du Résumé vivant : `null` tant qu'aucune réponse n'est arrivée,
 * et il le reste pour un invité, en conversation chiffrée de bout en bout ou en erreur — le
 * digest déterministe, calculé sur l'appareil, est le plancher, définitivement (aucun message
 * d'erreur : le panneau est simplement absent). Portée : la conversation ENTIÈRE, jamais
 * mélangée aux comptes du digest.
 */
data class LivingSummaryAgentState(
    val text: String? = null,
    val isRefreshing: Boolean = false,
)

/**
 * Le côté « réseau et identité » du Résumé vivant — miroir de `LivingSummaryViewModel
 * .refreshAgentEnrichment` (iOS) et du site de montage `ConversationSummaryLayer` : l'identité du
 * lecteur (inscrit : son id ; invité : son participantId) et l'unique appel asynchrone, repris en
 * arrière-plan à chaque entrée dans le mode, sans jamais bloquer le rendu.
 */
class LivingSummaryController @Inject constructor(
    private val analysis: ConversationAnalysisRepository,
    private val sessionRepository: SessionRepository,
    private val anonymousSessionStore: AnonymousSessionStore,
) : ChatController {

    private val _agent = MutableStateFlow(LivingSummaryAgentState())
    val agent: StateFlow<LivingSummaryAgentState> = _agent.asStateFlow()

    private val _viewer = MutableStateFlow<SummaryViewer?>(null)
    val viewer: StateFlow<SummaryViewer?> = _viewer.asStateFlow()

    private var host: ChatControllerHost? = null
    private var isGuest = false
    private var refresh: Job? = null

    override fun attach(host: ChatControllerHost) {
        this.host = host
        host.scope.launch {
            val guest = try {
                anonymousSessionStore.load()?.takeIf { it.conversationId == host.conversationId }
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                null
            }
            isGuest = guest != null
            _viewer.value = guest?.let { SummaryViewer(it.participantId, username = null) }
                ?: sessionRepository.currentUser.value?.let { SummaryViewer(it.id, it.username) }
        }
    }

    /** Relance l'enrichissement de l'agent ; sans effet pour un invité ou en chiffré de bout en bout. */
    fun refreshAgent() {
        val host = host ?: return
        val endToEnd = host.uiState.value.isEndToEnd
        if (!LivingSummaryAgentGate.mayAsk(isGuest = isGuest, isEndToEnd = endToEnd)) return
        if (refresh?.isActive == true) return
        refresh = host.scope.launch {
            _agent.value = _agent.value.copy(isRefreshing = true)
            val text = when (val result = analysis.fetchAnalysis(host.conversationId)) {
                is NetworkResult.Success -> ConversationAnalysisProjection.summary(result.data)?.text?.takeIf { it.isNotBlank() }
                else -> null
            }
            _agent.value = LivingSummaryAgentState(text = text, isRefreshing = false)
        }
    }
}

@Module
@InstallIn(SingletonComponent::class)
abstract class LivingSummaryModule {

    @Binds
    @IntoSet
    abstract fun controller(impl: LivingSummaryController): ChatController
}

/** Aucun Résumé résolu (tests, aperçus, contrôleur absent). */
internal val NO_SUMMARY_AGENT: StateFlow<LivingSummaryAgentState> = MutableStateFlow(LivingSummaryAgentState())
internal val NO_SUMMARY_VIEWER: StateFlow<SummaryViewer?> = MutableStateFlow(null)
