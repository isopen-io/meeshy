package me.meeshy.app.stories

import androidx.compose.runtime.Immutable
import me.meeshy.sdk.lang.LanguageCodeNormalizer
import me.meeshy.sdk.model.StoryKeyframe
import me.meeshy.sdk.model.StoryTextEffect
import me.meeshy.sdk.model.StoryTextObject

/**
 * A text overlay on a slide, projected for the viewer canvas. Pure data.
 *
 * Position/scale are normalised canvas fractions (0..1), matching the wire model,
 * with [x]/[y] the layer's center anchor. [opacity]/[x]/[y]/[scale] are the layer's
 * *static* base transform; when the object carries [keyframes] or its own
 * [fadeIn]/[fadeOut] envelope, call [animated] with the playhead to obtain the
 * transform for that instant. [text] is already resolved through the Prisme
 * Linguistique chain (see [StoryTextObjectProjection.resolveText]); [colorHex] and
 * [align] carry the authored style for rendering. [background] is the resolved
 * frosted-glass/solid text backing (see [StoryTextBackground.resolve]) the canvas
 * paints behind the glyphs. Unlike a media clip, a text object never participates
 * in a clip transition, so none is folded here.
 */
@Immutable
data class StoryTextObjectView(
    val id: String,
    val text: String,
    val x: Double,
    val y: Double,
    val scale: Double,
    val rotation: Double,
    val opacity: Double = 1.0,
    val fontSize: Double,
    val colorHex: String?,
    val align: String?,
    val startTime: Double = 0.0,
    val duration: Double = 0.0,
    val fadeIn: Double = 0.0,
    val fadeOut: Double = 0.0,
    val keyframes: List<StoryKeyframe> = emptyList(),
    val background: StoryTextBackground = StoryTextBackground.None,
    /** The EFFECT axis (#4870) — glow / shadow / relief — the canvas paints over the glyphs. */
    val effect: StoryTextEffect = StoryTextEffect.NONE,
) {
    /**
     * The layer's transform at [atSeconds] (absolute playhead). Returns `this`
     * unchanged when nothing animates — no keyframes that key a channel AND no
     * fadeIn/fadeOut envelope active at this instant. Otherwise a copy whose
     * [x]/[y]/[scale] follow the interpolated keyframe animation (un-keyed channels
     * holding their static base) and whose [opacity] folds together, in iOS render
     * order, the object's own fade envelope over its keyframe/static opacity.
     *
     * Opacity precedence mirrors iOS `StoryRenderer` (`fade ?? keyframeOpacity ??
     * base`): a live [fadeIn]/[fadeOut] envelope value OVERRIDES the keyframe/static
     * opacity. Keyframe and fade times are offsets from [startTime], per the
     * timeline spec. Pure — the Compose canvas ticks a clock in and renders the result.
     */
    /**
     * Whether this text overlay is drawn at [atSeconds] (absolute playhead) — the
     * sharp play-mode timing-window gate the Compose canvas consults before laying
     * out the layer. Delegates to [StoryElementVisibility]: an untimed object
     * (duration `0`) is always visible; a timed one only inside
     * `[startTime, startTime + duration)`. Pure.
     */
    fun isVisible(atSeconds: Float): Boolean =
        StoryElementVisibility.isVisible(startTime, duration, atSeconds.toDouble())

    fun animated(atSeconds: Float): StoryTextObjectView {
        val resolved = StoryKeyframeResolver.resolve(
            keyframes = keyframes,
            currentTime = atSeconds,
            startTime = startTime.toFloat(),
            baseX = x,
            baseY = y,
            baseScale = scale,
            baseOpacity = opacity,
        )
        val fadeEnvelope = StoryMediaFadeResolver.fadeOpacity(
            fadeIn = fadeIn.takeIf { it > 0.0 },
            fadeOut = fadeOut.takeIf { it > 0.0 },
            startTime = startTime,
            duration = duration.takeIf { it > 0.0 },
            currentTime = atSeconds.toDouble(),
        )
        if (resolved == null && fadeEnvelope == null) return this

        val base = resolved ?: ResolvedKeyframeTransform(x = x, y = y, scale = scale, opacity = opacity)
        return copy(
            x = base.x,
            y = base.y,
            scale = base.scale,
            opacity = fadeEnvelope ?: base.opacity,
        )
    }
}

/**
 * Pure projection of a wire [StoryTextObject] into a viewer [StoryTextObjectView].
 * Text is resolved through the Prisme Linguistique chain — the Android port of iOS
 * `StoryTextObject.resolvedText(preferredLanguages:)` (`StoryModels.swift`).
 */
object StoryTextObjectProjection {

    /**
     * The displayable text for [textObject] under the reader's [preferredLanguages]
     * (ordered, highest priority first). Each language tries an exact key, then a
     * normalised (case/region-insensitive) match, BEFORE moving to the next — so
     * chain priority is preserved and an exact key wins over a normalised sibling.
     * Falls back to the object's original [StoryTextObject.text] when no translation
     * matches (Prisme rule 1: absent target ⇒ show the original).
     *
     * [overrideLanguage] is the ephemeral "Exploration" pick from the language bar
     * (iOS `sessionLanguageOverride` parity, mirroring [StoryContentResolver]): it is
     * tried FIRST, without removing the preference chain — an override with no matching
     * translation falls back to the normal Prisme resolution. A blank/null override is
     * inert, resolving exactly as [preferredLanguages] alone would.
     */
    fun resolveText(
        textObject: StoryTextObject,
        preferredLanguages: List<String>,
        overrideLanguage: String? = null,
    ): String {
        val translations = textObject.translations
        val languages = if (overrideLanguage.isNullOrBlank()) {
            preferredLanguages
        } else {
            listOf(overrideLanguage) + preferredLanguages
        }
        if (translations.isNullOrEmpty() || languages.isEmpty()) return textObject.text
        for (lang in languages) {
            translations[lang]?.let { return it }
            val target = base(lang)
            translations.entries.firstOrNull { base(it.key) == target }?.let { return it.value }
        }
        return textObject.text
    }

    /**
     * Projects [textObject] into the viewer view, resolving its text via
     * [resolveText] and carrying its transform, timing and keyframe fields so the
     * canvas can animate it. Absent timing fields default to `0` (a non-timed
     * object is always visible), and absent keyframes to an empty list. The text
     * backing is resolved once via [StoryTextBackground.resolve] (modern
     * `backgroundStyle` over legacy `textBg`, both tolerantly), so an iOS/web-authored
     * frosted-glass or solid backdrop renders on Android too.
     * [overrideLanguage] threads the "Exploration" pick through to [resolveText].
     */
    fun project(
        textObject: StoryTextObject,
        preferredLanguages: List<String>,
        overrideLanguage: String? = null,
    ): StoryTextObjectView =
        StoryTextObjectView(
            id = textObject.id,
            text = resolveText(textObject, preferredLanguages, overrideLanguage),
            x = textObject.x,
            y = textObject.y,
            scale = textObject.scale,
            rotation = textObject.rotation,
            fontSize = textObject.fontSize,
            colorHex = textObject.textColor,
            align = textObject.textAlign,
            startTime = textObject.startTime ?: 0.0,
            duration = textObject.duration ?: 0.0,
            fadeIn = textObject.fadeIn ?: 0.0,
            fadeOut = textObject.fadeOut ?: 0.0,
            keyframes = textObject.keyframes.orEmpty(),
            background = StoryTextBackground.resolve(textObject.backgroundStyle, textObject.textBg),
            effect = StoryTextEffect.fromWire(textObject.textEffect),
        )

    /**
     * The Prisme match key for a language code: the canonical Meeshy code when the
     * normaliser recognises it, else a lowercased region-stripped split (mirror of
     * iOS `StoryPrismeMatch.base`). Applied to BOTH the preferred code and the
     * translation key so `"fr-FR"`, `"FR"`, `"fra"` all collapse onto `"fr"`.
     */
    private fun base(code: String): String =
        LanguageCodeNormalizer.normalize(code)
            ?: code.split('-', '_').firstOrNull()?.lowercase()
            ?: code.lowercase()
}
