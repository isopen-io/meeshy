package me.meeshy.ui.component.kit

import kotlin.math.floor

/**
 * Le haptique d'un curseur : un tic aux crans (neutre, bornes, remise), jamais par pas. Miroir de
 * `MeeshyLabeledSliderHaptic` (iOS).
 */
public enum class MeeshyLabeledSliderHaptic { Light, None }

/**
 * La loi d'un curseur continu : bornage, calage sur le pas, fraction et ajustement. Pure, sans vue : [step] est la TAILLE
 * du pas, `null` pour une valeur continue (un pas nul ou négatif compte comme continu). Miroir de
 * `MeeshyLabeledSliderRule` (iOS).
 */
public class MeeshyLabeledSliderRule(
    public val range: ClosedFloatingPointRange<Float>,
    step: Float? = null,
) {
    public val step: Float? = step?.takeIf { it > 0f }

    private val span: Float get() = range.endInclusive - range.start

    public fun snap(value: Float): Float {
        val bounded = value.coerceIn(range)
        val step = step ?: return bounded
        val detent = range.start + roundAwayFromZero((bounded - range.start) / step) * step
        return detent.coerceIn(range)
    }

    /** La part de la piste remplie, depuis le bord de GAUCHE : en RTL, le miroir. */
    public fun fraction(of: Float, isRtl: Boolean = false): Float {
        if (span <= 0f) return 0f
        val base = (snap(of) - range.start) / span
        return if (isRtl) 1f - base else base
    }

    /** La valeur sous une fraction lue depuis le bord de GAUCHE. */
    public fun value(atFraction: Float, isRtl: Boolean = false): Float {
        val bounded = atFraction.coerceIn(0f, 1f)
        return snap(range.start + (if (isRtl) 1f - bounded else bounded) * span)
    }

    /** Une flèche : le pas (1 % de l'étendue si continu). [coarse] : 5 % de l'étendue, arrondi au pas, un pas au moins. */
    public fun adjusted(value: Float, up: Boolean, coarse: Boolean): Float {
        val delta = if (coarse) coarseDelta else step ?: (span * FINE_FRACTION)
        return snap(value + if (up) delta else -delta)
    }

    private val coarseDelta: Float
        get() {
            val step = step ?: return span * COARSE_FRACTION
            return maxOf(roundAwayFromZero(span * COARSE_FRACTION / step), 1f) * step
        }

    /** Le tic : la valeur franchit (ou rejoint) le neutre, ou atteint une borne. */
    public fun detentCrossed(from: Float, to: Float, neutral: Float?): Boolean {
        val crossesNeutral = neutral?.let { neutre ->
            val before = from - neutre
            val after = to - neutre
            before * after < 0f || (after == 0f && before != 0f)
        } ?: false
        val reachesBound = (from < range.endInclusive && to >= range.endInclusive) ||
            (from > range.start && to <= range.start)
        return crossesNeutral || reachesBound
    }

    public fun shouldEmit(previous: Float, next: Float): Boolean = snap(previous) != snap(next)

    public companion object {
        /** Le balayage du lecteur d'écran et Page préc. / suiv. : 5 % de l'étendue. */
        public const val COARSE_FRACTION: Float = 0.05f

        /** Une flèche sur une valeur continue : 1 % de l'étendue. */
        public const val FINE_FRACTION: Float = 0.01f
    }
}

/** Arrondi à l'entier le plus proche, moitié s'éloignant de zéro (comme `rounded()` côté iOS, pas le bankers rounding). */
private fun roundAwayFromZero(x: Float): Float = if (x < 0f) -floor(-x + 0.5f) else floor(x + 0.5f)

/** Ce qu'un geste ou une commande demande, dans l'ordre : dire à l'hôte qu'on édite, poser une valeur, jouer le tic. */
public sealed interface MeeshyLabeledSliderEffect {
    public data class Editing(val isEditing: Boolean) : MeeshyLabeledSliderEffect
    public data class Value(val value: Float) : MeeshyLabeledSliderEffect
    public data object Haptic : MeeshyLabeledSliderEffect
}

/**
 * Une commande au clavier ou au lecteur d'écran. Les flèches horizontales s'inversent en RTL ; Page et le balayage valent
 * 5 % ; Suppr remet au neutre.
 */
public enum class MeeshyLabeledSliderCommand {
    ArrowLeft,
    ArrowRight,
    ArrowUp,
    ArrowDown,
    PageUp,
    PageDown,
    Home,
    End,
    Reset,
}

/**
 * L'interaction d'un curseur en VALEURS : chaque geste rend ses effets, l'hôte les joue. Désactivé, rien ne part (ni valeur,
 * ni édition, ni haptique). Miroir de `MeeshyLabeledSliderInteraction` (iOS).
 */
public class MeeshyLabeledSliderInteraction(
    public val rule: MeeshyLabeledSliderRule,
    neutral: Float?,
    public val haptic: MeeshyLabeledSliderHaptic,
    public val isEnabled: Boolean,
) {
    public val neutral: Float? = neutral?.let { rule.snap(it) }

    /** Le doigt glisse : l'édition commence au premier contact, puis la valeur calée, seulement si elle change. */
    public fun drag(current: Float, toFraction: Float, isRtl: Boolean, isEditing: Boolean): List<MeeshyLabeledSliderEffect> {
        if (!isEnabled) return emptyList()
        val next = rule.value(atFraction = toFraction, isRtl = isRtl)
        val begin: List<MeeshyLabeledSliderEffect> =
            if (isEditing) emptyList() else listOf(MeeshyLabeledSliderEffect.Editing(true))
        if (!rule.shouldEmit(previous = current, next = next)) return begin
        return begin + MeeshyLabeledSliderEffect.Value(next) + tic(from = current, to = next)
    }

    /** Le doigt se lève, le geste est annulé ou le curseur disparaît doigt posé. */
    public fun release(isEditing: Boolean): List<MeeshyLabeledSliderEffect> =
        if (isEditing) listOf(MeeshyLabeledSliderEffect.Editing(false)) else emptyList()

    /** Un toucher bref sur la piste : le pouce y va, en un seul pas d'annulation. */
    public fun jump(current: Float, toFraction: Float, isRtl: Boolean): List<MeeshyLabeledSliderEffect> =
        commit(from = current, to = rule.value(atFraction = toFraction, isRtl = isRtl), forcedTic = false)

    public fun perform(command: MeeshyLabeledSliderCommand, from: Float, isRtl: Boolean): List<MeeshyLabeledSliderEffect> =
        when (command) {
            MeeshyLabeledSliderCommand.ArrowRight -> commit(from, rule.adjusted(from, up = !isRtl, coarse = false), forcedTic = false)
            MeeshyLabeledSliderCommand.ArrowLeft -> commit(from, rule.adjusted(from, up = isRtl, coarse = false), forcedTic = false)
            MeeshyLabeledSliderCommand.ArrowUp -> commit(from, rule.adjusted(from, up = true, coarse = false), forcedTic = false)
            MeeshyLabeledSliderCommand.ArrowDown -> commit(from, rule.adjusted(from, up = false, coarse = false), forcedTic = false)
            MeeshyLabeledSliderCommand.PageUp -> commit(from, rule.adjusted(from, up = true, coarse = true), forcedTic = false)
            MeeshyLabeledSliderCommand.PageDown -> commit(from, rule.adjusted(from, up = false, coarse = true), forcedTic = false)
            MeeshyLabeledSliderCommand.Home -> commit(from, rule.range.start, forcedTic = false)
            MeeshyLabeledSliderCommand.End -> commit(from, rule.range.endInclusive, forcedTic = false)
            MeeshyLabeledSliderCommand.Reset -> neutral?.let { commit(from, it, forcedTic = true) } ?: emptyList()
        }

    /** L'action « remise au neutre » n'existe qu'avec un neutre et un nom non vide. */
    public fun resetActionName(resetLabel: String?): String? =
        resetLabel?.takeIf { neutral != null && it.isNotEmpty() }

    private fun commit(from: Float, to: Float, forcedTic: Boolean): List<MeeshyLabeledSliderEffect> {
        if (!isEnabled || to == from) return emptyList()
        val feedback = if (forcedTic) playable else tic(from = from, to = to)
        val opening: List<MeeshyLabeledSliderEffect> =
            listOf(MeeshyLabeledSliderEffect.Editing(true), MeeshyLabeledSliderEffect.Value(to))
        return opening + feedback + MeeshyLabeledSliderEffect.Editing(false)
    }

    private fun tic(from: Float, to: Float): List<MeeshyLabeledSliderEffect> =
        if (rule.detentCrossed(from = from, to = to, neutral = neutral)) playable else emptyList()

    private val playable: List<MeeshyLabeledSliderEffect>
        get() = if (haptic == MeeshyLabeledSliderHaptic.Light) listOf(MeeshyLabeledSliderEffect.Haptic) else emptyList()
}
