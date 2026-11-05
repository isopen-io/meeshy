package me.meeshy.sdk.share

import me.meeshy.sdk.model.share.SharePendingShare

/** Le moment où un refus tombe : à la CRÉATION du message, ou à la FIN du traitement. Deux raisons distinctes, jamais fondues. */
public enum class ShareRefusalMoment { CREATION, COMPLETION }

/** Pourquoi la passerelle refuse pour de bon ; aucun identifiant serveur n'existe jamais pour un message refusé. */
public enum class ShareRefusalReason {
    /** 401 à la création : la session n'est plus valable. */
    SESSION_EXPIRED,

    /** 413 à la création : la charge est trop lourde. */
    TOO_LARGE,

    /** 403 à la fin : la passerelle n'autorise pas ce message. */
    FORBIDDEN,

    /** Non conforme à la fin (422, 400) : la passerelle le juge irrecevable. */
    NON_CONFORMING,
}

public sealed interface ShareVerdict {
    /** Réseau, 5xx, 408, 429 : la cible reste dans la fiche, la reprise réessaie avec recul. */
    public data object Transient : ShareVerdict

    public data class Refused(val moment: ShareRefusalMoment, val reason: ShareRefusalReason) : ShareVerdict
}

/** Un refus HTTP survenu pendant le service d'une cible ; [moment] dit si le message était déjà créé. */
public class ShareServeException(public val status: Int?, public val moment: ShareRefusalMoment) : Exception("share serve refused: $status")

/**
 * **Le rythme et le verdict d'un envoi durable** (miroir de `SharePendingSendConsumer`, iOS). Pure.
 *
 * - **L'origine d'abord**, explicitement : elle porte les octets, les copies réclament les siens. Une reprise partielle
 *   recalcule le même ordre.
 * - **Recul exponentiel borné** pour une cible transitoire ; au plafond de reprises le travail s'arrête et la fiche
 *   attend le prochain lancement (ou ses sept jours).
 * - **Deux refus distincts** : 401/413 à la création, 403 ou non conforme à la fin. Un refus de création ne laisse aucun
 *   identifiant serveur.
 */
public object ShareSendPacing {
    public const val BASE_BACKOFF_MILLIS: Long = 30_000L
    public const val MAX_BACKOFF_MILLIS: Long = 15L * 60_000L
    public const val MAX_WORK_RUNS: Int = 12

    /** Les rangs des cibles restant à servir, l'origine en tête. */
    public fun serveOrder(share: SharePendingShare): List<Int> {
        val origin = share.originTargetIndex?.takeIf { it in share.targets.indices } ?: 0
        val rest = share.targets.indices.filter { it != origin }
        return (listOf(origin) + rest).filter { it in share.targets.indices && share.targets[it].state != me.meeshy.sdk.model.share.TargetState.SENT }
    }

    /** Le recul avant la reprise [attempt] (à partir de 0) : doublé à chaque fois, plafonné. */
    public fun backoffMillis(attempt: Int): Long {
        val shift = attempt.coerceIn(0, 20)
        return (BASE_BACKOFF_MILLIS shl shift).coerceAtMost(MAX_BACKOFF_MILLIS)
    }

    public fun shouldGiveUp(runAttemptCount: Int): Boolean = runAttemptCount >= MAX_WORK_RUNS

    public fun verdict(status: Int?, moment: ShareRefusalMoment): ShareVerdict {
        val reason = when (moment) {
            ShareRefusalMoment.CREATION -> when (status) {
                401 -> ShareRefusalReason.SESSION_EXPIRED
                413 -> ShareRefusalReason.TOO_LARGE
                else -> null
            }
            ShareRefusalMoment.COMPLETION -> when (status) {
                403 -> ShareRefusalReason.FORBIDDEN
                400, 422 -> ShareRefusalReason.NON_CONFORMING
                else -> null
            }
        } ?: return ShareVerdict.Transient
        return ShareVerdict.Refused(moment, reason)
    }
}
