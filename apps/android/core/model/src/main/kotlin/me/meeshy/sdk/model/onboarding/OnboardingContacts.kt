package me.meeshy.sdk.model.onboarding

import me.meeshy.sdk.model.contacts.DirectoryContact
import me.meeshy.sdk.model.media.MediaPermissionState

/**
 * Où en est la proposition « retrouver tes amis » de la carte des amis (iOS `OnboardingContactsPhase`).
 *
 * Le carnet sert à DEUX choses, et deux seulement : relier l'utilisateur aux amis déjà sur Meeshy, et le prévenir
 * quand un autre arrive. Aucun démarchage : « Inviter » reste un SMS que l'utilisateur envoie lui-même.
 */
sealed interface OnboardingContactsPhase {
    /** L'appareil interdit le carnet (profil géré) : la proposition n'existe pas — aucun bouton sans effet. */
    data object Unavailable : OnboardingContactsPhase

    /** La proposition : « Retrouver mes amis » ou « Plus tard ». */
    data object Offer : OnboardingContactsPhase

    data object Searching : OnboardingContactsPhase

    /** Carnet rapproché. Vide : message positif et « Inviter ». */
    data class Found(val friends: List<OnboardingSuggestion>) : OnboardingContactsPhase

    /** « Plus tard » sur la proposition, ou refus à la fenêtre système : la carte retombe sur ses suggestions. */
    data object Declined : OnboardingContactsPhase

    /** Refus définitif ANTÉRIEUR : la fenêtre ne s'ouvrira plus, seuls les Réglages rendent l'accès. */
    data object DeniedBySystem : OnboardingContactsPhase

    /** La synchronisation a échoué : on peut réessayer. */
    data object Failed : OnboardingContactsPhase
}

object OnboardingContactsRules {
    /**
     * La phase de départ, lue sur l'autorisation courante. Un accès DÉJÀ accordé part aussi de `Offer` : le modèle
     * lance la recherche à l'arrivée sur la carte, sans rien redemander.
     */
    fun initialPhase(permission: MediaPermissionState): OnboardingContactsPhase = when (permission) {
        MediaPermissionState.DENIED -> OnboardingContactsPhase.DeniedBySystem
        MediaPermissionState.RESTRICTED -> OnboardingContactsPhase.Unavailable
        else -> OnboardingContactsPhase.Offer
    }

    /** La proposition justifie à elle seule la carte, suggestions absentes : seulement si le geste peut aboutir. */
    fun isOfferable(permission: MediaPermissionState): Boolean = !permission.needsSettingsRedirect

    /** Accès accordé AVANT la carte : la recherche part d'elle-même. */
    fun searchesOnArrival(permission: MediaPermissionState): Boolean = permission.isUsable

    /** Les amis trouvés : un par compte, jamais soi-même, sous le nom donné dans le carnet de l'utilisateur. */
    fun friends(contacts: List<DirectoryContact>, selfId: String?): List<OnboardingSuggestion> =
        contacts
            .mapNotNull { contact ->
                val user = contact.matchedUser?.takeIf { contact.isOnMeeshy && it.id != selfId }
                    ?: return@mapNotNull null
                OnboardingSuggestion(
                    id = user.id,
                    username = user.username,
                    displayName = contact.resolvedName,
                    avatarUrl = user.avatar,
                )
            }
            .distinctBy { it.id }
            .sortedWith(compareBy(String.CASE_INSENSITIVE_ORDER) { it.displayName })

    /** Les rangées de la carte : les amis trouvés d'abord, puis les suggestions qui ne les répètent pas. */
    fun rows(found: List<OnboardingSuggestion>, suggestions: List<OnboardingSuggestion>): List<OnboardingSuggestion> {
        val foundIds = found.map { it.id }.toSet()
        return found + suggestions.filter { it.id !in foundIds }
    }
}
