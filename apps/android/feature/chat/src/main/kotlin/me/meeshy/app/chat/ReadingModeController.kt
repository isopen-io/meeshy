package me.meeshy.app.chat

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import javax.inject.Inject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.model.reading.mode.ConversationReadingMode
import me.meeshy.sdk.model.reading.mode.LensRow
import me.meeshy.sdk.model.reading.mode.OrchestratorDecision
import me.meeshy.sdk.model.reading.mode.OrchestratorDecisionReason
import me.meeshy.sdk.model.reading.mode.ReadingModeCapabilities
import me.meeshy.sdk.model.reading.mode.ReadingModeConversationType
import me.meeshy.sdk.model.reading.mode.ReadingModeCycle
import me.meeshy.sdk.model.reading.mode.ReadingModeLensCatalog
import me.meeshy.sdk.model.reading.mode.ReadingModeMenuEntry
import me.meeshy.sdk.model.reading.mode.ReadingModeMenuModel
import me.meeshy.sdk.model.reading.mode.ReadingModeOpening
import me.meeshy.sdk.model.reading.mode.ReadingModeOrchestrator
import me.meeshy.sdk.model.reading.mode.ReadingModePreferenceScope
import me.meeshy.sdk.reading.ReadingModeFlags
import me.meeshy.sdk.reading.ReadingModePreferenceStoring
import me.meeshy.sdk.reading.SharedPreferencesReadingModeStore
import me.meeshy.sdk.session.AnonymousSessionStore
import me.meeshy.sdk.session.SessionRepository

/**
 * Les cinq vues du fil d'iOS : Bulles, Script (la rangée plate), Focal (Script + la scène au
 * défilement), Résumé (le Résumé vivant, en surcouche) et Rivière (la toile des couloirs, en
 * surcouche aussi — #13405). Une vue offerte par la loi est donc toujours rendue : aucune ne retombe
 * plus sur Script ([ReadingModeOpening.deliver]) ni ne reste grisée dans le menu du chip, sauf quand
 * la conversation ou l'interrupteur de réglages ne l'offre pas (`RiverModeGate`).
 */
internal val DELIVERED_READING_MODES: Set<ConversationReadingMode> = ReadingModeMenuModel.DELIVERED

/** Ce que le chip montre : la décision courante, les capacités figées à l'ouverture, le menu. */
data class ReadingModeUiState(
    val decision: OrchestratorDecision,
    val capabilities: ReadingModeCapabilities,
    val delivered: Set<ConversationReadingMode>,
) {
    val mode: ConversationReadingMode get() = decision.mode
    val isAuto: Boolean get() = ReadingModeOpening.isAuto(decision)
    val showsChip: Boolean get() = ReadingModeLensCatalog.showsChip(capabilities)
    val rows: List<LensRow> get() = ReadingModeLensCatalog.rows(capabilities, decision.mode, delivered)

    /** Le menu de la puce : le MÊME catalogue que le sous-menu de la liste (Auto coché tant qu'aucun choix n'est figé). */
    val menuEntries: List<ReadingModeMenuEntry>
        get() = ReadingModeMenuModel.build(capabilities, ReadingModeMenuModel.preferenceOf(decision), delivered)

    /** Le mode vers lequel le tap fait passer, ou `null` s'il n'y a rien vers quoi cycler. */
    val nextInCycle: ConversationReadingMode?
        get() = ReadingModeCycle.next(decision.mode, ReadingModeLensCatalog.cycle(capabilities, delivered))
}

/**
 * Le mode de lecture d'UNE conversation ouverte — miroir de `ReadingModeController` (iOS). Les
 * entrées (non-lus, capacités, drapeau) sont figées à l'ouverture ; [select] écrit la préférence
 * collante puis recalcule, [resetToAuto] efface la clé puis recalcule. Pur hors du [store].
 * [forcedMode] (ouverture depuis une notification ou un aperçu) est ÉPHÉMÈRE : il décide de
 * l'ouverture seulement, n'est jamais écrit, et le premier choix manuel reprend la loi.
 */
class ReadingModeSession(
    private val conversationId: String,
    private val scope: ReadingModePreferenceScope,
    private val unreadCount: Int,
    private val capabilities: ReadingModeCapabilities,
    private val isFlagEnabled: Boolean,
    private val store: ReadingModePreferenceStoring,
    private val now: () -> Long,
    private val delivered: Set<ConversationReadingMode> = DELIVERED_READING_MODES,
    landsOnMessage: Boolean = false,
    forcedMode: ConversationReadingMode? = null,
) {
    private val _state = MutableStateFlow(
        ReadingModeUiState(
            forcedMode?.let { ReadingModeOpening.deliver(OrchestratorDecision(it, OrchestratorDecisionReason.DEFAULT), delivered) }
                ?: compute(landsOnMessage),
            capabilities,
            delivered,
        ),
    )
    val state: StateFlow<ReadingModeUiState> = _state.asStateFlow()

    fun select(mode: ConversationReadingMode) {
        store.setMode(mode, conversationId, scope)
        recompute()
    }

    fun resetToAuto() {
        store.setMode(null, conversationId, scope)
        recompute()
    }

    /** Note l'ouverture (règle d'absence de la prochaine visite) — après la décision d'ouverture. */
    fun noteOpened() {
        store.noteOpened(conversationId, scope, now())
    }

    private fun recompute() {
        _state.value = ReadingModeUiState(compute(landsOnMessage = false), capabilities, delivered)
    }

    private fun compute(landsOnMessage: Boolean): OrchestratorDecision = ReadingModeOpening.decide(
        stickyMode = store.mode(conversationId, scope),
        unreadCount = unreadCount,
        lastOpenedAtMs = store.lastOpenedAtMs(conversationId, scope),
        nowMs = now(),
        capabilities = capabilities,
        isFlagEnabled = isFlagEnabled,
        delivered = delivered,
        landsOnMessage = landsOnMessage,
    )

    companion object {
        /**
         * La session d'ouverture : capacités résolues UNE fois (miroir de `ConversationView.init`
         * iOS, qui passe `memberCount` comme compte d'actifs), décision prise, puis ouverture notée.
         */
        fun open(
            conversationId: String,
            scope: ReadingModePreferenceScope,
            conversationType: String?,
            memberCount: Int,
            unreadCount: Int,
            flags: ReadingModeFlags,
            store: ReadingModePreferenceStoring,
            now: () -> Long,
            delivered: Set<ConversationReadingMode> = DELIVERED_READING_MODES,
            forcedMode: ConversationReadingMode? = null,
        ): ReadingModeSession {
            val capabilities = ReadingModeOrchestrator.resolveCapabilities(
                isAnonymous = scope is ReadingModePreferenceScope.Anonymous,
                isFlagEnabled = flags.isReadingModesEnabled,
                isRiverFlagEnabled = flags.isRiviereModeEnabled,
                conversationType = ReadingModeConversationType.of(conversationType),
                activeParticipantCount = memberCount,
            )
            return ReadingModeSession(
                conversationId = conversationId,
                scope = scope,
                unreadCount = unreadCount,
                capabilities = capabilities,
                isFlagEnabled = flags.isReadingModesEnabled,
                store = store,
                now = now,
                delivered = delivered,
                forcedMode = forcedMode,
            ).also { it.noteOpened() }
        }
    }
}

/**
 * Branche le mode de lecture sur l'écran : attend la conversation en cache et le compte de
 * non-lus d'ouverture, résout l'identité du lecteur (invité → participantId haché, sinon userId),
 * puis ouvre la [ReadingModeSession]. Aucune écriture serveur : la préférence vit en local, comme
 * l'écriture optimiste iOS.
 */
class ReadingModeController @Inject constructor(
    private val conversationRepository: ConversationRepository,
    private val sessionRepository: SessionRepository,
    private val anonymousSessionStore: AnonymousSessionStore,
    private val store: SharedPreferencesReadingModeStore,
) : ChatController, ThreadReadingModeSource {

    private val _state = MutableStateFlow<ReadingModeUiState?>(null)

    /** `null` tant que l'ouverture n'est pas résolue : pas de chip. */
    override val state: StateFlow<ReadingModeUiState?> = _state.asStateFlow()

    private var session: ReadingModeSession? = null

    override fun attach(host: ChatControllerHost) {
        host.scope.launch {
            val conversation = conversationRepository.conversationStream(host.conversationId).filterNotNull().first()
            val unread = host.initialUnreadCount.filterNotNull().first()
            val guest = try {
                anonymousSessionStore.load()?.takeIf { it.conversationId == host.conversationId }
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                null
            }
            val scope = guest?.let { ReadingModePreferenceScope.Anonymous(it.participantId) }
                ?: sessionRepository.currentUser.value?.id?.let { ReadingModePreferenceScope.Registered(it) }
                ?: return@launch
            val opened = ReadingModeSession.open(
                conversationId = host.conversationId,
                scope = scope,
                conversationType = conversation.type,
                memberCount = conversation.memberCount,
                unreadCount = unread,
                flags = store,
                store = store,
                now = System::currentTimeMillis,
            )
            session = opened
            opened.state.collect { _state.value = it }
        }
    }

    override fun select(mode: ConversationReadingMode) {
        session?.select(mode)
    }

    override fun resetToAuto() {
        session?.resetToAuto()
    }
}

@Module
@InstallIn(SingletonComponent::class)
abstract class ReadingModeModule {

    @Binds
    @IntoSet
    abstract fun controller(impl: ReadingModeController): ChatController
}

/** Aucun mode de lecture résolu (tests, aperçus, contrôleur absent). */
internal val NO_READING_MODE: StateFlow<ReadingModeUiState?> = MutableStateFlow(null)
