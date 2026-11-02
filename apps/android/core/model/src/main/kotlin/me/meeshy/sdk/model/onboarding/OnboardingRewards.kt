package me.meeshy.sdk.model.onboarding

import java.time.LocalDate

import me.meeshy.sdk.model.game.engagement.EngagementAxisFamily
import me.meeshy.sdk.model.game.engagement.EngagementCatalog

/**
 * Les gains annoncés par les cartes (iOS `OnboardingRewards`). Ils ne sont pas recopiés : ils se DÉRIVENT du barème
 * par famille du catalogue d'engagement — un réglage du barème change donc aussi ce que l'onboarding annonce.
 */
object OnboardingRewards {
    private fun weight(family: EngagementAxisFamily): Int = EngagementCatalog.familyWeights[family] ?: 0

    /** Premier message (contenu) + premier message dans cette conversation. */
    val greeting: Int get() = weight(EngagementAxisFamily.CONTENT) + weight(EngagementAxisFamily.CONVERSATION)

    /** Première story (contenu) + publication directe (outil). */
    val story: Int get() = weight(EngagementAxisFamily.CONTENT) + weight(EngagementAxisFamily.TOOL)

    /** Une amitié acceptée — créditée aux DEUX, à l'acceptation seulement. */
    val friendship: Int get() = weight(EngagementAxisFamily.SOCIAL)

    /** Le seuil du premier niveau. */
    val firstLevel: Int get() = EngagementCatalog.levelThresholds.firstOrNull() ?: 10

    fun level(score: Int): Int = EngagementCatalog.levelThresholds.count { it <= score }
}

/** Ce que le récapitulatif affiche ; `null` quand la progression serveur n'a pas pu être relue (jamais inventé). */
data class OnboardingRecap(val points: Int, val level: Int, val streakDays: Int?, val badges: Int?)

/** Un « +N » à faire s'envoler vers la pastille : l'identité change à chaque gain. */
data class OnboardingGain(val id: Int, val points: Int)

/** Où en est l'envoi du salut dans Meeshy Global. */
enum class OnboardingSendState { IDLE, SENDING, SENT, FAILED }

/** Où en est la déclaration de la date de naissance (iOS `OnboardingAgeState`). */
enum class OnboardingAgeState {
    IDLE,
    SENDING,

    /** 400 : la passerelle refuse la date. */
    INVALID,

    /** Réseau ou serveur : rien n'est écrit, on peut réessayer ou passer. */
    FAILED,

    /** 422 : moins de 13 ans. Meeshy n'est pas ouvert, la session se ferme. */
    REFUSED,
}

/** Les bornes du sélecteur de date (iOS `OnboardingAgeRules`) : la passerelle, elle, refuse sous 13 ans. */
object OnboardingAgeRules {
    const val OLDEST_AGE: Int = 120

    /**
     * Le point de départ : jamais un âge MAJEUR. Un sélecteur à peine effleuré ne doit pas ouvrir Global en
     * écriture à un mineur — il part de l'âge minimum, l'erreur possible est du côté qui protège.
     */
    const val INITIAL_AGE: Int = 13

    /** La date est-elle sélectionnable : ni future, ni vieille de plus de 120 ans. */
    fun isSelectable(date: LocalDate, today: LocalDate): Boolean =
        !date.isAfter(today) && !date.isBefore(today.minusYears(OLDEST_AGE.toLong()))

    /** La date affichée avant tout choix de l'utilisateur : jamais envoyée telle quelle. */
    fun initialDate(today: LocalDate): LocalDate = today.minusYears(INITIAL_AGE.toLong())
}
