package me.meeshy.app.profile

import androidx.annotation.StringRes
import me.meeshy.feature.profile.R
import me.meeshy.sdk.model.AgeClass
import me.meeshy.sdk.model.PlatformRole
import me.meeshy.sdk.model.relation.RelationAccess
import me.meeshy.sdk.model.relation.RelationAccessInput
import me.meeshy.sdk.model.relation.RelationConsent
import me.meeshy.sdk.model.relation.RelationFeature
import me.meeshy.sdk.model.relation.RelationLevel

/**
 * Ce que la Vitrine peut montrer ou fermer selon le cercle (« Voir comme », #18887). Chaque capacité nomme la feature de la
 * loi d'accès qui la gouverne : le niveau qui l'ouvre n'est écrit nulle part ici, il se lit dans [RelationAccess].
 *
 * La liste et son ordre sont ceux du contrat partagé `PROFILE_CAPABILITY_FEATURE` (`packages/shared/utils/profile-circle-view.ts`),
 * que la passerelle sert sur `?as=` et que le web affiche : un propriétaire lit la même vitrine sur les trois clients, et une
 * capacité ouverte par un cercle (la position temporaire dès Ami) ne disparaît pas de l'aperçu. `VitrineAsCircleTest` relit le
 * fichier TypeScript.
 */
internal enum class VitrineCapability(val feature: RelationFeature, @StringRes val title: Int) {
    PRESENCE(RelationFeature.PRESENCE_ONLINE, R.string.vitrine_cap_presence),
    PRESENCE_DETAILED(RelationFeature.PRESENCE_DETAILED, R.string.vitrine_cap_presence_detailed),
    LEVEL_AND_RANK(RelationFeature.GAME_BASIC, R.string.vitrine_cap_level_rank),
    SPARKS(RelationFeature.GAME_SPARKS_GLORY, R.string.vitrine_cap_sparks),
    DIRECT_MESSAGE(RelationFeature.DM_DIRECT, R.string.vitrine_cap_direct_message),
    MESSAGE_REQUEST(RelationFeature.DM_REQUEST, R.string.vitrine_cap_message_request),
    RING(RelationFeature.CALL_RING, R.string.vitrine_cap_ring),
    TALKIE(RelationFeature.TALKIE, R.string.vitrine_cap_talkie),
    TOGETHER(RelationFeature.TOGETHER, R.string.vitrine_cap_together),
    BRING(RelationFeature.BRING, R.string.vitrine_cap_bring),
    LISTENING_CATEGORY(RelationFeature.LISTENING_CATEGORY, R.string.vitrine_cap_listening_category),
    LISTENING_TITLE(RelationFeature.LISTENING_TITLE, R.string.vitrine_cap_listening_title),
    LOCATION_TEMPORARY(RelationFeature.LOCATION_TEMPORARY, R.string.vitrine_cap_location_temporary),
    LOCATION_LIVE(RelationFeature.LOCATION_LIVE, R.string.vitrine_cap_location_live),
    LOCATION_HISTORY(RelationFeature.LOCATION_HISTORY, R.string.vitrine_cap_location_history),
    LOCATION_PROXIMITY(RelationFeature.LOCATION_PROXIMITY, R.string.vitrine_cap_location_proximity),
    BATTERY(RelationFeature.DEVICE_BATTERY, R.string.vitrine_cap_battery),
    BATTERY_PULL(RelationFeature.DEVICE_BATTERY_PULL, R.string.vitrine_cap_battery_pull),
    UNREACHABLE(RelationFeature.DEVICE_UNREACHABLE, R.string.vitrine_cap_unreachable),
}

/** Une rangée verrouillée : la capacité et le cercle qui l'ouvre, jamais la donnée protégée ni un champ voisin. */
internal data class VitrineLock(val capability: VitrineCapability, val opensAt: RelationLevel)

internal data class VitrineView(
    val level: RelationLevel,
    val open: List<VitrineCapability>,
    val locked: List<VitrineLock>,
)

/**
 * La Vitrine telle que la voit un cercle : le lecteur SYNTHÉTIQUE de `resolveProfileCircleViewAs` — un lecteur ordinaire
 * du cercle, aux deux accords égaux, sans communauté, sans rôle ni âge connu — et le consentement supposé accordé, comme le
 * contrat partagé : l'aperçu dit ce que le CERCLE ouvre, le serveur restant l'autorité de ce qui est servi.
 */
internal object VitrineAsCircle {
    val levels: List<RelationLevel> = RelationLevel.entries

    fun view(level: RelationLevel): VitrineView {
        val (open, closed) = VitrineCapability.entries.partition { allows(level, it.feature) }
        val locked = closed
            .map { VitrineLock(it, opensAt = opensAt(it.feature)) }
            .sortedBy { it.opensAt }
        return VitrineView(level, open, locked)
    }

    private fun opensAt(feature: RelationFeature): RelationLevel =
        levels.first { allows(it, feature) }

    private fun allows(level: RelationLevel, feature: RelationFeature): Boolean = RelationAccess.resolve(
        RelationAccessInput(
            viewerId = VIEWER, targetId = OWNER, grantedByViewer = level, grantedByTarget = level,
            sharesCommunity = false, blockedEitherWay = false, viewerMinor = AgeClass.UNKNOWN, targetMinor = AgeClass.UNKNOWN,
            viewerRole = PlatformRole.USER, feature = feature, consent = RelationConsent.GRANTED,
        ),
    ).allowed

    private const val VIEWER = "preview-viewer"
    private const val OWNER = "preview-owner"
}
