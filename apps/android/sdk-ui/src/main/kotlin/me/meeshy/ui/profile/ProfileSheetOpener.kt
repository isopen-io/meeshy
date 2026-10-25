package me.meeshy.ui.profile

import androidx.compose.runtime.ProvidableCompositionLocal
import androidx.compose.runtime.staticCompositionLocalOf
import me.meeshy.sdk.model.profile.ProfileSheetUser

/**
 * L'ouvreur GLOBAL de la fiche profil (pendant de `.sheet(item:)` posé par la racine iOS) :
 * toucher une personne, d'où que l'on vienne, appelle [open] avec ce que la surface sait d'elle.
 * La feuille elle-même vit dans `:app`, qui fournit l'implémentation par [LocalProfileSheetOpener] ;
 * une feature ne dépend ainsi jamais de `:feature:profile`.
 */
public fun interface ProfileSheetOpener {
    public fun open(user: ProfileSheetUser)
}

/** L'ouvreur par défaut, sans hôte (aperçus, tests, arbre hors racine) : inerte, il ne plante jamais. */
public object InertProfileSheetOpener : ProfileSheetOpener {
    override fun open(user: ProfileSheetUser): Unit = Unit
}

public val LocalProfileSheetOpener: ProvidableCompositionLocal<ProfileSheetOpener> =
    staticCompositionLocalOf { InertProfileSheetOpener }
