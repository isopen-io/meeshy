package me.meeshy.sdk.model.profile

import me.meeshy.sdk.model.relation.RelationFeature
import me.meeshy.sdk.model.relation.RelationLevel
import me.meeshy.sdk.model.relation.RelationOpenings

/**
 * Les opérations que la face Actions range, dans l'ordre où elle les pose. Chacune nomme la feature de la loi d'accès qui la
 * gouverne ; [WRITE] en a deux (écrire directement dès Connaissance, sinon demander à écrire) et [CALL] / [VIDEO] une seule.
 */
enum class ProfileRelationAction(val feature: RelationFeature) {
    WRITE(RelationFeature.DM_DIRECT),
    CALL(RelationFeature.CALL_RING),
    VIDEO(RelationFeature.CALL_RING),
    TALKIE(RelationFeature.TALKIE),
    BRING(RelationFeature.BRING),
    LOCATION(RelationFeature.LOCATION_TEMPORARY),
    BATTERY(RelationFeature.DEVICE_BATTERY),
    UNREACHABLE(RelationFeature.DEVICE_UNREACHABLE),
}

/**
 * Une opération offerte ou verrouillée par le cercle commun (loi 4 : ce qui est fermé se voit, verrouillé). Une rangée
 * verrouillée ne porte QUE le cercle qui l'ouvre : aucune donnée protégée, aucun champ voisin n'a de place dans sa forme.
 */
sealed interface ProfileActionAccess {
    /** [writeAsRequest] : « écrire » part comme une demande de message (sous Connaissance), pas comme un message direct. */
    data class Offered(val writeAsRequest: Boolean = false) : ProfileActionAccess

    data class Locked(val opensAt: RelationLevel) : ProfileActionAccess

    companion object {
        fun of(level: RelationLevel, action: ProfileRelationAction): ProfileActionAccess {
            if (action == ProfileRelationAction.WRITE) {
                return Offered(writeAsRequest = !RelationOpenings.isOpen(level, RelationFeature.DM_DIRECT))
            }
            if (RelationOpenings.isOpen(level, action.feature)) return Offered()
            return Locked(RelationOpenings.opensAt(action.feature))
        }

        /**
         * Le niveau auquel la face juge les opérations. Le niveau d'outils servi (`accessLevel`, #16623) est le verdict de la
         * loi pour la paire : il ne s'écarte du lien qu'entre deux comptes de l'équipe, et il est servi même sans lien. À défaut,
         * le lien ; sans l'un ni l'autre, Public — sauf pour une personne connectée dont le lien n'est pas encore là (cache
         * vide, hors ligne) : le niveau est alors INCONNU (`null`) et rien n'est faussement verrouillé.
         */
        fun levelFor(linkLevel: RelationLevel?, toolLevel: RelationLevel?, awaitingLink: Boolean): RelationLevel? =
            toolLevel ?: linkLevel ?: RelationLevel.PUBLIC.takeUnless { awaitingLink }

        /** Toutes les opérations, une fois, dans l'ordre de la face. */
        fun plan(level: RelationLevel): List<Pair<ProfileRelationAction, ProfileActionAccess>> =
            ProfileRelationAction.entries.map { it to of(level, it) }
    }
}
