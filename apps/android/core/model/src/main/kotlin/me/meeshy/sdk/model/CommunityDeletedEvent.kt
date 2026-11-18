package me.meeshy.sdk.model

import kotlinx.serialization.Serializable

/**
 * `community:deleted` (#19590, consommé ici pour #19592) — miroir de `CommunityDeletedEventData`
 * (`packages/shared/types/socketio-events/community.ts`). Le créateur a supprimé la communauté
 * (`reason = deleted`) ou l'équipe l'a désactivée (`deactivated`) ; la charge ne nomme ni membres ni
 * créateur.
 */
@Serializable
data class CommunityDeletedEvent(
    val communityId: String,
    val reason: String? = null,
    val at: String? = null,
) {
    /** La communauté disparue, ou `null` quand la charge n'en désigne aucune. */
    val disappearedId: String? get() = communityId.takeIf { it.isNotEmpty() }
}

/** La page tenue sans la communauté disparue ; `null` quand elle ne la tenait pas. */
fun List<ApiCommunity>.withoutCommunity(communityId: String): List<ApiCommunity>? =
    filterNot { it.id == communityId }.takeIf { it.size != size }
