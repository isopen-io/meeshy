package me.meeshy.app.conversations

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.update
import me.meeshy.sdk.lock.ConversationLockStore

/**
 * Verrou par code de la liste : ouverture des feuilles PIN, enchainement
 * SETUP_MASTER_PIN -> saisie du code, application des effets du [LockPinReducer].
 * Instancie par le ViewModel ; l'ouverture d'une conversation lui est deleguee
 * par [openConversation].
 */
internal class ConversationListLockCoordinator(
    private val state: MutableStateFlow<ConversationListUiState>,
    private val lockStore: ConversationLockStore,
    private val openConversation: (String) -> Unit,
) {

    /** Controles de code en lecture seule, adosses au coffre chiffre. */
    private val lockPinReducer = LockPinReducer(object : LockPinOracle {
        override fun verifyMasterPin(pin: String): Boolean = lockStore.verifyMasterPin(pin)
        override fun verifyLock(conversationId: String, pin: String): Boolean =
            lockStore.verifyLock(conversationId, pin)
    })

    /**
     * Pose uniquement pendant une feuille SETUP_MASTER_PIN ouverte pour un verrou
     * demande : le code maitre valide, le flux enchaine sur la saisie du code.
     */
    private var pendingLockConversationId: String? = null

    /** Miroir vivant des ids verrouilles ; rejoue l'instantane a l'abonnement. */
    suspend fun observe() {
        lockStore.lockedConversationIdsFlow.collect { ids ->
            state.update { it.copy(lockedConversationIds = ids, hasMasterPin = lockStore.hasMasterPin()) }
        }
    }

    /** Tap sur une rangee : ouvre, ou demande le code si la rangee est verrouillee. */
    fun onConversationTap(id: String) {
        if (lockStore.isLocked(id)) {
            state.update { it.copy(lockPrompt = LockPinState(LockPinMode.OPEN_CONVERSATION, id)) }
        } else {
            openConversation(id)
        }
    }

    /** Verrouiller / deverrouiller [id], avec configuration du code maitre si absent. */
    fun onLockToggle(id: String) {
        val prompt = when {
            lockStore.isLocked(id) -> LockPinState(LockPinMode.UNLOCK_CONVERSATION, id)
            lockStore.hasMasterPin() -> LockPinState(LockPinMode.LOCK_CONVERSATION, id)
            else -> {
                pendingLockConversationId = id
                LockPinState(LockPinMode.SETUP_MASTER_PIN, id)
            }
        }
        if (prompt.mode != LockPinMode.SETUP_MASTER_PIN) pendingLockConversationId = null
        state.update { it.copy(lockPrompt = prompt) }
    }

    /** Ouvre la feuille de deverrouillage global ; inerte si rien n'est verrouille. */
    fun onUnlockAll() {
        if (lockStore.lockedConversationIds.isEmpty()) return
        openMasterSheet(LockPinMode.UNLOCK_ALL)
    }

    /** Ouvre la feuille de changement du code maitre ; inerte sans code maitre. */
    fun onChangeMasterPin() {
        if (!lockStore.hasMasterPin()) return
        openMasterSheet(LockPinMode.CHANGE_MASTER_PIN)
    }

    /** Retrait du code maitre : refuse tant qu'un verrou existe. */
    fun onRemoveMasterPin() {
        if (!lockStore.hasMasterPin() || lockStore.lockedConversationIds.isNotEmpty()) return
        openMasterSheet(LockPinMode.REMOVE_MASTER_PIN)
    }

    private fun openMasterSheet(mode: LockPinMode) {
        pendingLockConversationId = null
        state.update { it.copy(lockPrompt = LockPinState(mode, conversationId = null)) }
    }

    fun onLockDigit(digit: Int) {
        val current = state.value.lockPrompt ?: return
        applyLockResult(lockPinReducer.onDigit(current, digit))
    }

    fun onLockDelete() {
        val current = state.value.lockPrompt ?: return
        state.update { it.copy(lockPrompt = lockPinReducer.onDelete(current)) }
    }

    fun dismissLockPrompt() {
        pendingLockConversationId = null
        state.update { it.copy(lockPrompt = null) }
    }

    private fun applyLockResult(result: LockPinResult) {
        var nextPrompt: LockPinState? = result.state
        result.effects.forEach { effect ->
            when (effect) {
                is LockPinEffect.CommitMasterPin -> lockStore.setMasterPin(effect.pin)
                is LockPinEffect.CommitLock -> lockStore.setLock(effect.conversationId, effect.pin)
                is LockPinEffect.RemoveLock -> lockStore.removeLock(effect.conversationId)
                LockPinEffect.RemoveMasterPin -> lockStore.removeMasterPin()
                LockPinEffect.RemoveAllLocks -> lockStore.removeAllLocks()
                is LockPinEffect.OpenConversation -> openConversation(effect.conversationId)
                LockPinEffect.Completed -> {
                    val pending = pendingLockConversationId
                    pendingLockConversationId = null
                    nextPrompt = if (result.state.mode == LockPinMode.SETUP_MASTER_PIN && pending != null) {
                        LockPinState(LockPinMode.LOCK_CONVERSATION, pending, step = 1)
                    } else {
                        null
                    }
                }
            }
        }
        // Un changement / retrait du code maitre ne touche pas l'ensemble verrouille :
        // le collecteur ne se declenche pas, on rafraichit la presence ici.
        state.update { it.copy(lockPrompt = nextPrompt, hasMasterPin = lockStore.hasMasterPin()) }
    }
}
