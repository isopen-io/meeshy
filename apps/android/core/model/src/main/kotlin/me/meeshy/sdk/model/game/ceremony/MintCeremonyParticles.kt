package me.meeshy.sdk.model.game.ceremony

import kotlin.math.PI
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.roundToInt
import kotlin.math.sin
import kotlin.math.sqrt
import me.meeshy.sdk.model.game.MeeshEdition
import me.meeshy.sdk.model.game.ceremony.MintCeremonyEase as E
import me.meeshy.sdk.model.game.ceremony.MintCeremonyStage as Stage

/** Le générateur de la maquette (mulberry32), en arithmétique 32 bits : mêmes tirages que `Math.imul` du web et qu'iOS. */
public class MintCeremonyRandom(seed: Int) {
    private var state: Int = seed * 7919 + 3

    public fun next(): Double {
        state += 0x6D2B79F5
        var t = (state xor (state ushr 15)) * (1 or state)
        t = (t + ((t xor (t ushr 7)) * (61 or t))) xor t
        return ((t xor (t ushr 14)).toLong() and 0xFFFFFFFFL).toDouble() / 4_294_967_296.0
    }
}

/** Une famille de couleurs de la palette de la scène. */
public enum class MintCeremonyInkFamily(public val tones: Int, public val base: Int) {
    Weave(3, 0), Iris(7, 3), Silver(4, 10), Gold(3, 17), Diamond(2, 20), Spark(2, 22), Ash(1, 24),
}

/** Une couleur de la palette, nommée par sa famille et son rang. */
public data class MintCeremonyInk(val family: MintCeremonyInkFamily, val tone: Int) {
    val code: Int get() = family.base + tone

    public companion object {
        public val ASH: MintCeremonyInk = MintCeremonyInk(MintCeremonyInkFamily.Ash, 0)
    }
}

/** UN trait de peinture : une encre, une opacité, et ce qu'elle remplit ; additive (les lumières) ou ordinaire (la cendre). */
public data class MintCeremonyBatch(
    val ink: MintCeremonyInk,
    val opacity: Double,
    val additive: Boolean,
    val rects: List<StageRect>,
    val circles: List<StageRect>,
)

/** Ce qu'une image peint : ses lots, et le nombre de particules peintes (le budget : au plus 4 500 à l'écran). */
public data class MintCeremonyPaint(val batches: List<MintCeremonyBatch>, val painted: Int)

/**
 * LES PARTICULES DE LA CÉRÉMONIE (miroir de `MintCeremonyParticles` iOS et du web) — les étincelles qui quittent ta
 * lumière et tissent le cercle en deux brins croisés, les poussières que Mee et Meo y sèment, une gerbe par coup, le
 * petit nuage du flan qui se pose. Tirées UNE fois par frappe, depuis le numéro de la pièce : la même pièce tisse le
 * même cercle sur les trois plateformes. Une image les range en lots par encre et palier d'opacité ([paint]).
 */
public class MintCeremonyParticles(
    public val weave: List<Weave>,
    public val dust: List<Grain>,
    public val bursts: List<Spark>,
    public val puff: List<Puff>,
) {
    public data class Weave(
        val s: Double,
        val d: Double,
        val phi0: Double,
        val delta: Double,
        val r0: Double,
        val dir: Double,
        val jitter: Double,
        val twinkle: Double,
        val big: Boolean,
        val tone: Int,
    )

    public data class Grain(
        val s: Double,
        val d: Double,
        val origin: StagePoint,
        val target: StagePoint,
        val control: StagePoint,
        val rho: Double,
        val psi: Double,
        val size: Double,
        val material: MintCeremonyDustMaterial,
        val tone: Int,
    )

    public data class Spark(val strike: Int, val x: Double, val y: Double, val vx: Double, val vy: Double, val life: Double, val size: Double, val tone: Int)

    public data class Puff(val x: Double, val y: Double, val vx: Double, val vy: Double, val life: Double)

    public val count: Int get() = weave.size + dust.size + bursts.size + puff.size

    /** Ce qu'une image peint à l'instant [t], en lots ; [stride] 2 ne peint qu'un fil et un grain sur deux. */
    public fun paint(plan: MintCeremonyPlan, t: Double, stride: Int = 1): MintCeremonyPaint {
        val painter = Painter()
        val tt = plan.sceneTime(t)
        val blank = plan.seconds(MintCeremonyPhase.Blank)
        val prism = plan.edition == MeeshEdition.Prism
        val shift = floor(t * 2).toInt()
        val fadeWeave = 1 - E.seg(tt, blank.from, blank.to + 0.15)
        if (fadeWeave > 0) {
            for (index in weave.indices step stride) {
                val w = weave[index]
                val at = position(w, plan, tt) ?: continue
                val a = at.second * fadeWeave * (0.62 + 0.38 * sin(t * 13 + w.twinkle))
                if (a < 0.02) continue
                val ink = if (prism) MintCeremonyInk(MintCeremonyInkFamily.Iris, pick(w.tone + shift, 7)) else MintCeremonyInk(MintCeremonyInkFamily.Weave, pick(w.tone, 3))
                painter.rect(ink, a * 0.2, at.first, 4.8)
                painter.rect(ink, a, at.first, if (w.big) 2.2 else 1.5)
                painter.painted += 1
            }
        }
        paintDust(painter, plan, t, tt, shift, stride)
        bursts.forEach { b ->
            val at = (plan.strikes.getOrNull(b.strike)?.impactMs?.toDouble() ?: Double.POSITIVE_INFINITY) / 1000
            val dt = t - at
            if (dt < 0 || dt > b.life) return@forEach
            val a = 1 - dt / b.life
            val point = StagePoint(b.x + b.vx * dt, b.y + b.vy * dt + 300 * dt * dt)
            val ink = if (prism) MintCeremonyInk(MintCeremonyInkFamily.Iris, pick(b.tone + shift, 7)) else MintCeremonyInk(MintCeremonyInkFamily.Spark, pick(b.tone, 2))
            painter.rect(ink, a, point, b.size)
            painter.rect(ink, a * 0.25, point, 5.0)
            painter.painted += 1
        }
        val landed = plan.seconds(MintCeremonyPhase.Descent).to
        puff.forEach { p ->
            val dp = tt - landed
            if (dp < 0 || dp > p.life) return@forEach
            painter.circle(0.55 * (1 - dp / p.life), StagePoint(p.x + p.vx * dp, p.y + p.vy * dp), 2 + dp * 9)
            painter.painted += 1
        }
        return MintCeremonyPaint(painter.batches(), painter.painted)
    }

    private fun paintDust(painter: Painter, plan: MintCeremonyPlan, t: Double, tt: Double, shift: Int, stride: Int) {
        val blank = plan.seconds(MintCeremonyPhase.Blank)
        val fadeDust = 1 - E.seg(tt, blank.from + 0.1, blank.to)
        if (fadeDust <= 0) return
        for (index in dust.indices step stride) {
            val g = dust[index]
            if (tt < g.s) continue
            val a = E.seg(tt, g.s, g.s + 0.08) * fadeDust
            if (a < 0.02) continue
            val point = position(g, tt)
            val ink = when (g.material) {
                MintCeremonyDustMaterial.Diamond -> if (g.tone % 7 == 0) {
                    MintCeremonyInk(MintCeremonyInkFamily.Iris, pick(g.tone + shift, 7))
                } else {
                    MintCeremonyInk(MintCeremonyInkFamily.Diamond, pick(g.tone, 2))
                }
                MintCeremonyDustMaterial.Gold -> MintCeremonyInk(MintCeremonyInkFamily.Gold, pick(g.tone, 3))
                MintCeremonyDustMaterial.Silver -> MintCeremonyInk(MintCeremonyInkFamily.Silver, pick(g.tone, 4))
            }
            painter.rect(ink, if (g.material == MintCeremonyDustMaterial.Diamond) a else a * 0.9, point, g.size)
            if (g.material == MintCeremonyDustMaterial.Diamond && g.tone % 9 == 0) {
                val glint = a * (0.55 + 0.45 * sin(t * 17 + g.tone))
                painter.add(ink, glint, StageRect(point.x - 3.2, point.y - 0.4, 6.4, 0.8))
                painter.add(ink, glint, StageRect(point.x - 0.4, point.y - 3.2, 0.8, 6.4))
            }
            painter.painted += 1
        }
    }

    /** Le rangement d'une image : un lot par encre et par palier d'opacité, créé à la première particule qui le demande. */
    private class Painter {
        private class Slot(val ink: MintCeremonyInk, val level: Int, val additive: Boolean) {
            val rects = ArrayList<StageRect>()
            val circles = ArrayList<StageRect>()
        }

        private val slots = LinkedHashMap<Int, Slot>()
        var painted = 0

        private fun level(opacity: Double): Int = min(OPACITY_LEVELS, max(1, (opacity * OPACITY_LEVELS).roundToInt()))

        private fun slot(ink: MintCeremonyInk, opacity: Double, additive: Boolean): Slot {
            val level = level(opacity)
            val key = (ink.code * (OPACITY_LEVELS + 1) + level) * 2 + if (additive) 1 else 0
            return slots.getOrPut(key) { Slot(ink, level, additive) }
        }

        fun add(ink: MintCeremonyInk, opacity: Double, rect: StageRect) {
            if (opacity < 0.02) return
            slot(ink, opacity, additive = true).rects += rect
        }

        fun rect(ink: MintCeremonyInk, opacity: Double, center: StagePoint, side: Double) =
            add(ink, opacity, StageRect(center.x - side / 2, center.y - side / 2, side, side))

        fun circle(opacity: Double, center: StagePoint, radius: Double) {
            if (opacity < 0.02) return
            slot(MintCeremonyInk.ASH, opacity, additive = false).circles += StageRect(center.x - radius, center.y - radius, radius * 2, radius * 2)
        }

        fun batches(): List<MintCeremonyBatch> = slots.values.map {
            MintCeremonyBatch(it.ink, it.level.toDouble() / OPACITY_LEVELS, it.additive, it.rects.toList(), it.circles.toList())
        }
    }

    public companion object {
        /** Les paliers d'opacité d'un lot : assez fins pour que l'œil ne voie pas de marche, assez peu pour grouper. */
        public const val OPACITY_LEVELS: Int = 10

        public val NONE: MintCeremonyParticles = MintCeremonyParticles(emptyList(), emptyList(), emptyList(), emptyList())

        private fun pick(index: Int, count: Int): Int = ((index % count) + count) % count

        /** Les particules d'une frappe ; les gerbes sont posées RELATIVEMENT à leur coup (une réponse tardive n'oblige pas à les retirer). */
        public fun build(plan: MintCeremonyPlan, seed: Int): MintCeremonyParticles {
            val random = MintCeremonyRandom(seed)
            val weave = makeWeave(plan, random)
            val dust = makeDust(plan, random)
            val bursts = makeBursts(plan, random)
            val puff = (0 until plan.particles.puff).map { m ->
                val side = if (m % 2 == 1) 1.0 else -1.0
                val x = 180 + side * (30 + random.next() * 30)
                val vx = side * (40 + random.next() * 90)
                val vy = -(10 + random.next() * 40)
                Puff(x, 541.0, vx, vy, 0.4 + random.next() * 0.35)
            }
            return MintCeremonyParticles(weave, dust, bursts, puff)
        }

        private fun makeWeave(plan: MintCeremonyPlan, random: MintCeremonyRandom): List<Weave> {
            val emit = plan.seconds(MintCeremonyPhase.Emit)
            val circle = Stage.CIRCLE
            val turn = 2 * PI
            return (0 until plan.particles.weave).map { i ->
                val ox = Stage.ORB.x + (random.next() - 0.5) * 22
                val oy = Stage.ORB.y + (random.next() - 0.5) * 22
                val s = E.lerp(emit.from, emit.to, random.next().pow(0.9))
                val d = 0.55 + random.next() * 0.3
                val theta = random.next() * PI * 2
                val dir = if (i % 2 == 1) 1.0 else -1.0
                val phi0 = atan2(oy - circle.y, ox - circle.x)
                val r0 = hypot(ox - circle.x, oy - circle.y)
                val raw = theta - phi0
                val wrapped = if (dir > 0) ((raw % turn) + turn) % turn else -((((-raw) % turn) + turn) % turn)
                val delta = wrapped + dir * PI * (0.3 + random.next() * 0.5)
                val jitter = (random.next() - 0.5) * 3.2
                val twinkle = random.next() * 6.28
                val big = random.next() < 0.12
                Weave(s, d, phi0, delta, r0, dir, jitter, twinkle, big, ((theta / turn) * 7).toInt() % 7)
            }
        }

        private fun makeDust(plan: MintCeremonyPlan, random: MintCeremonyRandom): List<Grain> {
            if (plan.span(MintCeremonyPhase.Dust) == null) return emptyList()
            val window = plan.seconds(MintCeremonyPhase.Dust)
            return plan.particles.dust.flatMap { group ->
                (0 until group.count).map { j ->
                    val mee = group.from == MintCeremonyHitter.Mee
                    val home = if (mee) Stage.MEE_SOW else Stage.MEO_SOW
                    val ox = home.x + (random.next() - 0.5) * 18
                    val oy = home.y + (random.next() - 0.5) * 26
                    val rho = (Stage.RADIUS - 8) * sqrt(random.next())
                    val psi = random.next() * PI * 2
                    val tx = Stage.CIRCLE.x + rho * cos(psi)
                    val ty = Stage.CIRCLE.y + rho * sin(psi)
                    val s = E.lerp(window.from, window.to, random.next())
                    val d = 0.45 + random.next() * 0.3
                    val cy = min(oy, ty) - 50 - random.next() * 40
                    val size = 0.9 + random.next() * 0.9
                    Grain(
                        s, d, StagePoint(ox, oy), StagePoint(tx, ty), StagePoint((ox + tx) / 2 + if (mee) 10.0 else -10.0, cy),
                        rho, psi, size, group.material, j,
                    )
                }
            }
        }

        private fun makeBursts(plan: MintCeremonyPlan, random: MintCeremonyRandom): List<Spark> {
            val counts = plan.particles.bursts
            return counts.flatMapIndexed { strike, count ->
                val isFinal = strike == counts.size - 1
                val power = if (isFinal) (if (plan.grand) 1.5 else 1.1) else 0.55
                (0 until count).map { b ->
                    val angle = -PI * (0.08 + 0.84 * random.next())
                    val speed = (120 + 260 * random.next()) * power
                    val x = 180 + (random.next() - 0.5) * 20
                    val life = 0.45 + random.next() * 0.6
                    val size = 1.2 + random.next() * 1.6
                    Spark(strike, x, Stage.ANVIL_CENTER.y - Stage.ANVIL / 2 - 4, cos(angle) * speed, sin(angle) * speed, life, size, b)
                }
            }
        }

        /** La position d'un fil du tissage et son entrée en lumière, `null` avant son départ. */
        public fun position(w: Weave, plan: MintCeremonyPlan, tt: Double): Pair<StagePoint, Double>? {
            if (tt < w.s) return null
            val tighten = plan.seconds(MintCeremonyPhase.Tighten)
            val amplitude = 9 * (1 - E.seg(tt, tighten.from, tighten.to))
            val x = (tt - w.s) / w.d
            val phi = if (x < 1) w.phi0 + w.delta * E.sine(x) else w.phi0 + w.delta + w.dir * 1.3 * (tt - w.s - w.d)
            val ring = Stage.RADIUS + w.dir * amplitude * sin(6 * phi) + w.jitter
            val r = if (x < 1) E.lerp(w.r0, ring, E.easeOut(x)) else ring
            return StagePoint(Stage.CIRCLE.x + r * cos(phi), Stage.CIRCLE.y + r * sin(phi)) to E.seg(tt, w.s, w.s + 0.12)
        }

        /** La position d'un grain : en arc depuis l'aile qui le sème, puis il tourbillonne dans le cercle. */
        public fun position(g: Grain, tt: Double): StagePoint {
            val x = (tt - g.s) / g.d
            if (x >= 1) {
                val angle = g.psi + 0.55 * (tt - g.s - g.d)
                return StagePoint(Stage.CIRCLE.x + g.rho * cos(angle), Stage.CIRCLE.y + g.rho * sin(angle))
            }
            val e = E.easeInOut(x)
            val u = 1 - e
            return StagePoint(
                u * u * g.origin.x + 2 * u * e * g.control.x + e * e * g.target.x,
                u * u * g.origin.y + 2 * u * e * g.control.y + e * e * g.target.y,
            )
        }
    }
}
