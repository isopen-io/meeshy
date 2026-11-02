package me.meeshy.sdk.model

/**
 * L'apparence des barres système (état, navigation) dérivée du thème EFFECTIF de l'application — celui choisi dans les réglages,
 * pas seulement celui du système : sur un fond clair choisi dans l'app, les icônes sont sombres même si le système est en sombre
 * (et inversement). Loi pure ; l'activité la pose sur la fenêtre.
 */
public data class SystemBarsAppearance(val darkTheme: Boolean) {

    /** Icônes sombres sur un fond clair, claires sur un fond sombre (`isAppearanceLightStatusBars` côté plateforme). */
    val darkIcons: Boolean get() = !darkTheme

    public companion object {
        public fun of(mode: AppThemeMode, systemInDark: Boolean): SystemBarsAppearance =
            SystemBarsAppearance(darkTheme = mode.resolveDarkMode(systemInDark))
    }
}
