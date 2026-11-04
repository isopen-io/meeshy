package me.meeshy.app.chat

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ComposerClosure
import me.meeshy.sdk.model.ConversationWriteRestriction
import me.meeshy.sdk.model.composerClosure
import me.meeshy.sdk.model.conversationlist.ConversationRowMenuCapabilities
import me.meeshy.sdk.model.knownUserRole
import me.meeshy.sdk.session.SessionRepository

/**
 * Ce que le rang du lecteur et le type de la conversation lui permettent (#15269) : la loi
 * [me.meeshy.sdk.model.ConversationActionPolicy] projetée sur le fil ouvert (feuille de réglages, fiche des membres) et ce
 * qui ferme son composeur (conversation terminée, Global avant 18 ans). Le fil lit [capabilities] et [composerClosure] ;
 * aucun écran ne recompose une liste de rôles.
 *
 * Une restriction d'écriture est aussi APPRISE d'un envoi refusé (403 `GLOBAL_ADULTS_ONLY`, définitif) : la bulle échouée
 * en porte la raison, et le composeur cède aussitôt la place au bandeau, sans attendre que la conversation la serve.
 */
class ConversationGovernanceController @Inject constructor(
    private val conversationRepository: ConversationRepository,
    private val sessionRepository: SessionRepository,
) : ChatController {

    private val served = MutableStateFlow<ApiConversation?>(null)
    private val learned = MutableStateFlow<ConversationWriteRestriction?>(null)

    private val _composerClosure = MutableStateFlow<ComposerClosure?>(null)
    val composerClosure: StateFlow<ComposerClosure?> = _composerClosure.asStateFlow()

    private val _capabilities = MutableStateFlow<ConversationRowMenuCapabilities?>(null)
    val capabilities: StateFlow<ConversationRowMenuCapabilities?> = _capabilities.asStateFlow()

    private val _viewerRole = MutableStateFlow<String?>(null)

    /**
     * Le rôle CONNU du lecteur dans ce fil (`MemberRole.name`, [knownUserRole]) — la garde de rôle du cache de la fiche
     * d'un participant (ADR-032) ; `null` avant le chargement ou quand rien ne le dit, et alors aucune copie n'est peinte.
     */
    val viewerRole: StateFlow<String?> = _viewerRole.asStateFlow()

    override fun attach(host: ChatControllerHost) {
        host.scope.launch {
            conversationRepository.conversationStream(host.conversationId).collect { conversation ->
                served.value = conversation
                publish()
            }
        }
        host.scope.launch {
            host.messages.collect { messages ->
                val restriction = messages.firstNotNullOfOrNull { ConversationWriteRestriction.fromReason(it.lastError) }
                if (restriction != null && learned.value != restriction) {
                    learned.update { restriction }
                    publish()
                }
            }
        }
    }

    private fun publish() {
        val conversation = served.value
        _composerClosure.value = conversation?.composerClosure(learned.value) ?: learned.value?.takeIf { it.closesComposer }?.let { ComposerClosure.MINOR_GLOBAL }
        val user = sessionRepository.currentUser.value
        _capabilities.value = conversation?.let { ConversationRowMenuCapabilities.forViewer(it, user) }
        _viewerRole.value = conversation?.knownUserRole(user?.id)?.name
    }
}

@Module
@InstallIn(SingletonComponent::class)
abstract class ConversationGovernanceControllerModule {

    @Binds
    @IntoSet
    abstract fun controller(impl: ConversationGovernanceController): ChatController
}
