package me.meeshy.app.conversations

/**
 * Pure state machine for the conversation lock PIN sheet.
 *
 * Parity with iOS `ConversationLockSheet` — but where iOS embeds this logic inside
 * the SwiftUI view's `handleComplete` (untestable), Android extracts it into this
 * reducer so every transition is covered by JVM unit tests (see
 * `TDD-COVERAGE.md`'s "push testable decisions out of the Composable" directive).
 * The Composable becomes a dumb renderer of [LockPinState] that forwards digit /
 * delete intents and applies the emitted [LockPinEffect]s.
 *
 * SOTA over iOS: iOS's `shakeAndReset` blindly rewinds `step = 1` on any failure,
 * which lands the master-PIN setup flow (which has no step 1) on a mislabelled
 * screen. Here a confirm mismatch rewinds to the mode's real *entry* step
 * (0 for setup, 1 for a conversation code), and a wrong verify PIN keeps its own
 * step — so the header copy always matches the buffer the user is editing.
 */

/** Master PIN length (6 digits) — parity iOS `ConversationLockManager`. */
public const val MASTER_PIN_LENGTH: Int = 6

/** Per-conversation code length (4 digits) — parity iOS. */
public const val CONVERSATION_PIN_LENGTH: Int = 4

/**
 * The lock flows the sheet can drive. The first three are reachable from the
 * conversation context menu; [OPEN_CONVERSATION] is the tap gate — entering a
 * locked conversation's code to view it *without* removing the lock (parity iOS
 * `ConversationLockSheet.Mode.openConversation`).
 */
public enum class LockPinMode {
    SETUP_MASTER_PIN,
    LOCK_CONVERSATION,
    UNLOCK_CONVERSATION,
    OPEN_CONVERSATION,

    /**
     * Settings-level "change the master PIN": verify the current 6-digit master PIN
     * (step 0), enter a new one (step 1), confirm it (step 2), then commit the new PIN
     * (parity iOS `ConversationLockSheet.Mode.changeMasterPin`). Every per-conversation
     * lock keeps its own code — only the gate that authorises locking changes.
     */
    CHANGE_MASTER_PIN,

    /**
     * Settings-level "remove the master PIN": verify the master PIN once, then clear it
     * (parity iOS `ConversationLockSheet.Mode.removeMasterPin`). SOTA over iOS, which
     * force-removes even while conversation locks still exist (orphaning them — a lock
     * can no longer be authorised or unlocked-all): the entry affordance is offered only
     * while nothing is locked (see [ConversationListViewModel.onRemoveMasterPin]) and the
     * committed [LockPinEffect.RemoveMasterPin] is applied through the store's *guarded*
     * `removeMasterPin`, a no-op while any lock survives.
     */
    REMOVE_MASTER_PIN,

    /**
     * Settings-level "unlock everything": verify the master PIN once, then drop
     * every per-conversation lock in one go (parity iOS `ConversationLockSheet.Mode.unlockAll`).
     * The master PIN itself stays set — only the conversation locks are removed.
     */
    UNLOCK_ALL,
}

/** Which localized header copy the sheet shows for the current `(mode, step)`. */
public enum class LockPinCopy {
    CREATE_MASTER_PIN,
    CONFIRM_MASTER_PIN,
    VERIFY_MASTER_PIN,
    ENTER_CODE,
    CONFIRM_CODE,
    UNLOCK,
    OPEN,
    UNLOCK_ALL,

    /** Change flow step 0 — verify the *current* master PIN before choosing a new one. */
    CHANGE_VERIFY_MASTER_PIN,

    /** Change flow step 1 — choose the new master PIN. */
    NEW_MASTER_PIN,

    /** Change flow step 2 — confirm the new master PIN. */
    CONFIRM_NEW_MASTER_PIN,

    /** Remove flow — verify the master PIN to confirm its removal. */
    REMOVE_MASTER_PIN,
}

/** The failure surfaced under the PIN dots after an incorrect entry. */
public enum class LockPinError { MASTER_PIN_INCORRECT, PIN_MISMATCH, CODE_MISMATCH, CODE_INCORRECT }

/**
 * Immutable snapshot of the PIN sheet. `step` mirrors iOS: `0` = first entry,
 * `1` = the 4-digit code entry (lock flow only), `2` = the confirm buffer.
 */
public data class LockPinState(
    val mode: LockPinMode,
    val conversationId: String?,
    val step: Int = 0,
    val pin: String = "",
    val confirmPin: String = "",
    val error: LockPinError? = null,
) {
    /** How many digits the current step expects. */
    public val pinLength: Int
        get() = when (mode) {
            LockPinMode.SETUP_MASTER_PIN -> MASTER_PIN_LENGTH
            LockPinMode.LOCK_CONVERSATION -> if (step == 0) MASTER_PIN_LENGTH else CONVERSATION_PIN_LENGTH
            LockPinMode.UNLOCK_CONVERSATION, LockPinMode.OPEN_CONVERSATION -> CONVERSATION_PIN_LENGTH
            LockPinMode.CHANGE_MASTER_PIN, LockPinMode.REMOVE_MASTER_PIN, LockPinMode.UNLOCK_ALL -> MASTER_PIN_LENGTH
        }

    /** The buffer being edited: the confirm buffer during step 2, else the primary buffer. */
    public val currentPin: String get() = if (step == 2) confirmPin else pin

    /** Number of filled dots. */
    public val filledCount: Int get() = currentPin.length

    /** The header copy for the current `(mode, step)`. */
    public val copy: LockPinCopy
        get() = when (mode) {
            LockPinMode.SETUP_MASTER_PIN ->
                if (step == 2) LockPinCopy.CONFIRM_MASTER_PIN else LockPinCopy.CREATE_MASTER_PIN
            LockPinMode.LOCK_CONVERSATION -> when (step) {
                0 -> LockPinCopy.VERIFY_MASTER_PIN
                1 -> LockPinCopy.ENTER_CODE
                else -> LockPinCopy.CONFIRM_CODE
            }
            LockPinMode.UNLOCK_CONVERSATION -> LockPinCopy.UNLOCK
            LockPinMode.OPEN_CONVERSATION -> LockPinCopy.OPEN
            LockPinMode.CHANGE_MASTER_PIN -> when (step) {
                0 -> LockPinCopy.CHANGE_VERIFY_MASTER_PIN
                1 -> LockPinCopy.NEW_MASTER_PIN
                else -> LockPinCopy.CONFIRM_NEW_MASTER_PIN
            }
            LockPinMode.REMOVE_MASTER_PIN -> LockPinCopy.REMOVE_MASTER_PIN
            LockPinMode.UNLOCK_ALL -> LockPinCopy.UNLOCK_ALL
        }
}

/** Read-only PIN checks the reducer needs, backed by the encrypted lock store in production. */
public interface LockPinOracle {
    public fun verifyMasterPin(pin: String): Boolean
    public fun verifyLock(conversationId: String, pin: String): Boolean
}

/** A durable side effect the caller applies to the lock store after a step completes. */
public sealed interface LockPinEffect {
    public data class CommitMasterPin(val pin: String) : LockPinEffect
    public data class CommitLock(val conversationId: String, val pin: String) : LockPinEffect
    public data class RemoveLock(val conversationId: String) : LockPinEffect

    /**
     * Clear the master PIN (the remove flow). Applied through the store's *guarded*
     * `removeMasterPin`, which is a no-op while any conversation lock survives — so a
     * lock can never be orphaned behind a PIN the user can no longer produce.
     */
    public object RemoveMasterPin : LockPinEffect

    /**
     * Drop every per-conversation lock at once (the unlock-all flow). The master
     * PIN is deliberately left in place — parity iOS `unlockAll`, which calls
     * `removeAllLocks()` only.
     */
    public object RemoveAllLocks : LockPinEffect

    /**
     * The tap gate accepted the code — navigate into [conversationId]. The lock is
     * deliberately left in place (contrast [RemoveLock]): opening a locked
     * conversation reveals it once, it stays locked for the next visit.
     */
    public data class OpenConversation(val conversationId: String) : LockPinEffect

    /** The flow finished successfully — dismiss the sheet (or chain the next one). */
    public object Completed : LockPinEffect
}

/** The next [LockPinState] plus any [LockPinEffect]s produced by a digit. */
public data class LockPinResult(val state: LockPinState, val effects: List<LockPinEffect>)

/** Drives [LockPinState] transitions; pure apart from the injected read-only [oracle]. */
public class LockPinReducer(private val oracle: LockPinOracle) {

    /** Appends [digit] to the active buffer, completing the step when the buffer fills. */
    public fun onDigit(state: LockPinState, digit: Int): LockPinResult {
        if (digit !in 0..9) return LockPinResult(state, emptyList())
        if (state.currentPin.length >= state.pinLength) return LockPinResult(state, emptyList())

        val appended = state.currentPin + digit.toString()
        val advanced = if (state.step == 2) {
            state.copy(confirmPin = appended, error = null)
        } else {
            state.copy(pin = appended, error = null)
        }
        return if (appended.length < advanced.pinLength) {
            LockPinResult(advanced, emptyList())
        } else {
            complete(advanced)
        }
    }

    /** Removes the last digit of the active buffer; inert when it is empty. */
    public fun onDelete(state: LockPinState): LockPinState = when {
        state.step == 2 -> if (state.confirmPin.isEmpty()) state else state.copy(confirmPin = state.confirmPin.dropLast(1))
        state.pin.isEmpty() -> state
        else -> state.copy(pin = state.pin.dropLast(1))
    }

    private fun complete(state: LockPinState): LockPinResult = when (state.mode) {
        LockPinMode.SETUP_MASTER_PIN -> completeSetup(state)
        LockPinMode.LOCK_CONVERSATION -> completeLock(state)
        LockPinMode.UNLOCK_CONVERSATION -> completeUnlock(state)
        LockPinMode.OPEN_CONVERSATION -> completeOpen(state)
        LockPinMode.CHANGE_MASTER_PIN -> completeChange(state)
        LockPinMode.REMOVE_MASTER_PIN -> completeRemove(state)
        LockPinMode.UNLOCK_ALL -> completeUnlockAll(state)
    }

    private fun completeSetup(state: LockPinState): LockPinResult = when (state.step) {
        0 -> LockPinResult(state.copy(step = 2, error = null), emptyList())
        else ->
            if (state.pin == state.confirmPin) {
                LockPinResult(state, listOf(LockPinEffect.CommitMasterPin(state.pin), LockPinEffect.Completed))
            } else {
                mismatch(state, LockPinError.PIN_MISMATCH, entryStep = 0)
            }
    }

    private fun completeLock(state: LockPinState): LockPinResult = when (state.step) {
        0 ->
            if (oracle.verifyMasterPin(state.pin)) {
                LockPinResult(state.copy(step = 1, pin = "", confirmPin = "", error = null), emptyList())
            } else {
                verifyFailure(state, LockPinError.MASTER_PIN_INCORRECT)
            }
        1 -> LockPinResult(state.copy(step = 2, error = null), emptyList())
        else ->
            if (state.pin != state.confirmPin) {
                mismatch(state, LockPinError.CODE_MISMATCH, entryStep = 1)
            } else if (state.conversationId == null) {
                LockPinResult(state, emptyList())
            } else {
                LockPinResult(
                    state,
                    listOf(LockPinEffect.CommitLock(state.conversationId, state.pin), LockPinEffect.Completed),
                )
            }
    }

    private fun completeUnlock(state: LockPinState): LockPinResult = when {
        state.conversationId == null -> LockPinResult(state, emptyList())
        oracle.verifyLock(state.conversationId, state.pin) ->
            LockPinResult(state, listOf(LockPinEffect.RemoveLock(state.conversationId), LockPinEffect.Completed))
        else -> verifyFailure(state, LockPinError.CODE_INCORRECT)
    }

    private fun completeOpen(state: LockPinState): LockPinResult = when {
        state.conversationId == null -> LockPinResult(state, emptyList())
        oracle.verifyLock(state.conversationId, state.pin) ->
            LockPinResult(state, listOf(LockPinEffect.OpenConversation(state.conversationId), LockPinEffect.Completed))
        else -> verifyFailure(state, LockPinError.CODE_INCORRECT)
    }

    private fun completeChange(state: LockPinState): LockPinResult = when (state.step) {
        0 ->
            if (oracle.verifyMasterPin(state.pin)) {
                LockPinResult(state.copy(step = 1, pin = "", confirmPin = "", error = null), emptyList())
            } else {
                verifyFailure(state, LockPinError.MASTER_PIN_INCORRECT)
            }
        1 -> LockPinResult(state.copy(step = 2, error = null), emptyList())
        else ->
            if (state.pin == state.confirmPin) {
                LockPinResult(state, listOf(LockPinEffect.CommitMasterPin(state.pin), LockPinEffect.Completed))
            } else {
                mismatch(state, LockPinError.PIN_MISMATCH, entryStep = 1)
            }
    }

    private fun completeRemove(state: LockPinState): LockPinResult =
        if (oracle.verifyMasterPin(state.pin)) {
            LockPinResult(state, listOf(LockPinEffect.RemoveMasterPin, LockPinEffect.Completed))
        } else {
            verifyFailure(state, LockPinError.MASTER_PIN_INCORRECT)
        }

    private fun completeUnlockAll(state: LockPinState): LockPinResult =
        if (oracle.verifyMasterPin(state.pin)) {
            LockPinResult(state, listOf(LockPinEffect.RemoveAllLocks, LockPinEffect.Completed))
        } else {
            verifyFailure(state, LockPinError.MASTER_PIN_INCORRECT)
        }

    private fun mismatch(state: LockPinState, error: LockPinError, entryStep: Int): LockPinResult =
        LockPinResult(state.copy(step = entryStep, pin = "", confirmPin = "", error = error), emptyList())

    private fun verifyFailure(state: LockPinState, error: LockPinError): LockPinResult =
        LockPinResult(state.copy(pin = "", confirmPin = "", error = error), emptyList())
}
