package me.meeshy.sdk.model.call.effects

import me.meeshy.sdk.model.call.CallFaceEffect
import me.meeshy.sdk.model.call.VideoFilterConfig
import me.meeshy.sdk.model.call.VideoFilterPreset
import me.meeshy.sdk.model.call.activeFaceEffect
import me.meeshy.sdk.model.call.activePreset
import me.meeshy.sdk.model.call.applyingPreset
import me.meeshy.sdk.model.call.selectingFaceEffect
import me.meeshy.sdk.model.call.withBackgroundBlur
import me.meeshy.sdk.model.call.withBrightness
import me.meeshy.sdk.model.call.withSmoothingIntensity

/** The two rows of the « Effets » mode, in iOS order: the face, then the colour. iOS `CallEffectsCategory`. */
enum class CallEffectsCategory { Face, Color }

/**
 * **LE MODE « EFFETS » DE L'APPEL** — miroir de iOS `CallEffectsModeRule` (`CallModeRules.swift`). The
 * catalogue keeps iOS order; a face effect the device cannot draw is NOT offered (a control exists only
 * if it has an effect), the rest of the order is untouched.
 */
object CallEffectsModeRule {
    val colors: List<VideoFilterPreset> = VideoFilterPreset.entries

    /** The face effects this device draws, in iOS order. */
    fun faces(drawable: Set<CallFaceEffect>): List<CallFaceEffect> =
        CallFaceEffect.entries.filter { it == CallFaceEffect.None || it in drawable }

    fun colorSelection(config: VideoFilterConfig): VideoFilterPreset = config.activePreset ?: VideoFilterPreset.Natural

    /** Natural is « no look »: picking it turns the colorimetry off instead of grading with an identity. */
    fun applying(color: VideoFilterPreset, to: VideoFilterConfig): VideoFilterConfig =
        to.applyingPreset(if (color == VideoFilterPreset.Natural) null else color)

    /** Quitting restores the image as it was; validating keeps the current one. */
    fun exiting(validated: Boolean, current: VideoFilterConfig, original: VideoFilterConfig): VideoFilterConfig =
        if (validated) current else original

    /** The carousel step of TalkBack's « next / previous »: bounded, never wrapping (iOS `stepping`). */
    fun <T> stepping(selection: T, items: List<T>, by: Int): T {
        val index = items.indexOf(selection)
        if (index < 0) return items.firstOrNull() ?: selection
        return items[(index + by).coerceIn(0, items.lastIndex)]
    }
}

/**
 * What the « Effets » mode holds while it is open: the config being tried ([current], applied live to the
 * sent camera) and the one it started from ([original]), restored by « Quitter ». Pure reducer.
 */
data class CallEffectsModeState(
    val current: VideoFilterConfig,
    val original: VideoFilterConfig,
    val category: CallEffectsCategory = CallEffectsCategory.Face,
    val showsSettings: Boolean = false,
) {
    val face: CallFaceEffect get() = current.activeFaceEffect
    val color: VideoFilterPreset get() = CallEffectsModeRule.colorSelection(current)
    val showsSmoothingStrength: Boolean get() = face == CallFaceEffect.Smoothing

    fun selecting(effect: CallFaceEffect): CallEffectsModeState = copy(current = current.selectingFaceEffect(effect))
    fun selecting(preset: VideoFilterPreset): CallEffectsModeState = copy(current = CallEffectsModeRule.applying(preset, current))
    fun showing(category: CallEffectsCategory): CallEffectsModeState = copy(category = category)
    fun togglingSettings(): CallEffectsModeState = copy(showsSettings = !showsSettings)
    fun withBrightness(value: Float): CallEffectsModeState = copy(current = current.withBrightness(value))
    fun withSmoothing(value: Float): CallEffectsModeState = copy(current = current.withSmoothingIntensity(value))
    fun togglingBlur(): CallEffectsModeState = copy(current = current.withBackgroundBlur(!current.backgroundBlurEnabled))

    /** The config the call keeps once the mode closes. */
    fun exiting(validated: Boolean): VideoFilterConfig = CallEffectsModeRule.exiting(validated, current, original)

    companion object {
        fun opening(config: VideoFilterConfig): CallEffectsModeState = CallEffectsModeState(current = config, original = config)
    }
}
