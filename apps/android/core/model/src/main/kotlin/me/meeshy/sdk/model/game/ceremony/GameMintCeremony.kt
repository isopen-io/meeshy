package me.meeshy.sdk.model.game.ceremony

import me.meeshy.sdk.model.game.MeeshEdition
import kotlin.math.max
import kotlin.math.min

/** Le mode de la cérémonie : le déroulé entier, le fondu de « réduire les animations », ou le refus. */
public enum class MintCeremonyMode { Normal, Reduced, Refused }

/** Une phase, en millisecondes entières depuis le toucher. */
public data class MintCeremonySpan(val fromMs: Int, val toMs: Int)

/** Les phases, dans l'ordre du récit (miroir de `MINT_CEREMONY_PHASES`). */
public enum class MintCeremonyPhase(public val wire: String) {
    Open("open"), Emit("emit"), Braid("braid"), Tighten("tighten"), Dust("dust"), Blank("blank"), Descent("descent"),
    Places("places"), Die("die"), Windup("windup"), Hold("hold"), Strikes("strikes"), Engrave("engrave"), DieOff("dieOff"),
    Reveal("reveal"), Ancestors("ancestors"), Celebrate("celebrate"), Flight("flight"), Glory("glory"),
}

public enum class MintCeremonyHitter(public val wire: String) { Mee("mee"), Meo("meo") }

/** Un coup : le marteau part à [atMs], touche le coin à [impactMs] ; le dernier est [isFinal] (la vibration la plus forte). */
public data class MintCeremonyStrike(val atMs: Int, val impactMs: Int, val hitters: List<MintCeremonyHitter>, val isFinal: Boolean)

public enum class MintCeremonyDustMaterial(public val wire: String) { Silver("silver"), Gold("gold"), Diamond("diamond") }

public data class MintCeremonyDust(val from: MintCeremonyHitter, val material: MintCeremonyDustMaterial, val count: Int)

/** Combien de particules : le tissage, les poussières, une gerbe par coup, le petit nuage de la descente. */
public data class MintCeremonyParticleCounts(val weave: Int, val dust: List<MintCeremonyDust>, val bursts: List<Int>, val puff: Int)

/**
 * Le refus : à [atMs] une Ombre voile le cercle ; pendant [rewind] la scène remonte le temps jusqu'à [rewindToMs] (le
 * départ des étincelles) ; à [sayMs] Mee dit ce qui bloque.
 */
public data class MintCeremonyRefusal(
    val atMs: Int,
    val rewind: MintCeremonySpan,
    val rewindToMs: Int,
    val shadowIn: MintCeremonySpan,
    val shadowOut: MintCeremonySpan,
    val sayMs: Int,
)

public data class MintCeremonyPlan(
    val edition: MeeshEdition,
    val mode: MintCeremonyMode,
    /** L'or et le prisme : trois coups, les rayons et les aïeux. */
    val grand: Boolean,
    val particles: MintCeremonyParticleCounts,
    val phases: Map<MintCeremonyPhase, MintCeremonySpan?>,
    val strikes: List<MintCeremonyStrike>,
    val refusal: MintCeremonyRefusal?,
    val endMs: Int,
) {
    public fun span(phase: MintCeremonyPhase): MintCeremonySpan? = phases[phase]
}

/** Ce que Mee dit d'un refus : l'Ombre, l'Héritage qui attend un rang, la lumière qui manque, le réseau, le reste. */
public enum class MintRefusalReason(public val wire: String) {
    Shadow("shadow"), Locked("locked"), Light("light"), Offline("offline"), Other("other"),
}

/**
 * LA CÉRÉMONIE DE LA FRAPPE (#11177, miroir de `packages/shared/utils/game/mint-ceremony.ts` et de `GameMintCeremony`
 * iOS) — QUAND chaque chose arrive, pour une édition, un mode et l'instant où la passerelle a répondu. Une fonction
 * pure, rejouée sur les vecteurs partagés : le déroulé ne diverge d'aucune plateforme. Elle ne touche à aucune règle du
 * jeu — ni prix, ni numéro, ni gloire : tant que la passerelle n'a pas répondu, Meo garde le marteau levé ; la frappe
 * arrive EN DERNIER, jamais avant la réponse.
 */
public object GameMintCeremony {
    /** L'instant où le marteau peut tomber si la passerelle a déjà répondu. */
    public const val STRIKE_READY_MS: Int = 4800

    /** Au plus autant de particules à l'écran en même temps (tissage et poussières). */
    public const val PARTICLE_BUDGET: Int = 4500

    /** Le code d'une frappe que le réseau n'a pas portée. */
    public const val NETWORK_REFUSAL_CODE: String = "NETWORK"

    /** Une passerelle muette ne garde pas le marteau levé indéfiniment : passé ce délai, la lumière revient. */
    public const val PENDING_LIMIT_MS: Double = 20_000.0

    private val OPEN = MintCeremonySpan(0, 400)
    private val EMIT = MintCeremonySpan(350, 1400)
    private val BRAID = MintCeremonySpan(350, 2200)
    private val TIGHTEN = MintCeremonySpan(2000, 2550)
    private val DUST = MintCeremonySpan(2200, 2900)
    private val BLANK = MintCeremonySpan(3300, 3800)
    private val DESCENT = MintCeremonySpan(3800, 4200)
    private val PLACES = MintCeremonySpan(3950, 4300)
    private val DIE = MintCeremonySpan(4150, 4450)
    private val WINDUP = MintCeremonySpan(4400, 4750)

    private const val IMPACT_AFTER_MS = 90
    private const val ENGRAVE_MS = 180
    private const val WEAVE = 2600
    private const val PUFF = 70
    private const val REFUSAL_EARLIEST_MS = 1500
    private const val REWIND_MAX_MS = 1200
    private const val REDUCED_FADE_MS = 260
    private const val REDUCED_HOLD_MS = 2600

    private val STRIKE_OFFSETS = mapOf(
        MeeshEdition.Silver to listOf(0),
        MeeshEdition.Gold to listOf(0, 580, 1250),
        MeeshEdition.Prism to listOf(0, 580, 1300),
    )

    private val DUST_OF = mapOf(
        MeeshEdition.Silver to listOf(
            MintCeremonyDust(MintCeremonyHitter.Mee, MintCeremonyDustMaterial.Silver, 1500),
            MintCeremonyDust(MintCeremonyHitter.Meo, MintCeremonyDustMaterial.Gold, 170),
        ),
        MeeshEdition.Gold to listOf(MintCeremonyDust(MintCeremonyHitter.Meo, MintCeremonyDustMaterial.Gold, 1500)),
        MeeshEdition.Prism to listOf(
            MintCeremonyDust(MintCeremonyHitter.Meo, MintCeremonyDustMaterial.Gold, 900),
            MintCeremonyDust(MintCeremonyHitter.Mee, MintCeremonyDustMaterial.Diamond, 950),
        ),
    )

    private val REFUSAL_REASONS = mapOf(
        "MINT_BLOCKED_BY_DEBT" to MintRefusalReason.Shadow,
        "TREASURY_LOCKED" to MintRefusalReason.Locked,
        "INSUFFICIENT_POINTS" to MintRefusalReason.Light,
        NETWORK_REFUSAL_CODE to MintRefusalReason.Offline,
    )

    /**
     * Le déroulé de la cérémonie. [edition] est la LOI de la pièce (les coups, les aïeux, la nuit du prisme) ; [look]
     * son DESSIN (la matière des poussières, #11483), celui de la loi à défaut ; [answeredAtMs] l'instant où la
     * passerelle a répondu depuis le toucher (absent : à temps) ; [modest] moitié moins de particules.
     */
    public fun plan(
        edition: MeeshEdition,
        mode: MintCeremonyMode,
        look: MeeshEdition? = null,
        answeredAtMs: Double? = null,
        modest: Boolean = false,
    ): MintCeremonyPlan {
        val answered = sanitize(answeredAtMs)
        val drawn = look ?: edition
        return when (mode) {
            MintCeremonyMode.Normal -> normal(edition, drawn, answered, modest)
            MintCeremonyMode.Refused -> refused(edition, drawn, answered, modest)
            MintCeremonyMode.Reduced -> reduced(edition, answered)
        }
    }

    /** Toucher passe la scène : l'état final s'applique d'un coup, à tout instant. */
    public fun skip(plan: MintCeremonyPlan, atMs: Double): Int = max(plan.endMs, sanitize(atMs))

    public fun refusalReason(code: String?): MintRefusalReason = code?.let { REFUSAL_REASONS[it] } ?: MintRefusalReason.Other

    private fun sanitize(value: Double?): Int =
        if (value == null || !value.isFinite()) 0 else max(0L, Math.round(value)).toInt()

    private fun half(count: Int, modest: Boolean): Int = if (modest) Math.round(count / 2.0).toInt() else count

    private fun isGrand(edition: MeeshEdition): Boolean = edition != MeeshEdition.Silver

    private fun particlesOf(edition: MeeshEdition, look: MeeshEdition, strikes: Int, modest: Boolean): MintCeremonyParticleCounts {
        val finalBurst = if (isGrand(edition)) 420 else 320
        return MintCeremonyParticleCounts(
            weave = half(WEAVE, modest),
            dust = DUST_OF.getValue(look).map { it.copy(count = half(it.count, modest)) },
            bursts = (0 until strikes).map { half(if (it == strikes - 1) finalBurst else 120, modest) },
            puff = half(PUFF, modest),
        )
    }

    private fun strikesOf(edition: MeeshEdition, firstMs: Int): List<MintCeremonyStrike> {
        val offsets = STRIKE_OFFSETS.getValue(edition)
        return offsets.mapIndexed { index, offset ->
            val final = index == offsets.size - 1
            MintCeremonyStrike(
                atMs = firstMs + offset,
                impactMs = firstMs + offset + IMPACT_AFTER_MS,
                hitters = if (final && edition == MeeshEdition.Prism) listOf(MintCeremonyHitter.Mee, MintCeremonyHitter.Meo) else listOf(MintCeremonyHitter.Meo),
                isFinal = final,
            )
        }
    }

    private fun normal(edition: MeeshEdition, look: MeeshEdition, answeredAtMs: Int, modest: Boolean): MintCeremonyPlan {
        val grand = isGrand(edition)
        val firstStrike = max(STRIKE_READY_MS, answeredAtMs)
        val strikes = strikesOf(edition, firstStrike)
        val first = strikes.firstOrNull()?.impactMs ?: firstStrike
        val last = strikes.lastOrNull()?.impactMs ?: firstStrike
        val reveal = MintCeremonySpan(last + 250, last + if (grand) 1500 else 1050)
        val pause = if (grand) 1200 else 650
        val flight = MintCeremonySpan(reveal.toMs + pause, reveal.toMs + pause + 650)
        val glory = MintCeremonySpan(flight.toMs - 200, flight.toMs + 650)
        return MintCeremonyPlan(
            edition = edition,
            mode = MintCeremonyMode.Normal,
            grand = grand,
            particles = particlesOf(edition, look, strikes.size, modest),
            phases = mapOf(
                MintCeremonyPhase.Open to OPEN,
                MintCeremonyPhase.Emit to EMIT,
                MintCeremonyPhase.Braid to BRAID,
                MintCeremonyPhase.Tighten to TIGHTEN,
                MintCeremonyPhase.Dust to DUST,
                MintCeremonyPhase.Blank to BLANK,
                MintCeremonyPhase.Descent to DESCENT,
                MintCeremonyPhase.Places to PLACES,
                MintCeremonyPhase.Die to DIE,
                MintCeremonyPhase.Windup to WINDUP,
                MintCeremonyPhase.Hold to MintCeremonySpan(WINDUP.toMs, firstStrike),
                MintCeremonyPhase.Strikes to MintCeremonySpan(firstStrike, last),
                MintCeremonyPhase.Engrave to MintCeremonySpan(first, first + ENGRAVE_MS),
                MintCeremonyPhase.DieOff to MintCeremonySpan(last + 120, last + 420),
                MintCeremonyPhase.Reveal to reveal,
                MintCeremonyPhase.Ancestors to if (grand) MintCeremonySpan(last + 500, last + 1000) else null,
                MintCeremonyPhase.Celebrate to MintCeremonySpan(reveal.toMs, flight.fromMs),
                MintCeremonyPhase.Flight to flight,
                MintCeremonyPhase.Glory to glory,
            ),
            strikes = strikes,
            refusal = null,
            endMs = glory.toMs + 150,
        )
    }

    private val UNDONE_BY_REFUSAL = setOf(
        MintCeremonyPhase.Strikes, MintCeremonyPhase.Engrave, MintCeremonyPhase.DieOff, MintCeremonyPhase.Reveal,
        MintCeremonyPhase.Ancestors, MintCeremonyPhase.Celebrate, MintCeremonyPhase.Flight, MintCeremonyPhase.Glory,
    )

    private fun refused(edition: MeeshEdition, look: MeeshEdition, answeredAtMs: Int, modest: Boolean): MintCeremonyPlan {
        val atMs = max(REFUSAL_EARLIEST_MS, answeredAtMs)
        val woven = normal(edition, look, max(atMs, STRIKE_READY_MS), modest)
        val sayMs = atMs + 1300
        val phases = MintCeremonyPhase.entries.associateWith { phase ->
            val span = woven.phases[phase]
            when {
                phase in UNDONE_BY_REFUSAL -> null
                span != null && span.fromMs < atMs -> span
                else -> null
            }
        }
        return MintCeremonyPlan(
            edition = edition,
            mode = MintCeremonyMode.Refused,
            grand = woven.grand,
            particles = woven.particles.copy(bursts = emptyList()),
            phases = phases,
            strikes = emptyList(),
            refusal = MintCeremonyRefusal(
                atMs = atMs,
                rewind = MintCeremonySpan(atMs, atMs + min(REWIND_MAX_MS, atMs - EMIT.fromMs)),
                rewindToMs = EMIT.fromMs,
                shadowIn = MintCeremonySpan(atMs, atMs + 700),
                shadowOut = MintCeremonySpan(atMs + 1650, atMs + 2250),
                sayMs = sayMs,
            ),
            endMs = sayMs + 2500,
        )
    }

    private fun reduced(edition: MeeshEdition, answeredAtMs: Int): MintCeremonyPlan {
        val reveal = MintCeremonySpan(answeredAtMs, answeredAtMs + REDUCED_FADE_MS)
        val endMs = reveal.fromMs + REDUCED_HOLD_MS
        val phases = MintCeremonyPhase.entries.associateWith<MintCeremonyPhase, MintCeremonySpan?> { null } + mapOf(
            MintCeremonyPhase.Open to MintCeremonySpan(0, REDUCED_FADE_MS),
            MintCeremonyPhase.Reveal to reveal,
            MintCeremonyPhase.Celebrate to MintCeremonySpan(reveal.toMs, endMs),
        )
        return MintCeremonyPlan(
            edition = edition,
            mode = MintCeremonyMode.Reduced,
            grand = isGrand(edition),
            particles = MintCeremonyParticleCounts(weave = 0, dust = emptyList(), bursts = emptyList(), puff = 0),
            phases = phases,
            strikes = listOf(
                MintCeremonyStrike(
                    atMs = reveal.fromMs,
                    impactMs = reveal.fromMs,
                    hitters = if (edition == MeeshEdition.Prism) listOf(MintCeremonyHitter.Mee, MintCeremonyHitter.Meo) else listOf(MintCeremonyHitter.Meo),
                    isFinal = true,
                ),
            ),
            refusal = null,
            endMs = endMs,
        )
    }
}
