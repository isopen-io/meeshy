package me.meeshy.sdk.model

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.JsonTransformingSerializer

/**
 * Corps de `PATCH /conversations/{id}/participants/{participantId}/rights` pour UN droit.
 *
 * **Un seul droit par écriture** : la surcharge est un delta côté gateway, et lui poster les huit gèlerait les sept
 * autres à leur valeur du moment — ils cesseraient de suivre les conditions du join. Tous les champs sont nuls par
 * défaut et `MeeshyApi.json` n'encode pas les défauts : seule la clé posée par [single] part sur le fil.
 *
 * Jumeau : `updateParticipantRights(rights: [capability.rawValue: value])` (SDK Swift).
 */
@Serializable
data class ParticipantRightsUpdate(
    val canViewHistory: Boolean? = null,
    val canSendMessages: Boolean? = null,
    val canSendImages: Boolean? = null,
    val canSendFiles: Boolean? = null,
    val canSendVideos: Boolean? = null,
    val canSendAudios: Boolean? = null,
    val canSendLinks: Boolean? = null,
    val canSendLocations: Boolean? = null,
) {
    companion object {
        fun single(capability: ParticipantCapability, value: Boolean): ParticipantRightsUpdate = when (capability) {
            ParticipantCapability.CAN_VIEW_HISTORY -> ParticipantRightsUpdate(canViewHistory = value)
            ParticipantCapability.CAN_SEND_MESSAGES -> ParticipantRightsUpdate(canSendMessages = value)
            ParticipantCapability.CAN_SEND_IMAGES -> ParticipantRightsUpdate(canSendImages = value)
            ParticipantCapability.CAN_SEND_FILES -> ParticipantRightsUpdate(canSendFiles = value)
            ParticipantCapability.CAN_SEND_VIDEOS -> ParticipantRightsUpdate(canSendVideos = value)
            ParticipantCapability.CAN_SEND_AUDIOS -> ParticipantRightsUpdate(canSendAudios = value)
            ParticipantCapability.CAN_SEND_LINKS -> ParticipantRightsUpdate(canSendLinks = value)
            ParticipantCapability.CAN_SEND_LOCATIONS -> ParticipantRightsUpdate(canSendLocations = value)
        }
    }
}

/** La même capacité, une autre valeur. */
fun ParticipantEntryCapabilities.with(capability: ParticipantCapability, value: Boolean): ParticipantEntryCapabilities =
    when (capability) {
        ParticipantCapability.CAN_VIEW_HISTORY -> copy(canViewHistory = value)
        ParticipantCapability.CAN_SEND_MESSAGES -> copy(canSendMessages = value)
        ParticipantCapability.CAN_SEND_IMAGES -> copy(canSendImages = value)
        ParticipantCapability.CAN_SEND_FILES -> copy(canSendFiles = value)
        ParticipantCapability.CAN_SEND_VIDEOS -> copy(canSendVideos = value)
        ParticipantCapability.CAN_SEND_AUDIOS -> copy(canSendAudios = value)
        ParticipantCapability.CAN_SEND_LINKS -> copy(canSendLinks = value)
        ParticipantCapability.CAN_SEND_LOCATIONS -> copy(canSendLocations = value)
    }

/**
 * Décode `participant:rights-updated` en posant [ParticipantRightsUpdatedEvent.carriesHistoryGrant] : la PRÉSENCE de la
 * clé `historyVisibleFrom`, jamais sa valeur. `null` explicite = « il n'y a pas d'octroi » (efface) ; clé absente = un
 * producteur qui ne connaît pas le champ (n'affirme rien). Miroir de `carriesHistoryGrant` (SDK Swift).
 */
object ParticipantRightsUpdatedEventSerializer :
    JsonTransformingSerializer<ParticipantRightsUpdatedEvent>(ParticipantRightsUpdatedEvent.serializer()) {
    override fun transformDeserialize(element: JsonElement): JsonElement {
        val payload = element as? JsonObject ?: return element
        return JsonObject(payload + (CARRIES_KEY to JsonPrimitive(payload.containsKey(GRANT_KEY))))
    }

    private const val CARRIES_KEY = "carriesHistoryGrant"
    private const val GRANT_KEY = "historyVisibleFrom"
}

/** Les transitions de la fiche d'un participant — pures, partagées par l'écran et le cache. */
object ParticipantProfileLive {

    /** La réponse RÉSOLUE du serveur, posée telle quelle. */
    fun withRights(profile: ApiParticipantProfile, rights: ParticipantEntryCapabilities): ApiParticipantProfile =
        profile.copy(entryCapabilities = rights)

    /**
     * Applique `participant:rights-updated` : les droits servis recouvrent ceux de la fiche (un droit non dit,
     * #4009, laisse celui de la fiche), l'octroi n'est posé ou effacé que si la clé était PRÉSENTE. Sans droits
     * connus ni charge complète, rien n'est affirmé sur eux.
     */
    fun applying(event: ParticipantRightsUpdatedEvent, to: ApiParticipantProfile): ApiParticipantProfile {
        val served = event.rights
        val known = to.entryCapabilities
        val rights = when {
            known != null -> known.copy(
                canSendMessages = served.canSendMessages ?: known.canSendMessages,
                canSendFiles = served.canSendFiles ?: known.canSendFiles,
                canSendImages = served.canSendImages ?: known.canSendImages,
                canSendVideos = served.canSendVideos ?: known.canSendVideos,
                canSendAudios = served.canSendAudios ?: known.canSendAudios,
                canSendLocations = served.canSendLocations ?: known.canSendLocations,
                canSendLinks = served.canSendLinks ?: known.canSendLinks,
                canViewHistory = served.canViewHistory ?: known.canViewHistory,
            )
            served.isComplete -> ParticipantEntryCapabilities(
                canSendMessages = served.canSendMessages == true,
                canSendFiles = served.canSendFiles == true,
                canSendImages = served.canSendImages == true,
                canSendVideos = served.canSendVideos == true,
                canSendAudios = served.canSendAudios == true,
                canSendLocations = served.canSendLocations == true,
                canSendLinks = served.canSendLinks == true,
                canViewHistory = served.canViewHistory,
            )
            else -> null
        }
        val withRights = if (rights != null) to.copy(entryCapabilities = rights) else to
        return if (event.carriesHistoryGrant) withRights.copy(historyVisibleFrom = event.historyVisibleFrom) else withRights
    }

    /**
     * Nom et photo d'un compte renommé pendant que sa fiche est ouverte (`user:updated`). `null` quand l'annonce vise
     * quelqu'un d'autre, un visiteur sans compte, ou ne change rien.
     */
    fun repainted(profile: ApiParticipantProfile, event: UserUpdatedEvent): ApiParticipantProfile? {
        if (profile.isAnonymous || profile.userId.isNullOrBlank() || profile.userId != event.userId) return null
        val next = profile.copy(
            displayName = event.composedName ?: profile.displayName,
            firstName = event.firstName ?: profile.firstName,
            lastName = event.lastName ?: profile.lastName,
            username = event.username ?: profile.username,
            avatar = event.avatar.applied(profile.avatar),
        )
        return next.takeIf { it != profile }
    }

    private val ServedParticipantRights.isComplete: Boolean
        get() = canSendMessages != null && canSendFiles != null && canSendImages != null && canSendVideos != null &&
            canSendAudios != null && canSendLocations != null && canSendLinks != null
}
