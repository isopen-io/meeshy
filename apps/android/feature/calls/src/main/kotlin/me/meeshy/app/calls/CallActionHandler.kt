package me.meeshy.app.calls

import android.util.Log
import androidx.annotation.StringRes
import androidx.compose.ui.graphics.vector.ImageVector
import dagger.MapKey
import me.meeshy.sdk.model.call.CallAction
import me.meeshy.sdk.model.call.CallActionFamily
import javax.inject.Inject
import javax.inject.Singleton

/** How an action looks on the call controls. [isActive] paints a toggle that is currently on. */
data class CallActionPresentation(
    val icon: ImageVector,
    @StringRes val labelRes: Int,
    val isActive: Boolean = false,
)

/**
 * An extension point for one user-triggerable action of the call controls
 * (screen share, captions, recording, add people…). A capability provides a
 * handler with `@IntoMap @CallActionKey(CallAction.X)` in its own Hilt module;
 * the controls then offer the action and run the handler on tap — without the
 * controls, the screen or the [CallViewModel] being edited.
 */
interface CallActionHandler {
    /**
     * How the action shows up for this snapshot of the call, or `null` when it
     * has no place right now (not connected yet, not a video call…) — a hidden
     * action is absent, never greyed.
     */
    fun present(state: CallUiState): CallActionPresentation?

    /** The user tapped the action. */
    fun perform()
}

/** The map key under which a [CallActionHandler] is registered. */
@MapKey
@Retention(AnnotationRetention.RUNTIME)
@Target(AnnotationTarget.FUNCTION)
annotation class CallActionKey(val value: CallAction)

/** An action that is both registered and relevant for the current snapshot, ready to draw. */
data class OfferedCallAction(
    val action: CallAction,
    val presentation: CallActionPresentation,
)

/**
 * Runs the registered [CallActionHandler]s and decides which actions the controls
 * offer. An action without a handler is simply not offered — a capability that
 * has not landed leaves no inert button behind — and one registered action never
 * affects another.
 *
 * Registering the same [CallAction] twice is a build error (Dagger rejects a
 * duplicate map key), not a runtime surprise: two capabilities cannot silently
 * fight over a button.
 */
@Singleton
class CallActionDispatcher @Inject constructor(
    private val handlers: Map<CallAction, @JvmSuppressWildcards CallActionHandler>,
) {
    /** Whether a handler exists for [action]. */
    fun isRegistered(action: CallAction): Boolean = action in handlers

    /**
     * Runs the handler of [action]. `false` when there is none, or when it threw
     * (logged, never propagated: somebody else's action must not take the call
     * screen down).
     */
    fun dispatch(action: CallAction): Boolean {
        val handler = handlers[action] ?: return false
        return try {
            handler.perform()
            true
        } catch (failure: Exception) {
            Log.w(TAG, "${action.id} handler failed", failure)
            false
        }
    }

    /**
     * The actions to draw for [state], in the order of [CallAction] (the iOS pill
     * order), optionally narrowed to one [family].
     */
    fun offered(state: CallUiState, family: CallActionFamily? = null): List<OfferedCallAction> =
        CallAction.entries.mapNotNull { action ->
            if (family != null && action.family != family) return@mapNotNull null
            val handler = handlers[action] ?: return@mapNotNull null
            val presentation = runCatching { handler.present(state) }.getOrNull() ?: return@mapNotNull null
            OfferedCallAction(action, presentation)
        }

    private companion object {
        const val TAG = "CallActions"
    }
}
