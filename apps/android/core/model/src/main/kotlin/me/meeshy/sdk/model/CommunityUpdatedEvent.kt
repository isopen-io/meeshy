package me.meeshy.sdk.model

import java.time.Instant
import java.time.format.DateTimeParseException
import kotlinx.serialization.Serializable

/**
 * `community:updated` (#18435, consommé ici pour #18439) — l'identité publique d'une communauté telle
 * qu'elle vient d'être écrite, miroir de `CommunityUpdatedEventData`
 * (`packages/shared/types/socketio-events/community.ts`) et de `CommunityUpdatedEvent` (iOS).
 *
 * La charge ne porte ni les membres, ni leur présence, ni « N en ligne », ni le créateur : ce que
 * l'appareil en tient reste tel quel. Nom et description voyagent tels que STOCKÉS, comme dans la
 * réponse HTTP, et se lisent donc par le même chemin.
 */
@Serializable
data class CommunityUpdatedEvent(
    val communityId: String,
    val identifier: String,
    val name: String,
    val description: String? = null,
    val avatar: String? = null,
    val banner: String? = null,
    val isPrivate: Boolean,
    val memberCount: Int,
    val updatedAt: String,
) {
    /** Vrai quand rien ne permet de dire que [held] est plus récente (iOS `isNewer(than:)`). */
    fun isNewerThan(held: String?): Boolean {
        val heldAt = held?.let(::instantOrNull) ?: return true
        val writtenAt = instantOrNull(updatedAt) ?: return true
        return !writtenAt.isBefore(heldAt)
    }

    private fun instantOrNull(raw: String): Instant? =
        try {
            Instant.parse(raw)
        } catch (_: DateTimeParseException) {
            null
        }
}

/**
 * La fiche tenue, réécrite par l'événement — `null` quand il ne la concerne pas (autre communauté)
 * ou qu'il est plus ancien qu'elle (deux réglages rapprochés peuvent arriver dans le désordre).
 */
fun ApiCommunity.applying(event: CommunityUpdatedEvent): ApiCommunity? {
    if (event.communityId != id || !event.isNewerThan(updatedAt)) return null
    return copy(
        identifier = event.identifier,
        name = event.name,
        description = event.description,
        avatar = event.avatar,
        banner = event.banner,
        isPrivate = event.isPrivate,
        updatedAt = event.updatedAt,
        memberCount = event.memberCount,
        conversationCount = conversationCount ?: count?.conversation,
        count = null,
    )
}

/** Une page tenue, réécrite sur la seule ligne visée ; `null` quand aucune ne change. */
fun List<ApiCommunity>.applying(event: CommunityUpdatedEvent): List<ApiCommunity>? {
    var changed = false
    val next = map { held -> held.applying(event)?.also { changed = true } ?: held }
    return next.takeIf { changed }
}
