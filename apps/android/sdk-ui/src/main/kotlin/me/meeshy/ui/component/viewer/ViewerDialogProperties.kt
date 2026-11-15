package me.meeshy.ui.component.viewer

import androidx.compose.ui.window.DialogProperties
import androidx.compose.ui.window.SecureFlagPolicy

/**
 * La fenêtre d'une visionneuse plein écran. Un `Dialog` est une NOUVELLE fenêtre : elle n'hérite pas de la couche
 * sécurisée de l'écran qui l'a ouverte. Un contenu protégé ([secure] : flamme, vue unique, flou — #9574) l'exige donc
 * explicitement (`FLAG_SECURE`) ; les autres gardent le comportement hérité.
 */
public fun viewerDialogProperties(secure: Boolean): DialogProperties = DialogProperties(
    usePlatformDefaultWidth = false,
    decorFitsSystemWindows = false,
    securePolicy = if (secure) SecureFlagPolicy.SecureOn else SecureFlagPolicy.Inherit,
)
