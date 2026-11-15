package me.meeshy.sdk.model.game.ceremony

import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin
import me.meeshy.sdk.model.game.ceremony.MintCeremonyEase as E
import me.meeshy.sdk.model.game.ceremony.MintCeremonyStage as Stage

public enum class MintCeremonyPose { Rest, Party, Courage }

/** L'IMAGE D'UN INSTANT de la cérémonie, hors des particules, dans le repère de la scène (miroir de `MintCeremonyFrame`). */
public data class MintCeremonyFrame(
    val backdrop: Double,
    val shake: StagePoint,
    val orb: Double,
    val mee: Actor,
    val meo: Actor,
    val die: Die,
    val hammerMeo: Hammer,
    val hammerMee: Hammer,
    val coin: Coin,
    val glow: Glow,
    val flash: Double,
    /** L'ONDE du coup, qui part de l'enclume. */
    val ring: Ring,
    val tchak: Tchak,
    val rays: Rays,
    val sign: Double,
    val say: Double,
    val shadow: Shadow,
    val glory: Glory,
) {
    public data class Actor(val x: Double, val y: Double, val rotate: Double, val scale: Double, val pose: MintCeremonyPose)
    public data class Hammer(val x: Double, val y: Double, val angle: Double, val opacity: Double)
    public data class Die(val x: Double, val y: Double, val squash: Double, val opacity: Double)

    /** La pièce : centre, échelle (1 = 150 unités), écrasement, rotation (degrés), et la gravure (0 flan, 1 avers frappé). */
    public data class Coin(
        val x: Double,
        val y: Double,
        val scale: Double,
        val squash: Double,
        val rotateY: Double,
        val opacity: Double,
        val engraved: Double,
    )

    public data class Glow(val x: Double, val y: Double, val scale: Double, val opacity: Double)
    public data class Ring(val scale: Double, val opacity: Double)
    public data class Tchak(val opacity: Double, val scale: Double, val isFinal: Boolean)
    public data class Rays(val opacity: Double, val rotate: Double, val scale: Double)
    public data class Shadow(val opacity: Double, val scale: Double)
    public data class Glory(val opacity: Double, val rise: Double)
}

/** L'instant, et ce que la loi en dit, lus une fois par image et partagés par les calques. */
private class MintCeremonyMoment(val plan: MintCeremonyPlan, val t: Double) {
    class Blow(val at: Double, val impact: Double, val mee: Boolean)

    val tt: Double = plan.sceneTime(t)
    val blows: List<Blow> = plan.strikes.map { Blow(it.atMs / 1000.0, it.impactMs / 1000.0, MintCeremonyHitter.Mee in it.hitters) }
    val lastImpact: Double = blows.lastOrNull()?.impact ?: Double.POSITIVE_INFINITY
    val exitFade: Double = run {
        val flight = p(MintCeremonyPhase.Flight)
        val end = plan.endMs / 1000.0
        if (plan.refusal == null) 1 - E.seg(t, flight.from, flight.to) else 1 - E.seg(t, end - 0.45, end)
    }

    fun p(phase: MintCeremonyPhase): MintCeremonySeconds = plan.seconds(phase)

    fun power(index: Int): Double = if (index == blows.size - 1) (if (plan.grand) 1.6 else 1.1) else 0.55
}

/**
 * LA CÉRÉMONIE DE LA FRAPPE, IMAGE PAR IMAGE (#11177, miroir de `MintCeremonyChoreography` iOS et de
 * `apps/web/src/lib/game/choreography-mint-ceremony.ts`, nombre pour nombre). Le temps est en SECONDES depuis le
 * toucher ; rien ici ne touche une vue : la scène Compose applique ces nombres.
 */
public object MintCeremonyChoreography {

    /** L'image de l'instant [t]. Tant que la passerelle n'a pas répondu, l'hôte passe un plan dont les coups sont devant. */
    public fun frame(plan: MintCeremonyPlan, t: Double, target: MintCeremonyTarget = Stage.DEFAULT_TARGET): MintCeremonyFrame {
        if (plan.mode == MintCeremonyMode.Reduced) return reducedFrame(plan, t)
        val m = MintCeremonyMoment(plan, t)
        val (mee, meo) = actorsOf(m)
        val coin = coinOf(m, target)
        val (hammerMeo, hammerMee) = hammersOf(m, mee, meo)
        val impacts = impactsOf(m)
        val emit = m.p(MintCeremonyPhase.Emit)
        val shining = t > emit.from && t < (if (plan.refusal == null) emit.to + 0.4 else plan.endMs / 1000.0)
        val blank = m.p(MintCeremonyPhase.Blank)
        val descent = m.p(MintCeremonyPhase.Descent)
        val flight = m.p(MintCeremonyPhase.Flight)
        val open = m.p(MintCeremonyPhase.Open)
        val ancestors = m.p(MintCeremonyPhase.Ancestors)
        return MintCeremonyFrame(
            backdrop = E.seg(t, open.from, open.to) * m.exitFade,
            shake = shakeOf(m),
            orb = 1 + 0.18 * sin(t * 9) * (if (shining) 1 else 0),
            mee = mee,
            meo = meo,
            die = dieOf(m, mee),
            hammerMeo = hammerMeo,
            hammerMee = hammerMee,
            coin = coin,
            glow = MintCeremonyFrame.Glow(
                x = coin.x,
                y = coin.y,
                scale = 0.6 + 0.5 * coin.scale,
                opacity = 0.35 * E.seg(m.tt, blank.from, blank.to) * (1 - E.seg(m.tt, descent.from, descent.to)) +
                    0.9 * E.seg(t, m.lastImpact, m.lastImpact + 0.3) * (1 - E.seg(t, flight.from, flight.from + 0.3)),
            ),
            flash = impacts.first,
            ring = impacts.second,
            tchak = impacts.third,
            rays = raysOf(m),
            sign = E.seg(t, ancestors.from, ancestors.to) * m.exitFade,
            say = sayOf(m),
            shadow = shadowOf(m),
            glory = gloryOf(m),
        )
    }

    /** Sous « réduire les animations » : la pièce frappée, posée revers montré, dans un fondu ; rien ne bouge. */
    private fun reducedFrame(plan: MintCeremonyPlan, t: Double): MintCeremonyFrame {
        val open = plan.seconds(MintCeremonyPhase.Open)
        val reveal = plan.seconds(MintCeremonyPhase.Reveal)
        val end = plan.endMs / 1000.0
        val appear = E.seg(t, reveal.from, reveal.to)
        val leave = 1 - E.seg(t, end - 0.26, end)
        fun actor(home: StagePoint) =
            MintCeremonyFrame.Actor(home.x, home.y + 18, 0.0, 1.0, if (appear > 0) MintCeremonyPose.Party else MintCeremonyPose.Rest)
        return MintCeremonyFrame(
            backdrop = E.seg(t, open.from, open.to) * leave,
            shake = StagePoint.ZERO,
            orb = 1.0,
            mee = actor(Stage.MEE_END),
            meo = actor(Stage.MEO_END),
            die = MintCeremonyFrame.Die(Stage.DIE_ON.x, Stage.DIE_ON.y, 1.0, 0.0),
            hammerMeo = MintCeremonyFrame.Hammer(0.0, 0.0, Stage.REST, 0.0),
            hammerMee = MintCeremonyFrame.Hammer(0.0, 0.0, Stage.REST_MEE, 0.0),
            coin = MintCeremonyFrame.Coin(Stage.CIRCLE.x, Stage.CIRCLE.y, 1.0, 1.0, 180.0, appear * leave, 1.0),
            glow = MintCeremonyFrame.Glow(Stage.CIRCLE.x, Stage.CIRCLE.y, 1.0, 0.6 * appear),
            flash = 0.0,
            ring = MintCeremonyFrame.Ring(0.0, 0.0),
            tchak = MintCeremonyFrame.Tchak(0.0, 1.0, true),
            rays = MintCeremonyFrame.Rays(0.0, 0.0, 1.0),
            sign = 0.0,
            say = E.seg(t, reveal.to, reveal.to + 0.3),
            shadow = MintCeremonyFrame.Shadow(0.0, 1.0),
            glory = MintCeremonyFrame.Glory(0.0, 0.0),
        )
    }

    /** Le tremblement : chaque coup, plus fort au dernier, et le flan qui se pose. */
    private fun shakeOf(m: MintCeremonyMoment): StagePoint {
        val struck = m.blows.foldIndexed(StagePoint.ZERO) { index, acc, blow ->
            val x = m.t - blow.impact
            if (x < 0 || x >= 0.26) return@foldIndexed acc
            val power = m.power(index)
            StagePoint(acc.x + power * 4.5 * (1 - x / 0.26) * sin(x * 95), acc.y + power * 2 * (1 - x / 0.26) * cos(x * 80))
        }
        val landed = m.tt - m.p(MintCeremonyPhase.Descent).to
        return if (landed >= 0 && landed < 0.18) struck.copy(y = struck.y + 2.2 * (1 - landed / 0.18) * sin(landed * 120)) else struck
    }

    /** Mee et Meo : ils arrivent des côtés, sèment la poussière, prennent place à l'enclume, reculent pour la fête. */
    private fun actorsOf(m: MintCeremonyMoment): Pair<MintCeremonyFrame.Actor, MintCeremonyFrame.Actor> {
        val enter = E.easeOut(E.seg(m.t, 0.05, 0.6))
        val places = m.p(MintCeremonyPhase.Places)
        val move = E.easeInOut(E.seg(m.tt, places.from, places.to))
        val back = E.easeInOut(E.seg(m.t, m.p(MintCeremonyPhase.DieOff).to, m.p(MintCeremonyPhase.Reveal).to))
        fun path(from: Double, home: StagePoint, strike: StagePoint, rest: StagePoint) = StagePoint(
            E.lerp(E.lerp(E.lerp(from, home.x, enter), strike.x, move), rest.x, back),
            E.lerp(E.lerp(home.y, strike.y, move), rest.y, back),
        )
        val mee = path(-110.0, Stage.MEE_HOME, Stage.MEE_STRIKE, Stage.MEE_END)
        val meo = path(380.0, Stage.MEO_HOME, Stage.MEO_STRIKE, Stage.MEO_END)
        val dust = m.p(MintCeremonyPhase.Dust)
        val sowing = if (m.plan.refusal == null && m.t > dust.from - 0.1 && m.t < dust.to + 0.3) sin(m.t * 24) * 7 else 0.0
        val celebrate = m.p(MintCeremonyPhase.Celebrate).from
        val party = m.t >= celebrate
        val courage = m.plan.refusal?.let { m.t >= it.sayMs / 1000.0 } ?: false
        return MintCeremonyFrame.Actor(
            mee.x,
            mee.y + sin(m.t * 4.3) * 3,
            sowing,
            1 + 0.14 * E.bump(m.t, celebrate, 0.38),
            if (courage) MintCeremonyPose.Courage else if (party) MintCeremonyPose.Party else MintCeremonyPose.Rest,
        ) to MintCeremonyFrame.Actor(
            meo.x,
            meo.y + sin(m.t * 4.3 + 1.7) * 3,
            -sowing,
            1 + 0.14 * E.bump(m.t, celebrate + 0.12, 0.38),
            if (party) MintCeremonyPose.Party else MintCeremonyPose.Rest,
        )
    }

    /** Le coin : Mee le tient sous l'aile, le pose sur le flan, il s'écrase un peu à chaque coup, puis Mee le retire. */
    private fun dieOf(m: MintCeremonyMoment, mee: MintCeremonyFrame.Actor): MintCeremonyFrame.Die {
        val wing = StagePoint(mee.x + 72, mee.y + 42)
        val die = m.p(MintCeremonyPhase.Die)
        val dieOff = m.p(MintCeremonyPhase.DieOff)
        val place = E.easeInOut(E.seg(m.tt, die.from, die.to))
        val lift = E.easeInOut(E.seg(m.t, dieOff.from, dieOff.to))
        return MintCeremonyFrame.Die(
            x = E.lerp(E.lerp(wing.x, Stage.DIE_ON.x, place), wing.x, lift),
            y = E.lerp(E.lerp(wing.y, Stage.DIE_ON.y, place), wing.y, lift),
            squash = m.blows.fold(1.0) { acc, blow -> acc - 0.1 * E.bump(m.t, blow.impact, 0.1) },
            opacity = E.seg(m.tt, die.from - 0.2, die.from) * (1 - E.seg(m.t, dieOff.to, dieOff.to + 0.2)),
        )
    }

    /** L'angle d'un marteau qui frappe à [at] : il tombe, rebondit, puis se relève (ou se repose au dernier coup). */
    private fun swing(t: Double, at: Double, last: Boolean, wind: Double, hit: Double, rest: Double): Double =
        if (t < at + 0.15) {
            E.lerp(wind, hit, E.easeIn(E.seg(t, at, at + 0.09)))
        } else {
            E.lerp(hit, if (last) rest else wind, E.easeInOut(E.seg(t, at + 0.15, at + if (last) 0.55 else 0.42)))
        }

    /** Les marteaux : Meo lève le sien, le GARDE levé tant que la passerelle n'a pas répondu, frappe ; au prisme, Mee aussi. */
    private fun hammersOf(
        m: MintCeremonyMoment,
        mee: MintCeremonyFrame.Actor,
        meo: MintCeremonyFrame.Actor,
    ): Pair<MintCeremonyFrame.Hammer, MintCeremonyFrame.Hammer> {
        val windup = m.p(MintCeremonyPhase.Windup)
        val places = m.p(MintCeremonyPhase.Places)
        val firstStrike = m.blows.firstOrNull()?.at ?: Double.POSITIVE_INFINITY
        val waiting = m.plan.refusal == null && m.t > windup.to && m.t < firstStrike && firstStrike - windup.to > 0.06
        val raised = if (waiting) {
            Stage.WIND + sin(m.t * 30) * 2.5
        } else {
            E.lerp(Stage.REST, Stage.WIND, E.easeInOut(E.seg(m.tt, windup.from, windup.to)))
        }
        val angle = m.blows.foldIndexed(raised) { index, current, blow ->
            if (m.t < blow.at) current else swing(m.t, blow.at, index == m.blows.size - 1, Stage.WIND, Stage.HIT, Stage.REST)
        }
        val away = 1 - E.seg(m.t, m.lastImpact + 0.45, m.lastImpact + 0.75)
        val together = m.blows.lastOrNull()?.takeIf { it.mee }
        val angleMee = when {
            together == null -> Stage.REST_MEE
            m.t < together.at -> E.lerp(Stage.REST_MEE, Stage.WIND_MEE, E.easeInOut(E.seg(m.t, together.at - 0.45, together.at - 0.1)))
            else -> swing(m.t, together.at, true, Stage.WIND_MEE, Stage.HIT_MEE, Stage.REST_MEE)
        }
        return MintCeremonyFrame.Hammer(meo.x + 8, meo.y - 46, angle, E.seg(m.tt, places.from, places.to) * away) to
            MintCeremonyFrame.Hammer(
                mee.x + 76,
                mee.y - 46,
                angleMee,
                together?.let { E.seg(m.t, it.at - 0.6, it.at - 0.4) * away } ?: 0.0,
            )
    }

    /** La pièce : le flan se fige, descend sur l'enclume, prend la gravure au coup, montre son revers, file dans l'Héritage. */
    private fun coinOf(m: MintCeremonyMoment, target: MintCeremonyTarget): MintCeremonyFrame.Coin {
        val descent = m.p(MintCeremonyPhase.Descent)
        val reveal = m.p(MintCeremonyPhase.Reveal)
        val flight = m.p(MintCeremonyPhase.Flight)
        val blank = m.p(MintCeremonyPhase.Blank)
        val engrave = m.p(MintCeremonyPhase.Engrave)
        val descend = E.seg(m.tt, descent.from, descent.to)
        val rv = E.seg(m.t, reveal.from, reveal.to)
        val ex = E.seg(m.t, flight.from, flight.to)
        val rising = E.easeOut(rv)
        val flying = E.easeInOut(ex)
        val restY = if (rv > 0) E.lerp(Stage.ANVIL_CENTER.y, Stage.CIRCLE.y, rising) else E.lerp(Stage.CIRCLE.y, Stage.ANVIL_CENTER.y, E.easeIn(descend))
        val restScale = if (rv > 0) {
            E.lerp(Stage.ANVIL / Stage.COIN_BOX, 1.0, rising)
        } else {
            E.lerp(Stage.FORM / Stage.COIN_BOX, Stage.ANVIL / Stage.COIN_BOX, E.easeInOut(descend))
        }
        val flown = ex > 0
        return MintCeremonyFrame.Coin(
            x = if (flown) E.lerp(Stage.CIRCLE.x, target.x, flying) else Stage.CIRCLE.x,
            y = if (flown) E.lerp(Stage.CIRCLE.y, target.y, flying) - 70 * sin(PI * flying) else restY,
            scale = if (flown) E.lerp(1.0, target.scale, flying) else restScale,
            squash = m.blows.fold(1 - 0.05 * E.bump(m.tt, descent.to, 0.12)) { acc, blow -> acc - 0.07 * E.bump(m.t, blow.impact, 0.1) },
            rotateY = if (flown) 540 + 180 * flying else 540 * E.easeInOut(rv),
            opacity = E.seg(m.tt, blank.from, blank.to) * (1 - E.seg(m.t, flight.to - 0.05, flight.to)),
            engraved = E.seg(m.t, engrave.from, engrave.to),
        )
    }

    /** Ce que chaque coup allume : l'éclair, l'onde, le « tchak » (le grand au dernier coup de l'or et du prisme). */
    private fun impactsOf(m: MintCeremonyMoment): Triple<Double, MintCeremonyFrame.Ring, MintCeremonyFrame.Tchak> {
        var flash = 0.0
        var ring = MintCeremonyFrame.Ring(0.3, 0.0)
        var tchak = MintCeremonyFrame.Tchak(0.0, 1.0, false)
        m.blows.forEachIndexed { index, blow ->
            val x = m.t - blow.impact
            val isFinal = index == m.blows.size - 1
            if (x >= 0 && x < 0.32) {
                flash = min(0.95, flash + (if (isFinal) (if (m.plan.grand) 1.0 else 0.85) else 0.45) * (1 - x / 0.32))
            }
            if (x < 0 || x >= 0.7) return@forEachIndexed
            val power = m.power(index)
            ring = MintCeremonyFrame.Ring(0.3 + (2 + 1.6 * power) * E.easeOut(min(1.0, x / 0.55)), max(0.0, 0.95 * (1 - x / 0.55)))
            tchak = MintCeremonyFrame.Tchak(
                opacity = if (x < 0.08) x / 0.08 else max(0.0, 1 - (x - 0.08) / 0.6),
                scale = 0.8 + 0.35 * power * E.easeOut(min(1.0, x / 0.2)),
                isFinal = isFinal && m.plan.grand,
            )
        }
        return Triple(flash, ring, tchak)
    }

    private fun raysOf(m: MintCeremonyMoment): MintCeremonyFrame.Rays {
        if (!m.plan.grand) return MintCeremonyFrame.Rays(0.0, 0.0, 1.0)
        return MintCeremonyFrame.Rays(
            opacity = 0.95 * E.seg(m.t, m.lastImpact, m.lastImpact + 0.5) * m.exitFade,
            rotate = m.t * 16,
            scale = E.lerp(0.5, 1.0, E.seg(m.t, m.lastImpact, m.lastImpact + 0.8)),
        )
    }

    /** La phrase de Mee : à la fête, ou, au refus, ce qui bloque. */
    private fun sayOf(m: MintCeremonyMoment): Double {
        val refusal = m.plan.refusal
        if (refusal == null) {
            val celebrate = m.p(MintCeremonyPhase.Celebrate).from
            val flight = m.p(MintCeremonyPhase.Flight)
            return E.seg(m.t, celebrate, celebrate + 0.3) * (1 - E.seg(m.t, flight.from, flight.to))
        }
        val say = refusal.sayMs / 1000.0
        return E.seg(m.t, say, say + 0.3) * m.exitFade
    }

    /** L'Ombre du refus voile le cercle, puis se retire. */
    private fun shadowOf(m: MintCeremonyMoment): MintCeremonyFrame.Shadow {
        val refusal = m.plan.refusal ?: return MintCeremonyFrame.Shadow(0.0, 1.0)
        val inFrom = refusal.shadowIn.fromMs / 1000.0
        val inTo = refusal.shadowIn.toMs / 1000.0
        return MintCeremonyFrame.Shadow(
            opacity = 0.95 * E.seg(m.t, inFrom, inFrom + 0.3) *
                (1 - E.seg(m.t, refusal.shadowOut.fromMs / 1000.0, refusal.shadowOut.toMs / 1000.0)),
            scale = E.lerp(0.3, 1.25, E.easeOut(E.seg(m.t, inFrom, inTo))),
        )
    }

    private fun gloryOf(m: MintCeremonyMoment): MintCeremonyFrame.Glory {
        val glory = m.p(MintCeremonyPhase.Glory)
        val g = E.seg(m.t, glory.from, glory.to)
        return MintCeremonyFrame.Glory(if (g > 0 && g < 1) sin(PI * g) else 0.0, E.easeInOut(g))
    }
}
