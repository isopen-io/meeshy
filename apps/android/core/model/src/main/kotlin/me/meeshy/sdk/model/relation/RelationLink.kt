package me.meeshy.sdk.model.relation

import kotlinx.serialization.Serializable
import me.meeshy.sdk.model.FriendRequest

/**
 * La progression d'un lien vers le cran suivant — `RelationLinkView.progress` (`packages/shared/types/relation.ts`, #13933),
 * miroir de `RelationProgress` (`RelationLink.swift`, #13938).
 *
 * [needed] est `null` quand aucune série n'est exigée (Connaissance → Ami, ou le sommet). [missing] ne nomme que les natures
 * d'interaction qui manquent encore (`message`, `reaction`, `postView`, `audio`).
 */
public data class RelationProgress(
    val activeWeeks: Int = 0,
    val needed: Int? = null,
    val missing: List<String> = emptyList(),
)

/** Ce que le client PROPOSE depuis un lien : le cran suivant est ouvert, verrouillé, ou il n'y en a plus. */
public sealed interface RelationRaiseOffer {
    public data class Available(val target: RelationLevel) : RelationRaiseOffer
    public data class Locked(val target: RelationLevel) : RelationRaiseOffer
    public data object None : RelationRaiseOffer
}

/**
 * Un lien tel que `GET /relations` le sert (`RelationLinkView`, #13933). [userId] est l'AUTRE personne ; jamais un nom, une
 * présence ni un cool-down (RG-07) — l'écran nomme la personne par ses propres caches.
 *
 * Lu depuis [RelationLinkWire], fermé par défaut : un niveau inconnu se lit [RelationLevel.PUBLIC] (jamais plus haut), une
 * éligibilité illisible ou `PUBLIC` se lit `null`.
 */
public data class RelationLink(
    val userId: String,
    val effectiveLevel: RelationLevel,
    val grantedByMe: RelationLevel,
    val since: String? = null,
    val progress: RelationProgress = RelationProgress(),
    val eligibleFor: RelationLevel? = null,
) {
    /** Le cran suivant, ouvert ou verrouillé selon la loi de demande. Le cool-down n'est pas servi : le serveur le dit à la demande. */
    public fun raiseOffer(): RelationRaiseOffer {
        val target = RelationRequestRule.rungAfter(effectiveLevel) ?: return RelationRaiseOffer.None
        val verdict = RelationRequestRule.evaluate(
            target = target,
            current = effectiveLevel,
            eligibleFor = eligibleFor,
            cooldownUntilMillis = null,
            nowMillis = 0L,
        )
        return if (verdict == RelationRequestVerdict.Allowed) RelationRaiseOffer.Available(target) else RelationRaiseOffer.Locked(target)
    }

    /** La forme du fil, pour le cache disque : relue par [RelationLinkWire.toLink], elle rend le même lien. */
    public fun toWire(): RelationLinkWire = RelationLinkWire(
        userId = userId,
        effectiveLevel = effectiveLevel.wire,
        grantedByMe = grantedByMe.wire,
        since = since,
        progress = RelationProgressWire(progress.activeWeeks, progress.needed, progress.missing),
        eligibleFor = eligibleFor?.wire,
    )
}

/** Le bloc `progress` tel qu'il voyage : chaque champ est facultatif, un bloc incomplet ne fait pas tomber le lien. */
@Serializable
public data class RelationProgressWire(
    val activeWeeks: Int? = null,
    val needed: Int? = null,
    val missing: List<String>? = null,
)

/** Un lien tel qu'il voyage : des chaînes brutes, pour qu'un niveau ajouté côté serveur ne casse aucun décodage. */
@Serializable
public data class RelationLinkWire(
    val userId: String,
    val effectiveLevel: String? = null,
    val grantedByMe: String? = null,
    val since: String? = null,
    val progress: RelationProgressWire? = null,
    val eligibleFor: String? = null,
) {
    public fun toLink(): RelationLink = RelationLink(
        userId = userId,
        effectiveLevel = RelationLevel.of(effectiveLevel),
        grantedByMe = RelationLevel.of(grantedByMe),
        since = since,
        progress = RelationProgress(
            activeWeeks = progress?.activeWeeks ?: 0,
            needed = progress?.needed,
            missing = progress?.missing.orEmpty(),
        ),
        eligibleFor = RelationLevel.of(eligibleFor).takeUnless { it == RelationLevel.PUBLIC },
    )
}

/**
 * Le cran que vise une demande (#13933) : `targetLevel` absent = Ami (le sens historique) ; une valeur illisible rend
 * `null` — une demande qu'on ne sait pas lire reste une demande simple, jamais un cran inventé.
 */
public val FriendRequest.requestedLevel: RelationLevel?
    get() {
        val served = targetLevel ?: return RelationLevel.FRIEND
        return RelationLevel.of(served).takeUnless { it == RelationLevel.PUBLIC }
    }
