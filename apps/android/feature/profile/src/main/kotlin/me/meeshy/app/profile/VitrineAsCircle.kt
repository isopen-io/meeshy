package me.meeshy.app.profile

import androidx.annotation.StringRes
import me.meeshy.feature.profile.R
import me.meeshy.sdk.model.AgeClass
import me.meeshy.sdk.model.relation.RelationAccess
import me.meeshy.sdk.model.relation.RelationAccessInput
import me.meeshy.sdk.model.relation.RelationConsent
import me.meeshy.sdk.model.relation.RelationFeature
import me.meeshy.sdk.model.relation.RelationLevel

/**
 * Ce que la Vitrine peut montrer ou fermer selon le cercle (« Voir comme », #18887). Chaque capacité nomme la feature de la
 * loi d'accès qui la gouverne : le niveau qui l'ouvre n'est écrit nulle part ici, il se lit dans [RelationAccess].
 */
internal enum class VitrineCapability(val feature: RelationFeature, @StringRes val title: Int) {
    PRESENCE(RelationFeature.PRESENCE_ONLINE, R.string.vitrine_cap_presence),
    PRESENCE_DETAILED(RelationFeature.PRESENCE_DETAILED, R.string.vitrine_cap_presence_detailed),
    LEVEL_AND_RANK(RelationFeature.GAME_BASIC, R.string.vitrine_cap_level_rank),
    SPARKS(RelationFeature.GAME_SPARKS_GLORY, R.string.vitrine_cap_sparks),
    BATTERY(RelationFeature.DEVICE_BATTERY, R.string.vitrine_cap_battery),
    LOCATION_LIVE(RelationFeature.LOCATION_LIVE, R.string.vitrine_cap_location_live),
    LOCATION_HISTORY(RelationFeature.LOCATION_HISTORY, R.string.vitrine_cap_location_history),
}

/** Une rangée verrouillée : la capacité et le cercle qui l'ouvre, jamais la donnée protégée ni un champ voisin. */
internal data class VitrineLock(val capability: VitrineCapability, val opensAt: RelationLevel)

internal data class VitrineView(
    val level: RelationLevel,
    val open: List<VitrineCapability>,
    val locked: List<VitrineLock>,
)

/**
 * La Vitrine telle que la voit un cercle. L'aperçu pose deux inconnus majeurs de part et d'autre, sans communauté ni blocage,
 * et suppose le consentement accordé : il dit ce que le CERCLE ouvre, le serveur restant l'autorité de ce qui est servi.
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
            sharesCommunity = false, blockedEitherWay = false, viewerMinor = AgeClass.ADULT, targetMinor = AgeClass.ADULT,
            viewerRole = null, feature = feature, consent = RelationConsent.GRANTED,
        ),
    ).allowed

    private const val VIEWER = "preview-viewer"
    private const val OWNER = "preview-owner"
}
