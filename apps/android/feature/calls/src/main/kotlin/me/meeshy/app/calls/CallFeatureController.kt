package me.meeshy.app.calls

import android.util.Log
import me.meeshy.sdk.model.call.CallEvent
import me.meeshy.sdk.model.call.CallState
import javax.inject.Inject
import javax.inject.Singleton

/**
 * An extension point for the LOGIC of a call capability (reactions, recording,
 * screen share, captions…). A capability adds a controller — registered with
 * `@IntoSet` in its own Hilt module — and the call hands it what happens, without
 * the capability ever editing the [CallViewModel]:
 *
 *  - [onTransition] — every genuine FSM change, with the phase it left and the one
 *    it entered;
 *  - [onRemoteEvent] — every event that arrived from the other side, BEFORE it is
 *    folded into the FSM (the cause, then its transition);
 *  - [onCleared] — the call surface is torn down: release what you hold.
 *
 * Every callback has an empty default, so a controller overrides only what it
 * cares about. Callbacks run on the main thread, one controller after the other
 * by [order]; a controller that throws is isolated (see
 * [CallFeatureControllerRegistry]) and must therefore not rely on being called
 * "last". The UI of a capability is its own extension point: see [CallOverlay].
 */
interface CallFeatureController {
    /** Ascending: the controller with the smaller order is called first. Ties keep registration order. */
    val order: Int get() = 0

    fun onTransition(previous: CallState, next: CallState, session: CallSessionInfo) {}

    fun onRemoteEvent(event: CallEvent, session: CallSessionInfo) {}

    fun onCleared() {}
}

/**
 * Fans the call's life out to every registered [CallFeatureController].
 *
 * A controller is somebody else's code running inside the call: one that throws
 * is logged and skipped, and the controllers after it (and the call itself) go on
 * undisturbed. Ordering is by [CallFeatureController.order], stable.
 */
@Singleton
class CallFeatureControllerRegistry @Inject constructor(
    controllers: Set<@JvmSuppressWildcards CallFeatureController>,
) {
    private val ordered: List<CallFeatureController> = controllers.sortedBy { it.order }

    fun notifyTransition(previous: CallState, next: CallState, session: CallSessionInfo) =
        each("onTransition") { it.onTransition(previous, next, session) }

    fun notifyRemoteEvent(event: CallEvent, session: CallSessionInfo) =
        each("onRemoteEvent") { it.onRemoteEvent(event, session) }

    fun notifyCleared() = each("onCleared") { it.onCleared() }

    private inline fun each(callback: String, call: (CallFeatureController) -> Unit) {
        for (controller in ordered) {
            try {
                call(controller)
            } catch (failure: Exception) {
                Log.w(TAG, "${controller.javaClass.simpleName}.$callback failed", failure)
            }
        }
    }

    private companion object {
        const val TAG = "CallFeatures"
    }
}
