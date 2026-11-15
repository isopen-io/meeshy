package me.meeshy.sdk.model.appearance

/*
 * FrameMotionPlan (#10935) — MIROIR de `frameMotionLayers` (`packages/shared/utils/frame-motion-svg.ts`)
 * et de `FrameMotionPlan.swift` : les mouvements déclarés d'un cadre deviennent des COUCHES. Les chemins
 * qu'un mouvement anime quittent le dessin fixe pour une couche animée sur transform et opacité SEULES ;
 * le reflet (`sweep`) laisse sa cible dans le dessin fixe et glisse au-dessus, découpé à sa forme.
 *
 * Les éléments qui bougent EXACTEMENT ensemble (même chaîne, mêmes origines, mêmes délais) partagent une
 * couche ; un décalage (`stagger`) ou une origine propre (`self`) en fait des couches distinctes.
 * Sur divergence, le TypeScript a raison.
 */

public enum class FrameStepDirection { NORMAL, REVERSE, ALTERNATE, ALTERNATE_REVERSE }

public enum class FrameStepKind { ROTATE, PULSE, TWINKLE, SKEW }

public data class FramePoint(val x: Double, val y: Double)

public data class FrameBounds(val minX: Double, val minY: Double, val maxX: Double, val maxY: Double) {
    val midX: Double get() = (minX + maxX) / 2
    val midY: Double get() = (minY + maxY) / 2
}

/** Un mouvement appliqué à une couche, dans le repère du dessin (viewBox). */
public data class FrameMotionStep(
    val kind: FrameStepKind,
    val duration: Double,
    val delay: Double,
    val direction: FrameStepDirection,
    /** Degrés (rotation, inclinaison), échelle (pulsation) ou opacité (scintillement) : de [from] à [to]. */
    val from: Double,
    val to: Double,
    /** `true` : vitesse constante (le tour complet) ; sinon accélère puis ralentit. */
    val linear: Boolean,
    val origin: FramePoint,
)

public data class FrameMotionLayerPlan(val elements: List<Int>, val chain: List<FrameMotionStep>)

public data class FrameSweepPlan(
    val elements: List<Int>,
    val duration: Double,
    val delay: Double,
    val reverse: Boolean,
)

public data class FrameMotionElement(val group: String?, val bounds: FrameBounds?)

public data class FrameMotionPlan(
    val layers: List<FrameMotionLayerPlan>,
    val sweeps: List<FrameSweepPlan>,
    /** Les éléments qui quittent le dessin fixe (le reflet laisse sa cible en place). */
    val animated: Set<Int>,
) {
    val isStill: Boolean get() = layers.isEmpty() && sweeps.isEmpty()

    public companion object {
        public val STILL: FrameMotionPlan = FrameMotionPlan(emptyList(), emptyList(), emptySet())

        public fun make(
            elements: List<FrameMotionElement>,
            motions: List<FrameMotion>,
            center: FramePoint,
        ): FrameMotionPlan {
            val chains = List(elements.size) { mutableListOf<FrameMotionStep>() }
            val sweeps = mutableListOf<FrameSweepPlan>()
            for (motion in motions) {
                val targets = motion.targets.flatMap { target ->
                    elements.indices.filter { elements[it].group == target }
                }
                if (targets.isEmpty()) continue
                if (motion.kind == FrameMotionKind.SWEEP) {
                    sweeps += FrameSweepPlan(
                        elements = targets,
                        duration = motion.duration,
                        delay = motion.delay ?: 0.0,
                        reverse = motion.direction == FrameMotionDirection.REVERSE,
                    )
                    continue
                }
                targets.forEachIndexed { order, element ->
                    val delay = (motion.delay ?: 0.0) + order * (motion.stagger ?: 0.0)
                    val origin = originOf(motion, elements[element].bounds, center)
                    stepOf(motion, delay, origin)?.let { chains[element] += it }
                }
            }
            val grouped = LinkedHashMap<List<FrameMotionStep>, MutableList<Int>>()
            chains.forEachIndexed { element, chain ->
                if (chain.isNotEmpty()) grouped.getOrPut(chain.toList()) { mutableListOf() } += element
            }
            val layers = grouped.map { (chain, members) -> FrameMotionLayerPlan(members.toList(), chain) }
            return FrameMotionPlan(layers, sweeps, layers.flatMap { it.elements }.toSet())
        }

        private fun originOf(motion: FrameMotion, bounds: FrameBounds?, center: FramePoint): FramePoint {
            val fallback = when (motion.kind) {
                FrameMotionKind.TWINKLE, FrameMotionKind.SWEEP -> return center
                FrameMotionKind.ROTATE -> FrameMotionOrigin.FRAME
                FrameMotionKind.PULSE -> FrameMotionOrigin.SELF
                FrameMotionKind.SKEW -> FrameMotionOrigin.TOP
            }
            if (bounds == null) return center
            return when (motion.origin ?: fallback) {
                FrameMotionOrigin.FRAME -> center
                FrameMotionOrigin.SELF -> FramePoint(bounds.midX, bounds.midY)
                FrameMotionOrigin.TOP -> FramePoint(bounds.midX, bounds.minY)
                FrameMotionOrigin.BOTTOM -> FramePoint(bounds.midX, bounds.maxY)
            }
        }

        private fun stepOf(motion: FrameMotion, delay: Double, origin: FramePoint): FrameMotionStep? {
            val reverse = motion.direction == FrameMotionDirection.REVERSE
            fun make(
                kind: FrameStepKind,
                direction: FrameStepDirection,
                from: Double,
                to: Double,
                linear: Boolean = false,
            ) = FrameMotionStep(kind, motion.duration, delay, direction, from, to, linear, origin)
            return when (motion.kind) {
                FrameMotionKind.ROTATE -> {
                    val amplitude = motion.amplitude ?: 360.0
                    if (motion.direction == FrameMotionDirection.ALTERNATE) {
                        make(FrameStepKind.ROTATE, FrameStepDirection.ALTERNATE, -amplitude, amplitude)
                    } else {
                        make(
                            FrameStepKind.ROTATE,
                            if (reverse) FrameStepDirection.REVERSE else FrameStepDirection.NORMAL,
                            0.0,
                            amplitude,
                            linear = amplitude == 360.0,
                        )
                    }
                }
                FrameMotionKind.PULSE ->
                    make(FrameStepKind.PULSE, FrameStepDirection.NORMAL, 1.0, 1.0 + (motion.amplitude ?: 0.1))
                FrameMotionKind.TWINKLE ->
                    make(FrameStepKind.TWINKLE, FrameStepDirection.NORMAL, 1.0, 1.0 - (motion.amplitude ?: 0.75))
                FrameMotionKind.SKEW -> {
                    val amplitude = motion.amplitude ?: 7.0
                    make(
                        FrameStepKind.SKEW,
                        if (reverse) FrameStepDirection.ALTERNATE_REVERSE else FrameStepDirection.ALTERNATE,
                        -amplitude,
                        amplitude,
                    )
                }
                FrameMotionKind.SWEEP -> null
            }
        }
    }
}
