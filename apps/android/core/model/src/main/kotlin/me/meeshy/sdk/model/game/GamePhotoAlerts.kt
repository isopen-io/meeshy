package me.meeshy.sdk.model.game

/*
 * LES ALERTES D'IMMORTALISATION (#10173, § 5.16.1) — miroir de `packages/shared/utils/game/photo-alerts.ts`,
 * `photo-alert-policy.ts` et de `GamePhotoAlerts` (SDK Swift), rejoué sur la loi `photo-alert` de `game.vectors.json`.
 *
 * Une loi décide quelle étape ANNONCER, une seule à la fois : l'étape la plus marquante atteinte (`announce`), l'étape
 * ouverte de sa piste que la proposition retiendrait (`propose`, déléguée à [GamePhotoCatchUpLaw.offer]) et toutes les
 * étapes atteintes à accuser (`reached`). Le rythme du jeu se règle dans [PhotoAlertPolicy.Standard], en un seul endroit.
 * Moteur de règles SANS ÉTAT : ni horloge ni stockage, l'appelant remet l'instant et les journées.
 */

/** La politique des alertes, paramétrable ; ses défauts sont prudents et ne changent rien au carnet. */
public data class PhotoAlertPolicy(
    val photographs: Photographs,
    val invitations: Invitations,
    val backlog: Backlog,
    val inApp: InApp,
    val push: Push,
) {
    /** Ce qui se photographie : chaque étape, ou le rang au PASSAGE seulement (division V et Mythe). */
    public enum class Photographs(val wire: String) { EveryStep("every-step"), RankPassage("rank-passage") }

    /** Le réglage « Me proposer d'immortaliser » : chaque étape, les grands moments, jamais. */
    public enum class Invitations(val wire: String) { EveryStep("every-step"), BigMoments("big-moments"), Never("never") }

    /** D20 : l'arriéré d'avant la ligne de base verrouille les étapes nouvelles (a) ou se range à part (b). */
    public enum class Backlog(val wire: String) { Locks("locks"), Apart("apart") }

    /** `sessionGraceMinutes` : aucune invitation PASSIVE pendant les premières minutes d'une session. */
    public data class InApp(val perDay: Int, val minGapMinutes: Int, val sessionGraceMinutes: Int)

    /** Le push : un par jour, `delayMinutes` après la détection, jamais entre `nightFromHour` et `nightToHour` (heures locales). */
    public data class Push(val perDay: Int, val delayMinutes: Int, val nightFromHour: Int, val nightToHour: Int)

    public companion object {
        /** `PHOTO_ALERT_POLICY`. */
        public val Standard: PhotoAlertPolicy = PhotoAlertPolicy(
            photographs = Photographs.EveryStep,
            invitations = Invitations.EveryStep,
            backlog = Backlog.Locks,
            inApp = InApp(perDay = 1, minGapMinutes = 240, sessionGraceMinutes = 10),
            push = Push(perDay = 1, delayMinutes = 60, nightFromHour = 21, nightToHour = 9),
        )
    }
}

/** Le rythme dans l'app : instants en millisecondes depuis l'époque, journées locales `AAAA-MM-JJ`. */
public data class PhotoAlertPacing(
    val now: Long,
    val dayKey: String,
    val sessionStartedAt: Long?,
    val surface: Surface,
    val shown: List<Shown>,
) {
    /** Née d'un geste (la célébration en cours) ou passive (trouvée à la lecture du jeu). */
    public enum class Surface(val wire: String) { Gesture("gesture"), Passive("passive") }

    public data class Shown(val at: Long, val dayKey: String)
}

/** `allowed` : l'invitation paraît ; `silent` : plafond ou écart atteint, l'étape va au carnet en silence ; `wait` : délai de grâce. */
public enum class PhotoAlertPace(public val wire: String) { Allowed("allowed"), Silent("silent"), Wait("wait") }

public data class PhotoAlert(val announce: String, val propose: String, val reached: List<String>)

/** Une étape du registre partagé (`GamePhotoMoment` côté serveur). */
public data class PhotoMomentRecord(val stepId: String, val presentedAt: String?, val notifiedAt: String?)

public data class PhotoAlertDigest(val stepIds: List<String>, val count: Int)

public object GamePhotoAlerts {

    private const val MINUTE_MS = 60_000L
    private val bigRank = Regex("^rank:[a-z]+:5$")
    private val meeshNumber = Regex("^meesh:(\\d+)$")

    /** Les « grands moments » : passage de rang, Mythe, niveau 100, Prestige, Meesh d'or ou prisme, Flamme 100 et 365. */
    public fun isBigMoment(momentId: String): Boolean {
        if (bigRank.matches(momentId) || momentId == "rank:mythe:0" || momentId == "level-100:0" || momentId.startsWith("prestige:")) return true
        if (momentId == "flame:100" || momentId == "flame:365") return true
        val number = meeshNumber.matchEntire(momentId)?.groupValues?.get(1)?.toLongOrNull() ?: return false
        return number > 0 && number % 100 == 0L
    }

    /** La journée d'une identité `day:<AAAA-MM-JJ>` (vraie date du calendrier), `null` pour toute autre identité. */
    public fun dayOf(momentId: String): String? =
        momentId.takeIf { it.startsWith("day:") }?.substring(4)?.takeIf(GameDay::isDayKey)

    /** L'identité de la réalisation du jour ; une clé qui n'est pas une vraie date n'en a pas. */
    public fun dayMomentId(dayKey: String): String? = if (GameDay.isDayKey(dayKey)) "day:$dayKey" else null

    public fun pacing(pacing: PhotoAlertPacing, policy: PhotoAlertPolicy = PhotoAlertPolicy.Standard): PhotoAlertPace {
        val today = pacing.shown.count { it.dayKey == pacing.dayKey }
        if (today >= policy.inApp.perDay) return PhotoAlertPace.Silent
        val last = pacing.shown.maxOfOrNull { it.at }
        if (last != null && pacing.now - last < policy.inApp.minGapMinutes * MINUTE_MS) return PhotoAlertPace.Silent
        val graceEnds = pacing.sessionStartedAt?.plus(policy.inApp.sessionGraceMinutes * MINUTE_MS)
        val waiting = pacing.surface == PhotoAlertPacing.Surface.Passive && graceEnds != null && pacing.now < graceEnds
        return if (waiting) PhotoAlertPace.Wait else PhotoAlertPace.Allowed
    }

    public fun alert(
        reached: List<String>,
        standing: PhotoCatchUpStanding,
        kept: List<String>,
        presented: List<String>,
        baseline: PhotoCatchUpStanding?,
        policy: PhotoAlertPolicy = PhotoAlertPolicy.Standard,
        treasuryPeak: TreasuryTierKey? = null,
        pacing: PhotoAlertPacing? = null,
    ): PhotoAlert? {
        if (baseline == null) return null
        val current = atPeak(standing, treasuryPeak)
        val steps = GamePhotoCatchUpLaw.stepsReached(current, policy).map { it.id }
        val photographable = steps.toSet()
        val backlog = GamePhotoCatchUpLaw.stepsReached(baseline, policy).map { it.id }.toSet()
        val keptSet = kept.toSet()
        val presentedSet = presented.toSet()
        val latestDay = reached.mapNotNull(::dayOf).maxOrNull()?.let { "day:$it" }

        fun isCandidate(id: String): Boolean = when {
            id == "start" || id in keptSet || id in presentedSet || id in backlog -> false
            GamePhotoCatchUpLaw.track(id) != null -> id in photographable
            else -> dayOf(id) == null || id == latestDay
        }

        val candidates = reached.distinct().filter(::isCandidate)
        val announced = candidates.filter { invited(it, policy) }
        if (announced.isEmpty()) return null
        if (pacing != null && GamePhotoAlerts.pacing(pacing, policy) != PhotoAlertPace.Allowed) return null

        fun rank(id: String): Pair<Int, Int> = GamePhotoCatchUpLaw.priority(id) to -steps.indexOf(id)
        val announce = announced.reduce { best, id -> if (compareRanks(rank(id), rank(best)) < 0) id else best }
        val lockedBy = if (policy.backlog == PhotoAlertPolicy.Backlog.Apart) keptSet + backlog else keptSet
        val propose = GamePhotoCatchUpLaw.offer(listOf(announce), current, lockedBy, policy) ?: announce
        return PhotoAlert(announce, propose, candidates)
    }

    /** Le résumé groupé du push : les étapes ni présentées ni notifiées, sans le départ ni la réalisation du jour. */
    public fun digest(moments: List<PhotoMomentRecord>): PhotoAlertDigest? {
        val stepIds = moments
            .filter { it.presentedAt == null && it.notifiedAt == null && it.stepId != "start" && dayOf(it.stepId) == null }
            .map { it.stepId }
            .distinct()
        return if (stepIds.isEmpty()) null else PhotoAlertDigest(stepIds, stepIds.size)
    }

    /** Le push part-il maintenant ? Jamais dans la fenêtre de nuit (heures locales, `from` > `to` franchit minuit). */
    public fun isPushNight(localHour: Int, policy: PhotoAlertPolicy = PhotoAlertPolicy.Standard): Boolean {
        val from = policy.push.nightFromHour
        val to = policy.push.nightToHour
        return if (from <= to) localHour in from until to else localHour >= from || localHour < to
    }

    private fun compareRanks(a: Pair<Int, Int>, b: Pair<Int, Int>): Int =
        if (a.first != b.first) a.first.compareTo(b.first) else a.second.compareTo(b.second)

    private fun invited(momentId: String, policy: PhotoAlertPolicy): Boolean = when (policy.invitations) {
        PhotoAlertPolicy.Invitations.EveryStep -> true
        PhotoAlertPolicy.Invitations.BigMoments -> isBigMoment(momentId)
        PhotoAlertPolicy.Invitations.Never -> false
    }

    private fun atPeak(standing: PhotoCatchUpStanding, peak: TreasuryTierKey?): PhotoCatchUpStanding {
        val peakIndex = peak?.ordinal ?: -1
        val currentIndex = standing.treasuryTier?.ordinal ?: -1
        return if (peakIndex > currentIndex) standing.copy(treasuryTier = peak) else standing
    }
}
