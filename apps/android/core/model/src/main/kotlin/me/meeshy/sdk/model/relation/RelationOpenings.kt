package me.meeshy.sdk.model.relation

import me.meeshy.sdk.model.AgeClass
import me.meeshy.sdk.model.PlatformRole

/**
 * Ce qu'un niveau OUVRE, lu dans la loi d'accès et nulle part ailleurs : le lecteur SYNTHÉTIQUE de `resolveProfileCircleViewAs`
 * — un lecteur ordinaire aux deux accords égaux, sans communauté, sans rôle ni âge connu — avec le consentement supposé accordé.
 * Le niveau qui ouvre une capacité n'est écrit dans aucun écran : il se calcule ici, par [RelationAccess.resolve].
 *
 * Le miroir ne décide d'AUCUN accès : le serveur reste l'autorité de ce qui est servi ; ceci sert à ne pas PROPOSER ce qu'il
 * refusera, et à dire quel cercle ouvre ce qui est fermé.
 */
public object RelationOpenings {
    private val scale: List<RelationLevel> = RelationLevel.entries

    /** Le niveau le plus bas de l'échelle qui ouvre [feature] ; un fermé partout se lit au sommet (fermé par défaut). */
    public fun opensAt(feature: RelationFeature): RelationLevel =
        scale.firstOrNull { isOpen(it, feature) } ?: scale.last()

    public fun isOpen(level: RelationLevel, feature: RelationFeature): Boolean = RelationAccess.resolve(
        RelationAccessInput(
            viewerId = VIEWER,
            targetId = OWNER,
            grantedByViewer = level,
            grantedByTarget = level,
            sharesCommunity = false,
            blockedEitherWay = false,
            viewerMinor = AgeClass.UNKNOWN,
            targetMinor = AgeClass.UNKNOWN,
            viewerRole = PlatformRole.USER,
            feature = feature,
            consent = RelationConsent.GRANTED,
        ),
    ).allowed

    private const val VIEWER = "preview-viewer"
    private const val OWNER = "preview-owner"
}
