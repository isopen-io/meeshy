package me.meeshy.ui.haptics

import android.os.Build
import android.view.View
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalView
import me.meeshy.sdk.feedback.HapticKind
import me.meeshy.sdk.feedback.HapticSurfacing

/** Point d'entrée unique des haptiques : `MeeshyHaptics.light()` … comme `HapticFeedback` sur iOS. */
public class MeeshyHaptics internal constructor(private val surfacing: HapticSurfacing) {
    public fun light(): Unit = surfacing.perform(HapticKind.LIGHT)
    public fun medium(): Unit = surfacing.perform(HapticKind.MEDIUM)
    public fun heavy(): Unit = surfacing.perform(HapticKind.HEAVY)
    public fun rigid(): Unit = surfacing.perform(HapticKind.RIGID)
    public fun success(): Unit = surfacing.perform(HapticKind.SUCCESS)
    public fun warning(): Unit = surfacing.perform(HapticKind.WARNING)
    public fun error(): Unit = surfacing.perform(HapticKind.ERROR)
    public fun selection(): Unit = surfacing.perform(HapticKind.SELECTION)

    public companion object {
        public fun forView(view: View): MeeshyHaptics =
            MeeshyHaptics(HapticSurfacing({ view.performHapticFeedback(it) }, Build.VERSION.SDK_INT))
    }
}

@Composable
public fun rememberMeeshyHaptics(): MeeshyHaptics {
    val view = LocalView.current
    return remember(view) { MeeshyHaptics.forView(view) }
}
