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

/** Le genre de la pile de couches que porte cette rangée de looks. */
val CallEffectsCategory.kind: CallEffectKind
    get() = when (this) {
        CallEffectsCategory.Face -> CallEffectKind.Face
        CallEffectsCategory.Color -> CallEffectKind.Color
    }

/** La rangée d'Effets qui porte [this] ; `null` pour un genre qu'Effets n'a pas (le cadre vit au Montage). */
val CallEffectKind.category: CallEffectsCategory?
    get() = CallEffectsCategory.entries.firstOrNull { it.kind == this }

/**
 * **LE MODE « EFFETS » DE L'APPEL** — miroir de iOS `CallEffectsModeRule` (`CallModeRules.swift`). The
 * catalogue keeps iOS order (the eight moods of [VideoFilterPreset.catalog]), and every face effect of iOS is drawn
 * on the sent image (#13706).
 */
object CallEffectsModeRule {
    val colors: List<VideoFilterPreset> = VideoFilterPreset.catalog

    /** The face effects, in iOS order (iOS `faces = CallFaceEffect.allCases`). */
    val faces: List<CallFaceEffect> = CallFaceEffect.entries

    fun colorSelection(config: VideoFilterConfig): VideoFilterPreset = config.activePreset ?: VideoFilterPreset.Natural

    /** Natural is « no look »: picking it turns the colorimetry off instead of grading with an identity. */
    fun applying(color: VideoFilterPreset, to: VideoFilterConfig): VideoFilterConfig =
        to.applyingPreset(if (color == VideoFilterPreset.Natural) null else color)

    /**
     * (+) « Ajouter un autre look » (loi 14, #16979) : la rangée d'un genre ABSENT de la pile, par-dessus ce qu'on a ;
     * refusé, pile pleine. Quand les deux genres d'Effets sont déjà posés, (+) laisse parcourir l'autre rangée pour en
     * changer le look. iOS `addingLook(from:layers:)`.
     */
    fun addingLook(from: CallEffectsCategory, layers: CallEffectLayers = CallEffectLayers.EMPTY): CallEffectsCategory? =
        addingKind(from.kind, CallEffectsCategory.entries.map { it.kind }, layers)?.category

    /**
     * Le genre qu'ouvre (+) depuis [from], parmi [among] : un genre absent de la pile d'abord, sinon l'autre genre offert ;
     * `null` quand la pile est pleine ou qu'il n'y a pas d'autre genre.
     */
    fun addingKind(from: CallEffectKind, among: List<CallEffectKind>, layers: CallEffectLayers): CallEffectKind? {
        if (layers.isFull) return null
        return layers.opening(from, among) ?: among.firstOrNull { it != from }
    }

    /** La rangée sur laquelle Effets s'ouvre : celle du premier genre qui manque à la pile, Visage d'abord. */
    fun startingCategory(layers: CallEffectLayers): CallEffectsCategory =
        CallEffectsCategory.entries.firstOrNull { it.kind !in layers } ?: CallEffectsCategory.Face

    /** The carousel step of TalkBack's « next / previous »: bounded, never wrapping (iOS `stepping`). */
    fun <T> stepping(selection: T, items: List<T>, by: Int): T {
        val index = items.indexOf(selection)
        if (index < 0) return items.firstOrNull() ?: selection
        return items[(index + by).coerceIn(0, items.lastIndex)]
    }
}

/**
 * P8b.6 — with Settings open, the looks strip and the chips fade out while the panel rises from the tightened bar
 * (≈ 200 ms, transform + opacity), and back down on the way out. Reduce Motion keeps a short fade, no rise: the screen
 * never changes at once. iOS `CallEffectsSettingsMotion`.
 */
object CallEffectsSettingsMotion {
    private const val RISE_DP = 20
    private const val DURATION_MILLIS = 200
    private const val REDUCED_DURATION_MILLIS = 150

    fun durationMillis(reduceMotion: Boolean): Int = if (reduceMotion) REDUCED_DURATION_MILLIS else DURATION_MILLIS
    fun riseDp(reduceMotion: Boolean): Int = if (reduceMotion) 0 else RISE_DP
}

/**
 * What the « Effets » mode holds while it is open: the config being tried ([current]), applied live to the sent
 * camera and kept as it is when the mode closes (no Quit, no Validate: law 14), the [layers] stack it shares with the
 * Montage (three at most), and what the bar shows under the looks ([bar]). Pure reducer.
 */
data class CallEffectsModeState(
    val current: VideoFilterConfig,
    val category: CallEffectsCategory = CallEffectsCategory.Face,
    val bar: CallEffectsBarMode = CallEffectsBarMode.Base,
    val layers: CallEffectLayers = CallEffectLayers.EMPTY,
) {
    val face: CallFaceEffect get() = current.activeFaceEffect
    val color: VideoFilterPreset get() = CallEffectsModeRule.colorSelection(current)
    val showsSmoothingStrength: Boolean get() = face == CallFaceEffect.Smoothing
    val showsSettings: Boolean get() = bar == CallEffectsBarMode.Settings
    val showsApplied: Boolean get() = bar == CallEffectsBarMode.Applied

    /** Un effet de visage se pose s'il y a de la place dans la pile (« Aucun » se pose toujours). */
    fun allows(effect: CallFaceEffect): Boolean = effect == CallFaceEffect.None || layers.allows(CallEffectKind.Face)

    /** Un effet refusé par la pile pleine ne change rien : ni l'image, ni la pile. */
    fun selecting(effect: CallFaceEffect): CallEffectsModeState =
        if (allows(effect)) following(current.selectingFaceEffect(effect)) else this

    fun selecting(preset: VideoFilterPreset): CallEffectsModeState =
        if (preset == VideoFilterPreset.Natural || layers.allows(CallEffectKind.Color)) {
            following(CallEffectsModeRule.applying(preset, current))
        } else {
            this
        }

    fun showing(category: CallEffectsCategory): CallEffectsModeState = copy(category = category)
    fun togglingSettings(): CallEffectsModeState = copy(bar = CallEffectsBarRule.afterSettings(bar))
    fun withBrightness(value: Float): CallEffectsModeState = copy(current = current.withBrightness(value))
    fun withSmoothing(value: Float): CallEffectsModeState = copy(current = current.withSmoothingIntensity(value))
    fun togglingBlur(): CallEffectsModeState = copy(current = current.withBackgroundBlur(!current.backgroundBlurEnabled))

    /** (+): the row of a genre missing from the stack, the bar back to its base menu; refused with three layers. */
    fun addingLook(): CallEffectsModeState {
        val next = CallEffectsModeRule.addingLook(category, layers) ?: return this
        return copy(category = next, bar = CallEffectsBarRule.afterAddingLook(bar))
    }

    /** Long press on (+): the applied effects, when there are some. */
    fun showingApplied(): CallEffectsModeState = copy(bar = CallEffectsBarRule.afterShowingApplied(bar, hasLayers = !layers.isEmpty))

    /** Undoing one effect removes that layer alone, closes the list and gives the base menu back. */
    fun removing(kind: CallEffectKind): CallEffectsModeState = copy(
        current = CallEffectsStackRule.removing(kind, current),
        layers = layers.removing(kind),
        bar = CallEffectsBarRule.afterRemoval,
    )

    private fun following(config: VideoFilterConfig): CallEffectsModeState = copy(
        current = config,
        layers = CallEffectsStackRule.layers(layers, frame = layers.choice(CallEffectKind.Frame), config = config),
    )

    companion object {
        /** The mode opens on [category] (the genre the stack lacks by default), over the [layers] the call already holds. */
        fun opening(
            config: VideoFilterConfig,
            layers: CallEffectLayers = CallEffectLayers.EMPTY,
            category: CallEffectsCategory? = null,
        ): CallEffectsModeState {
            val held = CallEffectsStackRule.layers(layers, frame = layers.choice(CallEffectKind.Frame), config = config)
            return CallEffectsModeState(current = config, category = category ?: CallEffectsModeRule.startingCategory(held), layers = held)
        }
    }
}
