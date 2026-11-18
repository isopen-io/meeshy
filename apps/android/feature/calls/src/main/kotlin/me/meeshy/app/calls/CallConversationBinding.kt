package me.meeshy.app.calls

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.flow.update
import me.meeshy.sdk.model.call.CallConversationChanged
import me.meeshy.sdk.model.call.CallState
import me.meeshy.sdk.socket.CallSocialSignalManager

/**
 * La conversation où vit l'appel [callId]. [originConversationId] n'est posé qu'une fois l'appel rattaché au
 * groupe des présents (#19650) : c'est le tête-à-tête d'origine, qui reste intact.
 */
data class CallConversationBound(
    val callId: String = "",
    val conversationId: String = "",
    val originConversationId: String? = null,
) {
    val isRebranched: Boolean get() = originConversationId != null

    companion object {
        val NONE = CallConversationBound()
    }
}

/** Les deux décisions de la conversation d'un appel, pures. */
object CallConversationSwitch {
    /** La bascule ne vaut que pour l'appel lié, vers une autre conversation ; sinon `null`, rien ne change. */
    fun switched(bound: CallConversationBound, event: CallConversationChanged): CallConversationBound? {
        if (event.callId.isBlank() || event.callId != bound.callId) return null
        if (event.conversationId.isBlank() || event.conversationId == bound.conversationId) return null
        return CallConversationBound(
            callId = event.callId,
            conversationId = event.conversationId,
            originConversationId = bound.originConversationId ?: event.previousConversationId.ifBlank { bound.conversationId },
        )
    }

    /** Une transition du MÊME appel garde sa bascule ; tout autre appel repart de sa configuration. */
    fun bound(current: CallConversationBound, callId: String, configured: String): CallConversationBound =
        if (callId.isNotBlank() && callId == current.callId && current.isRebranched) current else CallConversationBound(callId, configured)
}

/**
 * LE porteur de la conversation de l'appel en cours (#19650). Le maillage, les sous-titres, ma parole, l'enregistrement
 * et le cadre en direct la lisent ici, jamais dans leur copie de [CallConfig.conversationId] : une bascule vers le
 * groupe des présents les atteint tous à la fois, sans couper le média.
 *
 * [bind] est idempotent : chaque collaborateur peut lier l'appel à sa transition, l'ordre des contrôleurs n'y change
 * rien. Une configuration n'est jamais réécrite : [CallConfig] reste l'appel tel que composé (« Réessayer » rappelle
 * le tête-à-tête).
 */
@Singleton
class CallConversationBinding @Inject constructor() {
    private val _bound = MutableStateFlow(CallConversationBound.NONE)
    val bound: StateFlow<CallConversationBound> = _bound.asStateFlow()

    private val _conversationId = MutableStateFlow("")

    /** La conversation de l'appel en cours, vide hors appel. */
    val conversationId: StateFlow<String> = _conversationId.asStateFlow()

    val current: String get() = _bound.value.conversationId

    fun bind(session: CallSessionInfo) = set { CallConversationSwitch.bound(it, session.callId, session.config.conversationId) }

    /** `true` quand la bascule a déplacé l'appel lié. */
    fun apply(event: CallConversationChanged): Boolean {
        var moved = false
        set { current -> CallConversationSwitch.switched(current, event)?.also { moved = true } ?: current }
        return moved
    }

    fun clear() = set { CallConversationBound.NONE }

    private fun set(next: (CallConversationBound) -> CallConversationBound) {
        _bound.update(next)
        _conversationId.value = _bound.value.conversationId
    }
}

/** Lie la conversation à l'appel avant tout autre contrôleur, suit la bascule pendant l'appel, l'oublie à sa fin. */
@Singleton
class CallConversationBindingController internal constructor(
    private val binding: CallConversationBinding,
    private val changes: Flow<CallConversationChanged>,
    private val scope: CoroutineScope,
) : CallFeatureController {
    @Inject
    constructor(binding: CallConversationBinding, social: CallSocialSignalManager) :
        this(binding, social.conversationChanged, CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate))

    override val order: Int get() = Int.MIN_VALUE

    private var listening: Job? = null

    override fun onTransition(previous: CallState, next: CallState, session: CallSessionInfo) {
        when (next) {
            is CallState.Ended, CallState.Idle -> end()
            else -> {
                binding.bind(session)
                if (listening == null) listening = changes.onEach { binding.apply(it) }.launchIn(scope)
            }
        }
    }

    override fun onCleared() = end()

    private fun end() {
        listening?.cancel()
        listening = null
        binding.clear()
    }
}

@Module
@InstallIn(SingletonComponent::class)
interface CallConversationBindingModule {
    @Binds
    @IntoSet
    fun bindFeatureController(impl: CallConversationBindingController): CallFeatureController
}
