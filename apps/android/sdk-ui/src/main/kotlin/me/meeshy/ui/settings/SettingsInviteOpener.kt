package me.meeshy.ui.settings

import androidx.compose.runtime.Composable
import androidx.compose.runtime.ProvidableCompositionLocal
import androidx.compose.runtime.remember
import androidx.compose.runtime.staticCompositionLocalOf
import me.meeshy.sdk.model.settings.SettingsInvite

/**
 * L'ouvreur des invites de réglage (#16339) : une surface qui propose d'activer un réglage (« Activez le consentement
 * vocal… ») ouvre le hub Réglages sur ce réglage, mis en évidence, sans dépendre de `:feature:settings`. La destination
 * est posée par `:app` autour de l'écran hôte ([LocalSettingsInviteOpener]).
 */
public fun interface SettingsInviteOpener {
    public fun open(invite: SettingsInvite)
}

/** Sans hôte (aperçus, tests) : aucune destination, l'invite reste un simple texte plutôt qu'une porte morte. */
public val LocalSettingsInviteOpener: ProvidableCompositionLocal<SettingsInviteOpener?> =
    staticCompositionLocalOf { null }

/** Le geste d'une [invite] posée dans l'écran courant : ouvrir son réglage ; `null` quand aucun hôte n'en pose. */
@Composable
public fun rememberSettingsInvite(invite: SettingsInvite): (() -> Unit)? {
    val opener = LocalSettingsInviteOpener.current ?: return null
    return remember(opener, invite) { { opener.open(invite) } }
}
