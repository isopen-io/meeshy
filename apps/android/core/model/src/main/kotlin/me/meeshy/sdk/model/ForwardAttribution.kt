package me.meeshy.sdk.model

/**
 * Qui a le droit d'être nommé sous un message transféré.
 *
 * Trois issues, jamais un `String?` : une signature optionnelle laisse l'appelant
 * confondre « pas de groupe à nommer » et « interdit de nommer », et retomber sur
 * le nom de la PERSONNE — c'est exactement par là que la fuite passait.
 *
 * MIROIR de `ForwardAttribution` (`apps/ios/Meeshy/Features/Main/Views/Bubble/ForwardBadgePolicy.swift`).
 * La règle qui produit ces valeurs est [ForwardBadgePolicy].
 */
sealed interface ForwardAttribution {
    /** Le groupe source se nomme lui-même. L'auteur disparaît. */
    data class Group(val name: String) : ForwardAttribution

    /** Aucun groupe à nommer (tête-à-tête) : l'auteur reste la seule provenance. */
    data class Person(val name: String) : ForwardAttribution

    /** Personne n'est nommé — repli sûr, jamais un repli sur l'auteur. */
    data object Anonymous : ForwardAttribution
}
