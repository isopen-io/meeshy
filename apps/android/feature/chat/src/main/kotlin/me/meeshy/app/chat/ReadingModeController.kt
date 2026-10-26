package me.meeshy.app.chat

import android.content.Context
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
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
import me.meeshy.sdk.model.reading.mode.ReadingModeCapabilities
import me.meeshy.sdk.model.reading.mode.ReadingModeConversationType
import me.meeshy.sdk.model.reading.mode.ReadingModeCycle
import me.meeshy.sdk.model.reading.mode.ReadingModeLensCatalog
import me.meeshy.sdk.model.reading.mode.ReadingModeOpening
import me.meeshy.sdk.model.reading.mode.ReadingModeOrchestrator
import me.meeshy.sdk.model.reading.mode.ReadingModePreferenceScope
import me.meeshy.sdk.session.AnonymousSessionStore
import me.meeshy.sdk.session.SessionRepository

/**
 * Les vues du fil qu'Android sait DÉJÀ dessiner : Bulles et Script (la rangée plate d'iOS). La
 * loi ouvre donc en Script par défaut, comme iOS ; Résumé (et Rivière, Focal) pas encore portés
 * retombent sur Script ([ReadingModeOpening.deliver]) et restent grisés dans le menu du chip.
 */
internal val DELIVERED_READING_MODES: Set<ConversationReadingMode> =
    setOf(ConversationReadingMode.BUBBLES, ConversationReadingMode.SCRIPT)

/**
 * Stockage local, scopé par lecteur, du mode de lecture — miroir de
 * `FocalReadingModePreferenceStoring` (iOS). `null` = rien de mémorisé = Automatique.
 */
interface ReadingModePreferenceStoring {
    fun mode(conversationId: String, scope: ReadingModePreferenceScope): ConversationReadingMode?
    fun setMode(mode: ConversationReadingMode?, conversationId: String, scope: ReadingModePreferenceScope)
    fun lastOpenedAtMs(conversationId: String, scope: ReadingModePreferenceScope): Long?
    fun noteOpened(conversationId: String, scope: ReadingModePreferenceScope, atMs: Long)
}

/** Les drapeaux des modes de lecture — miroir de `LentilleFeatureFlag` : actifs tant qu'aucune valeur n'est écrite. */
interface ReadingModeFlags {
    val isReadingModesEnabled: Boolean
    val isRiviereModeEnabled: Boolean
}

/**
 * Le stockage `SharedPreferences` : clés `meeshy_readmode_<scope>_<id>` (valeur = mode rendu
 * `focal|script|summary|river|bubbles`) et `meeshy_lastopen_<scope>_<id>` (epoch en ms), et les
 * drapeaux `meeshy.flag.reading_modes` / `meeshy.flag.riviere_mode` (défaut : actifs).
 */
class SharedPreferencesReadingModeStore @Inject constructor(
    @ApplicationContext context: Context,
) : ReadingModePreferenceStoring, ReadingModeFlags {

    private val prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    override fun mode(conversationId: String, scope: ReadingModePreferenceScope): ConversationReadingMode? =
        ConversationReadingMode.fromWire(prefs.getString(ReadingModePreferenceScope.modeKey(scope, conversationId), null))

    override fun setMode(mode: ConversationReadingMode?, conversationId: String, scope: ReadingModePreferenceScope) {
        if (conversationId.isEmpty()) return
        val key = ReadingModePreferenceScope.modeKey(scope, conversationId)
        prefs.edit().apply { if (mode == null) remove(key) else putString(key, mode.wire) }.apply()
    }

    override fun lastOpenedAtMs(conversationId: String, scope: ReadingModePreferenceScope): Long? {
        val key = ReadingModePreferenceScope.lastOpenedKey(scope, conversationId)
        return if (prefs.contains(key)) prefs.getLong(key, 0L) else null
    }

    override fun noteOpened(conversationId: String, scope: ReadingModePreferenceScope, atMs: Long) {
        if (conversationId.isEmpty()) return
        prefs.edit().putLong(ReadingModePreferenceScope.lastOpenedKey(scope, conversationId), atMs).apply()
    }

    override val isReadingModesEnabled: Boolean get() = prefs.getBoolean(FLAG_READING_MODES, true)
    override val isRiviereModeEnabled: Boolean get() = prefs.getBoolean(FLAG_RIVIERE_MODE, true)

    private companion object {
        const val PREFS = "meeshy.readingModes"
        const val FLAG_READING_MODES = "meeshy.flag.reading_modes"
        const val FLAG_RIVIERE_MODE = "meeshy.flag.riviere_mode"
    }
}

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

    /** Le mode vers lequel le tap fait passer, ou `null` s'il n'y a rien vers quoi cycler. */
    val nextInCycle: ConversationReadingMode?
        get() = ReadingModeCycle.next(decision.mode, ReadingModeLensCatalog.cycle(capabilities, delivered))
}

/**
 * Le mode de lecture d'UNE conversation ouverte — miroir de `ReadingModeController` (iOS). Les
 * entrées (non-lus, capacités, drapeau) sont figées à l'ouverture ; [select] écrit la préférence
 * collante puis recalcule, [resetToAuto] efface la clé puis recalcule. Pur hors du [store].
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
) {
    private val _state = MutableStateFlow(
        ReadingModeUiState(compute(landsOnMessage), capabilities, delivered),
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
) : ChatController {

    private val _state = MutableStateFlow<ReadingModeUiState?>(null)

    /** `null` tant que l'ouverture n'est pas résolue : pas de chip. */
    val state: StateFlow<ReadingModeUiState?> = _state.asStateFlow()

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

    fun select(mode: ConversationReadingMode) {
        session?.select(mode)
    }

    fun resetToAuto() {
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
