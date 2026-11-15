package me.meeshy.sdk.model

/**
 * L'effectif d'une conversation après une adhésion ou un débannissement. Miroir de
 * `ConversationListViewModel.memberCountAfterMembershipEvent` (iOS) et de `applyMemberCount` (web).
 *
 * L'effectif ABSOLU servi tranche : un delta ne converge pas après un événement manqué, il n'est donc qu'un REPLI pour
 * une passerelle antérieure au contrat. L'absolu arrive avec son drapeau de plafond (199+) et les deux se POSENT
 * ensemble ; sans absolu, un compteur plafonné reste GELÉ (le vrai compte est inconnu du client). Le plancher à zéro vaut
 * pour les deux branches.
 */
data class MemberCountResolution(val count: Int, val capped: Boolean) {
    companion object {
        fun after(
            current: Int,
            currentCapped: Boolean,
            absolute: Int?,
            absoluteCapped: Boolean?,
            delta: Int,
        ): MemberCountResolution = when {
            absolute != null -> MemberCountResolution(absolute.coerceAtLeast(0), absoluteCapped == true)
            currentCapped -> MemberCountResolution(current, capped = true)
            else -> MemberCountResolution((current + delta).coerceAtLeast(0), capped = false)
        }
    }
}

/** La conversation portant l'effectif [resolution] (posé tel quel : le serveur l'a tranché). */
fun ApiConversation.withMemberCount(resolution: MemberCountResolution): ApiConversation =
    copy(serverMemberCount = resolution.count, memberCountCapped = resolution.capped)
