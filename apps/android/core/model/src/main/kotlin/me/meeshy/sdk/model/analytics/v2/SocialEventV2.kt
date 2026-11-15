package me.meeshy.sdk.model.analytics.v2

import java.util.UUID
import kotlinx.serialization.json.JsonElement

/** Les dix types v2. Miroir de `SOCIAL_EVENT_V2_TYPES`. */
enum class SocialEventV2Type(val wire: String) {
    INTERACTION("interaction"),
    NEGATIVE("negative"),
    PLAYBACK("playback"),
    LINK("link"),
    DISCOVERY("discovery"),
    STORY("story"),
    NOTIFICATION("notification"),
    SCREEN_CAPTURE("screen_capture"),
    SCROLL("scroll"),
    VISIBILITY("visibility");

    /** Seuls défilement, lecture et visibilité sont échantillonnables (`SAMPLEABLE_V2_TYPES`). */
    val isSampleable: Boolean get() = this in SAMPLEABLE

    /** Ce qu'un lecteur SANS compte peut produire (`ANONYMOUS_V2_TYPES`). */
    val isAllowedForVisitor: Boolean get() = this in VISITOR

    companion object {
        private val SAMPLEABLE = setOf(SCROLL, PLAYBACK, VISIBILITY)
        private val VISITOR = setOf(VISIBILITY, PLAYBACK, SCROLL, SCREEN_CAPTURE, LINK, DISCOVERY)
    }
}

/** La charge d'un événement : une famille par implémentation. */
sealed interface SocialEventV2Payload {
    val type: SocialEventV2Type
    val action: String

    /** Les champs propres de la famille, sans clé nulle. */
    fun fields(): Map<String, JsonElement>

    val isSampleable: Boolean get() = type.isSampleable
    val isAllowedForVisitor: Boolean get() = type.isAllowedForVisitor
}

/**
 * Un événement v2 : l'enveloppe et la charge de sa famille. Jamais d'URL, de
 * texte saisi ni d'image : des énumérations, des identifiants, des nombres.
 */
data class SocialEventV2(
    val payload: SocialEventV2Payload,
    val occurredAtEpochMillis: Long,
    /** Absente d'un résumé de LISTING (`scroll.listing`) : il ne porte sur aucun contenu. */
    val target: SocialTarget? = null,
    val surface: String? = null,
    val listing: SocialListing? = null,
    val prism: SocialPrism? = null,
    /** UUID v4 en minuscules, posé à la CRÉATION, jamais au rejeu. */
    val eventId: String = newEventId(),
) {
    val type: SocialEventV2Type get() = payload.type
    val action: String get() = payload.action
    val isSampleable: Boolean get() = payload.isSampleable
    val isAllowedForVisitor: Boolean get() = payload.isAllowedForVisitor

    companion object {
        fun newEventId(): String = UUID.randomUUID().toString().lowercase()
    }
}
