package me.meeshy.sdk.model

/**
 * Rendu de l'effectif : « 199+ » quand la passerelle l'a plafonné pour ce lecteur, la valeur exacte
 * sinon. Chiffres et « + » : identique dans toutes les langues (miroir de iOS
 * `MeeshyConversation.memberCountDisplay`).
 */
fun formatMemberCount(count: Int, capped: Boolean): String =
    if (capped) "$count+" else "$count"

/** L'effectif de la ligne, plafond compris (`memberCountCapped` absent = exact). */
val ApiConversation.memberCountDisplay: String
    get() = formatMemberCount(memberCount, memberCountCapped == true)
