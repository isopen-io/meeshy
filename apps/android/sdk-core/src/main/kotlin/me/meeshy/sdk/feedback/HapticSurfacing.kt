package me.meeshy.sdk.feedback

import android.view.HapticFeedbackConstants

/** Vocabulaire haptique de Meeshy : miroir de `HapticFeedback` (iOS). */
public enum class HapticKind { LIGHT, MEDIUM, HEAVY, RIGID, SUCCESS, WARNING, ERROR, SELECTION }

/** Destination d'une vibration : une `View` en production, un faux en test. */
public fun interface HapticSink {
    public fun perform(feedbackConstant: Int)
}

/** Traduit un [HapticKind] en constante plateforme, en gardant chaque API récente derrière son niveau. */
public class HapticSurfacing(
    private val sink: HapticSink,
    private val sdkInt: Int,
) {
    public fun perform(kind: HapticKind) {
        sink.perform(constantFor(kind, sdkInt))
    }

    public companion object {
        public fun constantFor(kind: HapticKind, sdkInt: Int): Int = when (kind) {
            HapticKind.LIGHT -> HapticFeedbackConstants.KEYBOARD_TAP
            HapticKind.MEDIUM -> HapticFeedbackConstants.VIRTUAL_KEY
            HapticKind.HEAVY -> HapticFeedbackConstants.LONG_PRESS
            HapticKind.RIGID -> HapticFeedbackConstants.CONTEXT_CLICK
            HapticKind.SUCCESS ->
                if (sdkInt >= API_CONFIRM) HapticFeedbackConstants.CONFIRM else HapticFeedbackConstants.CONTEXT_CLICK
            HapticKind.WARNING -> HapticFeedbackConstants.LONG_PRESS
            HapticKind.ERROR ->
                if (sdkInt >= API_CONFIRM) HapticFeedbackConstants.REJECT else HapticFeedbackConstants.LONG_PRESS
            HapticKind.SELECTION ->
                if (sdkInt >= API_SEGMENT_TICK) HapticFeedbackConstants.SEGMENT_FREQUENT_TICK else HapticFeedbackConstants.CLOCK_TICK
        }

        private const val API_CONFIRM = 30
        private const val API_SEGMENT_TICK = 34
    }
}
