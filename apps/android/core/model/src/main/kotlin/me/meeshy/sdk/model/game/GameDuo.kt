package me.meeshy.sdk.model.game

import me.meeshy.sdk.model.game.engagement.EngagementAxisKey

/*
 * La mission en duo hebdomadaire (#9385) — à deux, avec un ami accepté. MIROIR de
 * `packages/shared/utils/game/duo.ts` (le TypeScript fait foi) et de `GameDuo.swift` (iOS).
 *
 * Elle s'ouvre au niveau 20 (record), pour les deux. Le tirage est déterministe — graine = la PAIRE
 * triée des deux comptes et la semaine —, donc identique pour les deux, quel que soit celui qui
 * regarde. La part de chacun se mesure sur le niveau le plus BAS des deux ; le plafond de la part
 * empêche l'excédent de l'un de finir la part de l'autre.
 */

public data class DuoTemplate(val key: String, val signal: String, val basePartTarget: Int, val prism: Boolean)

public data class DuoMission(
    val weekKey: String,
    val templateKey: String,
    val signal: String,
    val prism: Boolean,
    /** Ce que CHACUN doit faire. */
    val partTarget: Int,
    /** La barre commune : la somme des deux parts. */
    val commonTarget: Int,
    val basePoints: Int,
)

/** La progression d'un duo lue sur les deux parts (la charge servie, [DuoProgress], ne porte pas la barre commune). */
public data class DuoStanding(
    val mine: Int,
    val partner: Int,
    val common: Int,
    val commonTarget: Int,
    val mineDone: Boolean,
    val partnerDone: Boolean,
    val bothDone: Boolean,
)

public enum class DuoInviteRefusal(public val wire: String) {
    Self("self"),
    Locked("locked"),
    InviteeLocked("invitee-locked"),
    NotFriends("not-friends"),
    AlreadyInDuo("already-in-duo"),
    InviteeInDuo("invitee-in-duo"),
}

public sealed interface DuoInviteDecision {
    public data object Allowed : DuoInviteDecision
    public data class Refused(val reason: DuoInviteRefusal) : DuoInviteDecision
}

public enum class DuoStatus(public val wire: String) {
    Invited("invited"),
    Active("active"),
    Completed("completed"),
    Abandoned("abandoned"),
    Expired("expired"),
    ;

    public companion object {
        public fun fromWire(raw: String?): DuoStatus? = entries.firstOrNull { it.wire == raw }
    }
}

public enum class DuoAction(public val wire: String) {
    Accept("accept"),
    Abandon("abandon"),
    Expire("expire"),
    Complete("complete"),
}

public object GameDuo {

    public const val MIN_LEVEL: Int = 20

    /** Les points de base d'une mission en duo : une semaine, soit l'équivalent de deux difficiles. */
    public const val BASE_POINTS: Int = 300

    /** Quand les deux finissent, chacun touche le double. */
    public const val REWARD_MULTIPLIER: Int = 2

    private fun axis(key: EngagementAxisKey): String = "axis:${key.wire}"

    public val templates: List<DuoTemplate> = listOf(
        DuoTemplate("duo-messages", axis(EngagementAxisKey.TEXT_MESSAGE), 40, false),
        DuoTemplate("duo-voice", axis(EngagementAxisKey.AUDIO_MESSAGE), 5, false),
        DuoTemplate("duo-reactions", axis(EngagementAxisKey.REACTION), 20, false),
        DuoTemplate("duo-replies", "reply-distinct-conversations", 8, false),
        DuoTemplate("duo-stories", axis(EngagementAxisKey.STORY), 3, false),
        DuoTemplate("duo-prism", "foreign-language-message", 8, true),
    )

    /** Ce que la passerelle observe : chaque axe d'engagement, puis les faits posés au geste (ceux du catalogue). */
    private val observed: Set<String> =
        EngagementAxisKey.entries.map(::axis).toSet() +
            GameMissionCatalog.templates.map { it.signal }.filterNot { it.startsWith("axis:") }

    private val catalog: List<DuoTemplate> = templates.filter { it.signal in observed }

    private fun pairSeed(a: String, b: String): String = listOf(a, b).sorted().joinToString("&")

    /** La mission de la semaine du duo, `null` quand aucun gabarit ne convient aux deux. */
    public fun draw(
        userA: String,
        userB: String,
        weekKey: String,
        levelA: Int,
        levelB: Int,
        unavailableSignals: List<String>,
    ): DuoMission? {
        val blocked = unavailableSignals.toSet()
        val pool = catalog.filter { it.signal !in blocked }
        val rng = GameRandom(GameSeedParts(pairSeed(userA, userB), weekKey, "duo"))
        val picked = pool.getOrNull(rng.pickIndex(pool.size)) ?: return null
        val partTarget = GameMissionLaws.objective(picked.basePartTarget, minOf(levelA, levelB))
        return DuoMission(weekKey, picked.key, picked.signal, picked.prism, partTarget, partTarget * 2, BASE_POINTS)
    }

    public fun progress(partTarget: Int, mine: Int, partner: Int): DuoStanding {
        val mineCapped = minOf(maxOf(0, mine), partTarget)
        val partnerCapped = minOf(maxOf(0, partner), partTarget)
        val mineDone = mineCapped >= partTarget
        val partnerDone = partnerCapped >= partTarget
        return DuoStanding(
            mine = mineCapped,
            partner = partnerCapped,
            common = mineCapped + partnerCapped,
            commonTarget = partTarget * 2,
            mineDone = mineDone,
            partnerDone = partnerDone,
            bothDone = mineDone && partnerDone,
        )
    }

    /** Ce que ma part vaut AU TOTAL : rien tant qu'elle n'est pas faite, la mission seule, ou le double si les deux ont fini. */
    public fun reward(level: Int, flameDays: Int, mineDone: Boolean, partnerDone: Boolean): DuoReward {
        if (!mineDone) return DuoReward(points = 0, doubled = false)
        val base = GameMissionLaws.reward(BASE_POINTS, level, flameDays)
        return if (partnerDone) DuoReward(base * REWARD_MULTIPLIER, doubled = true) else DuoReward(base, doubled = false)
    }

    public fun canInvite(
        inviterLevelRecord: Int,
        inviteeLevelRecord: Int,
        areFriends: Boolean,
        inviterHasDuo: Boolean,
        inviteeHasDuo: Boolean,
        isSelf: Boolean,
    ): DuoInviteDecision = when {
        isSelf -> DuoInviteDecision.Refused(DuoInviteRefusal.Self)
        inviterLevelRecord < MIN_LEVEL -> DuoInviteDecision.Refused(DuoInviteRefusal.Locked)
        inviteeLevelRecord < MIN_LEVEL -> DuoInviteDecision.Refused(DuoInviteRefusal.InviteeLocked)
        !areFriends -> DuoInviteDecision.Refused(DuoInviteRefusal.NotFriends)
        inviterHasDuo -> DuoInviteDecision.Refused(DuoInviteRefusal.AlreadyInDuo)
        inviteeHasDuo -> DuoInviteDecision.Refused(DuoInviteRefusal.InviteeInDuo)
        else -> DuoInviteDecision.Allowed
    }

    /** Le statut suivant, `null` quand le geste n'a pas de sens dans l'état actuel. */
    public fun transition(status: DuoStatus, action: DuoAction, actor: DuoActor): DuoStatus? {
        val open = status == DuoStatus.Invited || status == DuoStatus.Active
        return when {
            status == DuoStatus.Invited && action == DuoAction.Accept ->
                if (actor == DuoActor.Invitee) DuoStatus.Active else null
            open && action == DuoAction.Abandon -> DuoStatus.Abandoned
            open && action == DuoAction.Expire -> DuoStatus.Expired
            status == DuoStatus.Active && action == DuoAction.Complete -> DuoStatus.Completed
            else -> null
        }
    }
}
