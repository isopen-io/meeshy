package me.meeshy.sdk.model.onboarding

import java.util.Locale

/**
 * Le salut pré-rempli de la carte « Dis salut au monde » (iOS `OnboardingGreeting`).
 *
 * Pas un texte fixe, huit gabarits par langue : cent nouveaux venus qui envoient le même « Salut ! » font un mur de
 * doublons dans Meeshy Global. Chaque gabarit porte un TROU PERSONNEL — le prénom, les langues parlées — déjà
 * rempli, pour que le message parte tel quel si on ne le modifie pas, et reste modifiable avant l'envoi.
 */
object OnboardingGreeting {
    const val TEMPLATE_COUNT: Int = 8

    /** `%1$s` = le prénom, `%2$s` = les langues parlées, déjà jointes. */
    fun compose(template: String, name: String, joinedLanguages: String, locale: Locale): String =
        String.format(locale, template, name, joinedLanguages)

    /** « fr », « en », « es » : le message déclare sa langue d'origine tant que le gabarit est intact. */
    fun contentLanguage(interfaceTag: String?): String =
        interfaceTag?.substringBefore('-')?.substringBefore('_')?.takeIf { it.isNotEmpty() } ?: "fr"
}
