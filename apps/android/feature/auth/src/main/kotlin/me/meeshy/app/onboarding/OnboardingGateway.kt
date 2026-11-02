package me.meeshy.app.onboarding

import java.util.Locale
import me.meeshy.sdk.model.BirthDateDeclarationError
import me.meeshy.sdk.model.media.MediaPermissionState
import me.meeshy.sdk.model.onboarding.ApiOnboardingState
import me.meeshy.sdk.model.onboarding.OnboardingStepId
import me.meeshy.sdk.model.onboarding.OnboardingStepOutcome
import me.meeshy.sdk.model.onboarding.OnboardingSuggestion

/** La progression relue pour le récapitulatif et le crédit des gains (iOS `APIEngagementProgress`, réduite à l'utile). */
data class OnboardingProgress(val score: Int, val streakDays: Int, val badges: Int, val elanFactor: Int)

/** Ce qu'une déclaration de date de naissance rend à la carte. */
sealed interface OnboardingBirthDateResult {
    /** Écrite ; [closesGlobal] : un 13-17 ans lit Global sans y écrire. */
    data class Declared(val closesGlobal: Boolean) : OnboardingBirthDateResult
    data class Refused(val reason: BirthDateDeclarationError) : OnboardingBirthDateResult
}

/**
 * Tout ce que le parcours demande au monde extérieur (réseau, carnet, session). Un PORT : le modèle de vue ne connaît ni
 * Retrofit ni `ContentResolver`, et les témoins le jouent avec un faux. Chaque échec est un RÉSULTAT, jamais une exception.
 */
interface OnboardingGateway {
    suspend fun fetchState(): ApiOnboardingState?
    suspend fun record(step: OnboardingStepId, outcome: OnboardingStepOutcome)
    suspend fun finish()
    suspend fun updateLanguages(primary: String, secondary: String?): Boolean
    suspend fun resendVerification(email: String): Boolean
    suspend fun declareBirthDate(pickerUtcMillis: Long): OnboardingBirthDateResult
    suspend fun sendGreeting(conversationId: String, text: String, declaredLanguage: String?): Boolean
    suspend fun sendFriendRequest(userId: String): Boolean

    /** Les amis du carnet déjà sur Meeshy ; `null` quand la synchronisation a échoué. */
    suspend fun findFriendsInContacts(selfId: String?): List<OnboardingSuggestion>?
    suspend fun fetchProgress(): OnboardingProgress?
    suspend fun contactsPermission(): MediaPermissionState

    /** La fenêtre système des notifications n'a jamais servi (et ce niveau d'API en a une). */
    suspend fun notificationsUndetermined(): Boolean
    /**
     * Les publications de story que l'appareil envoie ENCORE (le serveur ne les a pas confirmées) ; `null` quand on ne sait
     * pas les observer.
     */
    suspend fun sendingStoryPublications(): Set<String>? = null

    fun isSettled(userId: String): Boolean
    fun markSettled(userId: String)
}

/** Les textes que le parcours COMPOSE (le salut) : il a besoin des ressources, donc d'un port. */
interface OnboardingTexts {
    val locale: Locale
    fun greetingTemplate(index: Int): String
    fun languageName(code: String): String
    fun join(names: List<String>): String
}
