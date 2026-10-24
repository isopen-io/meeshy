package me.meeshy.app.calls

import android.content.Context
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import androidx.annotation.RequiresApi
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * The vocabulary of a call's haptic feedback — the same six beats the iOS
 * `HapticFeedback` gives its call gestures: three impacts by weight and three
 * outcomes.
 */
enum class CallHapticKind { Light, Medium, Heavy, Success, Warning, Error }

/**
 * The output seam for haptic feedback during a call. A capability asks for a
 * beat by NAME ([CallHapticKind]); how it is felt is the platform's business, and
 * a device without a vibrator (a tablet, an emulator, a vibrator turned off by
 * policy) simply feels nothing. [play] never throws.
 */
interface CallHaptics {
    fun play(kind: CallHapticKind)
}

/**
 * Production haptics: the platform's predefined effects where they exist
 * (API 29+), a calibrated one-shot below. Pure platform glue — every entry
 * point degrades to silence rather than failing a call.
 */
@Singleton
class AndroidCallHaptics @Inject constructor(
    @ApplicationContext private val context: Context,
) : CallHaptics {

    override fun play(kind: CallHapticKind) {
        runCatching {
            val vibrator = vibrator() ?: return
            if (!vibrator.hasVibrator()) return
            vibrator.vibrate(effectFor(kind))
        }
    }

    @Suppress("DEPRECATION")
    private fun vibrator(): Vibrator? =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            context.getSystemService(VibratorManager::class.java)?.defaultVibrator
        } else {
            context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
        }

    private fun effectFor(kind: CallHapticKind): VibrationEffect =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            VibrationEffect.createPredefined(predefinedFor(kind))
        } else {
            oneShotFor(kind)
        }

    @RequiresApi(Build.VERSION_CODES.Q)
    private fun predefinedFor(kind: CallHapticKind): Int = when (kind) {
        CallHapticKind.Light -> VibrationEffect.EFFECT_TICK
        CallHapticKind.Medium, CallHapticKind.Success -> VibrationEffect.EFFECT_CLICK
        CallHapticKind.Heavy, CallHapticKind.Warning -> VibrationEffect.EFFECT_HEAVY_CLICK
        CallHapticKind.Error -> VibrationEffect.EFFECT_DOUBLE_CLICK
    }

    private fun oneShotFor(kind: CallHapticKind): VibrationEffect {
        val (durationMs, amplitude) = when (kind) {
            CallHapticKind.Light -> 10L to 60
            CallHapticKind.Medium, CallHapticKind.Success -> 20L to 120
            CallHapticKind.Heavy, CallHapticKind.Warning -> 35L to 200
            CallHapticKind.Error -> 50L to 255
        }
        return VibrationEffect.createOneShot(durationMs, amplitude)
    }
}
