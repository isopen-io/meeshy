package me.meeshy.sdk.model.auth

/**
 * La fermeture de session côté passerelle, au mieux, avec réessais bornés — miroir d'`AuthServerLogout` (iOS).
 *
 * La déconnexion locale est déjà faite quand cette loi parle : elle ne décide que de ce qu'on tente ensuite.
 * Trois essais espacés de 0 s, 1 s, 5 s ; un 401 dit que CE jeton ne vaut plus rien (session déjà close) et arrête
 * tout ; trois échecs d'affilée passent la main à la reprise WorkManager, elle-même plafonnée.
 */
public object ServerLogoutPolicy {

    /** Attente avant l'essai n (0 = premier essai), en millisecondes. */
    public val ATTEMPT_DELAYS_MILLIS: List<Long> = listOf(0L, 1_000L, 5_000L)

    public val MAX_ATTEMPTS: Int = ATTEMPT_DELAYS_MILLIS.size

    /** Plafond des exécutions de la reprise WorkManager avant abandon. */
    public const val MAX_WORK_RUNS: Int = 6

    public enum class AttemptOutcome {
        /** La passerelle a accusé réception. */
        CLOSED,

        /** 401 : le jeton est refusé, donc sa session est déjà close ou invalide. */
        TOKEN_REFUSED,

        /** Hors ligne, 5xx, erreur inattendue : rien n'est prouvé. */
        FAILED,
    }

    public enum class Verdict { CLOSED, ALREADY_CLOSED, MAY_LINGER }

    public sealed interface Step {
        /** Réessayer après [delayMillis]. */
        public data class Retry(val delayMillis: Long) : Step

        public data class Finished(val verdict: Verdict) : Step

        /** Les essais immédiats sont épuisés : la reprise WorkManager prend le relais. */
        public data object HandOver : Step
    }

    public fun outcomeOf(httpStatus: Int?): AttemptOutcome =
        if (httpStatus == UNAUTHORIZED) AttemptOutcome.TOKEN_REFUSED else AttemptOutcome.FAILED

    /** Ce qui suit un essai, [attemptsMade] comptant celui qui vient de rendre [outcome]. */
    public fun after(attemptsMade: Int, outcome: AttemptOutcome): Step = when (outcome) {
        AttemptOutcome.CLOSED -> Step.Finished(Verdict.CLOSED)
        AttemptOutcome.TOKEN_REFUSED -> Step.Finished(Verdict.ALREADY_CLOSED)
        AttemptOutcome.FAILED ->
            if (attemptsMade < MAX_ATTEMPTS) Step.Retry(ATTEMPT_DELAYS_MILLIS[attemptsMade]) else Step.HandOver
    }

    public enum class WorkStep { DONE, RETRY, ABANDON }

    /** Ce que fait la reprise WorkManager après sa [runAttemptCount]-ième exécution (0 = première). */
    public fun afterWorkRun(runAttemptCount: Int, outcome: AttemptOutcome): WorkStep = when (outcome) {
        AttemptOutcome.CLOSED, AttemptOutcome.TOKEN_REFUSED -> WorkStep.DONE
        AttemptOutcome.FAILED -> if (runAttemptCount + 1 >= MAX_WORK_RUNS) WorkStep.ABANDON else WorkStep.RETRY
    }

    private const val UNAUTHORIZED = 401
}
