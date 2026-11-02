package me.meeshy.sdk.model.game.ceremony

import kotlin.math.max
import me.meeshy.sdk.model.game.GameErrorCode
import me.meeshy.sdk.model.game.GameMint
import me.meeshy.sdk.model.game.GameMintPreview
import me.meeshy.sdk.model.game.MeeshEdition
import me.meeshy.sdk.model.game.MeeshMintResponse
import me.meeshy.sdk.model.game.engagement.MeeshMintOutcome
import me.meeshy.sdk.model.game.engagement.outcome
import me.meeshy.sdk.model.game.progression.ProgressionHeritagePiece

/** Ce que la passerelle a réglé : une pièce (frappée, ou déjà frappée par la même intention), ou un refus et son code. */
public sealed interface MintSettlementOutcome {
    public data class Minted(val number: Int?) : MintSettlementOutcome
    public data class Refused(val code: String?) : MintSettlementOutcome
}

/**
 * La DERNIÈRE frappe réglée par la passerelle (miroir de `GameMintSettlement` iOS) ; [key] croît à chaque réglement et
 * distingue la frappe de celle d'avant. Rien ne s'y règle sans réponse : c'est elle seule qui libère le marteau.
 */
public data class GameMintSettlement(val outcome: MintSettlementOutcome, val key: Int) {
    public companion object {
        /**
         * La réponse d'une frappe acceptée : « insufficient » est un refus (la lumière ne suffit pas), « minted » et
         * « already-minted » une pièce. Un statut inconnu ne se célèbre pas : la cérémonie ne précède jamais une pièce
         * que la passerelle n'a pas dite.
         */
        public fun outcomeOf(result: MeeshMintResponse, preview: GameMintPreview?): MintSettlementOutcome = when (result.outcome) {
            MeeshMintOutcome.MINTED, MeeshMintOutcome.ALREADY_MINTED -> MintSettlementOutcome.Minted(result.number ?: preview?.number)
            MeeshMintOutcome.INSUFFICIENT -> MintSettlementOutcome.Refused(GameErrorCode.InsufficientPoints.wire)
            MeeshMintOutcome.UNKNOWN -> MintSettlementOutcome.Refused(null)
        }

        /** Un refus : celui de la passerelle, ou `NETWORK` quand le réseau ne l'a pas portée. */
        public fun refusal(offline: Boolean, code: String?): MintSettlementOutcome.Refused =
            MintSettlementOutcome.Refused(if (offline) GameMintCeremony.NETWORK_REFUSAL_CODE else code)

        /** Le réglement qui suit [previous]. */
        public fun next(previous: GameMintSettlement?, outcome: MintSettlementOutcome): GameMintSettlement =
            GameMintSettlement(outcome, (previous?.key ?: 0) + 1)
    }
}

/** La réponse de la passerelle, telle que la scène la reçoit. */
public sealed interface MintCeremonyAnswer {
    public data object Pending : MintCeremonyAnswer
    public data class Confirmed(val number: Int) : MintCeremonyAnswer
    public data class Refused(val code: String?) : MintCeremonyAnswer
}

/**
 * UNE cérémonie demandée par un toucher : la pièce que l'écran annonçait, et la dernière frappe réglée au moment du
 * toucher — la réponse qui compte est la PREMIÈRE réglée après lui. [edition] est la LOI (la chorégraphie), [look] le
 * DESSIN (#11483, la plus haute édition atteinte).
 */
public data class MintCeremonyRequest(val number: Int, val edition: MeeshEdition, val settledKey: Int) {
    public constructor(number: Int, edition: MeeshEdition, settled: GameMintSettlement?) : this(number, edition, settled?.key ?: 0)

    val look: MeeshEdition get() = GameMint.displayEdition(number)

    public fun answer(settled: GameMintSettlement?): MintCeremonyAnswer {
        if (settled == null || settled.key <= settledKey) return MintCeremonyAnswer.Pending
        return when (val outcome = settled.outcome) {
            is MintSettlementOutcome.Minted -> MintCeremonyAnswer.Confirmed(outcome.number ?: number)
            is MintSettlementOutcome.Refused -> MintCeremonyAnswer.Refused(outcome.code)
        }
    }
}

/** Une vibration à venir : dans combien de secondes, et si c'est le dernier coup (le plus fort). */
public data class MintCeremonyBlow(val delaySeconds: Double, val isFinal: Boolean)

/**
 * LA CONDUITE D'UNE CÉRÉMONIE (miroir de `MintCeremonyRun` iOS), en VALEURS : chaque réponse ou toucher rend une
 * conduite nouvelle. La scène lit [plan] à chaque image ; l'hôte planifie les vibrations depuis [blows].
 *
 *  - tant que la passerelle n'a pas répondu, les coups restent devant : Meo garde le marteau levé, rien ne vibre ;
 *  - une pièce confirmée fixe le déroulé ; chaque coup vibre à son impact, plus fort au dernier ;
 *  - un refus ramène la lumière (sous « réduire les animations », il ferme la scène : l'écran dit le refus) ;
 *  - toucher passe la scène, une fois ; passée, elle n'écoute plus.
 */
public data class MintCeremonyRun(
    val edition: MeeshEdition,
    val look: MeeshEdition,
    val number: Int,
    val reduced: Boolean,
    val modest: Boolean,
    val mode: MintCeremonyMode,
    val answeredAtMs: Double?,
    val refusal: MintRefusalReason?,
    val isFinished: Boolean,
    val particles: MintCeremonyParticles,
) {
    /** Le déroulé de l'instant [nowMs] (depuis le toucher). */
    public fun plan(nowMs: Double): MintCeremonyPlan = livePlan(edition, look, mode, answeredAtMs, nowMs, modest)

    /** Les vibrations à planifier à [nowMs] : AUCUNE tant que la passerelle n'a pas confirmé une pièce. */
    public fun blows(nowMs: Double): List<MintCeremonyBlow> =
        if (answeredAtMs == null || mode == MintCeremonyMode.Refused || isFinished) emptyList() else blows(plan(nowMs), nowMs)

    /** L'instant de la fin, depuis le toucher, quand la passerelle a répondu ; `null` tant qu'elle se tait. */
    public fun endMs(nowMs: Double): Int? = if (answeredAtMs == null) null else plan(nowMs).endMs

    public fun receive(answer: MintCeremonyAnswer, atMs: Double): MintCeremonyRun = when {
        isFinished -> this
        answer is MintCeremonyAnswer.Confirmed -> if (answeredAtMs != null) this else copy(number = answer.number, answeredAtMs = atMs)
        answer is MintCeremonyAnswer.Refused -> when {
            mode == MintCeremonyMode.Refused -> this
            mode == MintCeremonyMode.Reduced -> copy(refusal = GameMintCeremony.refusalReason(answer.code), isFinished = true)
            else -> copy(mode = MintCeremonyMode.Refused, refusal = GameMintCeremony.refusalReason(answer.code), answeredAtMs = atMs)
        }
        else -> this
    }

    /** Une passerelle muette au-delà de [GameMintCeremony.PENDING_LIMIT_MS] : la lumière revient. */
    public fun timedOut(nowMs: Double): MintCeremonyRun =
        if (answeredAtMs == null && mode != MintCeremonyMode.Refused && nowMs >= GameMintCeremony.PENDING_LIMIT_MS) {
            receive(MintCeremonyAnswer.Refused(null), nowMs)
        } else {
            this
        }

    /** Toucher passe la scène, ou la fin arrive : l'état final s'applique d'un coup. */
    public fun finished(): MintCeremonyRun = if (isFinished) this else copy(isFinished = true)

    public companion object {
        /**
         * Les particules d'une frappe, tirées depuis son numéro : à PRÉPARER à l'ouverture du cadre de frappe, hors du fil
         * principal, pour que le toucher n'ait plus rien à calculer.
         */
        public fun prepare(number: Int, edition: MeeshEdition, modest: Boolean): MintCeremonyParticles =
            MintCeremonyParticles.build(
                GameMintCeremony.plan(edition, MintCeremonyMode.Normal, look = GameMint.displayEdition(number), modest = modest),
                seed = number,
            )

        /** La conduite d'un toucher ; [prepared] sert s'il a été tiré pour la même pièce, sinon les particules se tirent ici. */
        public fun start(
            request: MintCeremonyRequest,
            reduced: Boolean,
            modest: Boolean,
            prepared: PreparedMintCeremony? = null,
        ): MintCeremonyRun {
            val particles = when {
                reduced -> MintCeremonyParticles.NONE
                prepared != null && prepared.matches(request, modest) -> prepared.particles
                else -> prepare(request.number, request.edition, modest)
            }
            return MintCeremonyRun(
                edition = request.edition,
                look = request.look,
                number = request.number,
                reduced = reduced,
                modest = modest,
                mode = if (reduced) MintCeremonyMode.Reduced else MintCeremonyMode.Normal,
                answeredAtMs = null,
                refusal = null,
                isFinished = false,
                particles = particles,
            )
        }

        /** Le déroulé de l'instant : tant que la passerelle n'a pas répondu, les coups restent devant. */
        public fun livePlan(
            edition: MeeshEdition,
            look: MeeshEdition? = null,
            mode: MintCeremonyMode,
            answeredAtMs: Double?,
            nowMs: Double,
            modest: Boolean,
        ): MintCeremonyPlan {
            val pending = max(nowMs + 1000, if (mode == MintCeremonyMode.Reduced) 0.0 else GameMintCeremony.STRIKE_READY_MS + 1000.0)
            return GameMintCeremony.plan(edition, mode, look = look, answeredAtMs = answeredAtMs ?: pending, modest = modest)
        }

        /** Les vibrations à venir : chaque coup à son impact ; un coup passé de plus d'un quart de seconde ne vibre plus. */
        public fun blows(plan: MintCeremonyPlan, afterMs: Double): List<MintCeremonyBlow> = plan.strikes.mapNotNull { strike ->
            val delay = (strike.impactMs - afterMs) / 1000
            if (delay < -0.25) null else MintCeremonyBlow(max(0.0, delay), strike.isFinal)
        }
    }
}

/** Les particules préparées pour UNE pièce : elles ne servent qu'au toucher qui frappe cette pièce-là. */
public data class PreparedMintCeremony(val number: Int, val edition: MeeshEdition, val modest: Boolean, val particles: MintCeremonyParticles) {
    public fun matches(request: MintCeremonyRequest, modest: Boolean): Boolean =
        request.number == number && request.edition == edition && this.modest == modest

    public companion object {
        public fun of(number: Int, edition: MeeshEdition, modest: Boolean): PreparedMintCeremony =
            PreparedMintCeremony(number, edition, modest, MintCeremonyRun.prepare(number, edition, modest))
    }
}

/**
 * LA TÊTE DE L'HÉRITAGE RETENUE pendant la cérémonie (miroir de `GameHeritageHold` iOS, #11482) : elle garde ce
 * qu'elle montrait au toucher tant que la cérémonie n'est pas finie OU que la passerelle n'a pas réglé la frappe.
 */
public data class GameHeritageHold(val before: ProgressionHeritagePiece, val settledKey: Int, val ceremonyEnded: Boolean) {

    /** La même retenue, cérémonie finie (au bout, ou passée d'un toucher). */
    public fun ended(): GameHeritageHold = copy(ceremonyEnded = true)

    /** Libérée : la cérémonie est finie ET la passerelle a répondu depuis le toucher. */
    public fun isReleasedBy(settled: GameMintSettlement?): Boolean = ceremonyEnded && (settled?.key ?: 0) > settledKey

    public companion object {
        public fun of(before: ProgressionHeritagePiece, settled: GameMintSettlement?): GameHeritageHold =
            GameHeritageHold(before, settled?.key ?: 0, ceremonyEnded = false)

        /** Ce que la tête montre : ce qu'elle montrait au toucher tant qu'elle est retenue, sinon ce que l'état sert. */
        public fun shown(served: ProgressionHeritagePiece, hold: GameHeritageHold?, settled: GameMintSettlement?): ProgressionHeritagePiece =
            if (hold == null || hold.isReleasedBy(settled)) served else hold.before
    }
}
