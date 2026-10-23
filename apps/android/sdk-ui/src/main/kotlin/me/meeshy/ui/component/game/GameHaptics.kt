package me.meeshy.ui.component.game

import android.content.Context
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import me.meeshy.sdk.model.game.GameHapticPlan
import me.meeshy.sdk.model.game.GameHapticTap

/** Le retour haptique du jeu : une interface pour que les chorégraphies se testent sans moteur. */
public interface GameHapticsProviding {
    public fun play(taps: List<GameHapticTap>)
}

/**
 * `VibrationEffect.Composition` quand l'appareil sait les primitives (API 30+), sinon une forme d'onde
 * (minSdk 26). Les motifs sont des DONNÉES (`GameHapticPattern`) ; le plan est calculé par `GameHapticPlan`.
 * Sans vibreur (émulateur, tablette), rien ne se passe : jamais cassé.
 */
public class GameHaptics(context: Context) : GameHapticsProviding {

    private val vibrator: Vibrator? = runCatching { resolveVibrator(context.applicationContext) }.getOrNull()

    override fun play(taps: List<GameHapticTap>) {
        if (taps.isEmpty()) return
        val device = vibrator?.takeIf { it.hasVibrator() } ?: return
        val effect = runCatching { composition(device, taps) ?: waveform(taps) }.getOrNull() ?: return
        runCatching { device.vibrate(effect) }
    }

    private fun composition(device: Vibrator, taps: List<GameHapticTap>): VibrationEffect? {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return null
        val supported = device.areAllPrimitivesSupported(
            VibrationEffect.Composition.PRIMITIVE_CLICK,
            VibrationEffect.Composition.PRIMITIVE_TICK,
        )
        if (!supported) return null
        val composition = VibrationEffect.startComposition()
        GameHapticPlan.steps(taps).forEach { step ->
            val primitive = when (step.primitive) {
                GameHapticPlan.Primitive.CLICK -> VibrationEffect.Composition.PRIMITIVE_CLICK
                GameHapticPlan.Primitive.TICK -> VibrationEffect.Composition.PRIMITIVE_TICK
            }
            composition.addPrimitive(primitive, step.scale, step.delayMillis)
        }
        return composition.compose()
    }

    private fun waveform(taps: List<GameHapticTap>): VibrationEffect? {
        val plan = GameHapticPlan.waveform(taps) ?: return null
        return VibrationEffect.createWaveform(plan.timings, plan.amplitudes, NO_REPEAT)
    }

    private fun resolveVibrator(context: Context): Vibrator? =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            (context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager)?.defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
        }

    private companion object {
        const val NO_REPEAT = -1
    }
}

@Composable
public fun rememberGameHaptics(): GameHapticsProviding {
    val context = LocalContext.current
    return remember(context) { GameHaptics(context) }
}
