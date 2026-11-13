package me.meeshy.feature.kit

/**
 * Les libellés du catalogue. Un écran de développement : absent des binaires publiés, donc sans traduction (fiche K00 §1,
 * « ses libellés sont des identifiants techniques »). Les mots qui ne sont pas des identifiants restent ici, en un seul
 * lieu, plutôt que dispersés en littéraux dans les composables.
 */
internal object KitCatalogLabels {
    const val TITLE: String = "Kit"
    const val EMPTY: String = "Aucun composant livré"
    const val SETTINGS: String = "Réglages"
    const val BACK: String = "Retour"
    const val SETTING_DARK: String = "dark"
    const val SETTING_RTL: String = "rtl"
    const val SETTING_LARGE_FONT: String = "fontScale 2.0"
    const val PRESSED_LEGEND: String = "isPressed"
    const val LEGEND_SEPARATOR: String = " · "
}
