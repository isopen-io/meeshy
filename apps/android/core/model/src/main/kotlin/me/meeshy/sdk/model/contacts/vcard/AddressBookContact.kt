package me.meeshy.sdk.model.contacts.vcard

/**
 * Une fiche du carnet de l'appareil telle que le système la rend, CHOISIE par l'auteur dans le sélecteur
 * (#13703) : des champs bruts, des types codés par le carnet. Ni photo ni note n'y figurent — ce qui n'est
 * pas ici ne peut pas partir dans la carte (miroir des clés que lit `ContactCardExporter.swift`, iOS).
 */
data class AddressBookContact(
    val displayName: String? = null,
    val givenName: String? = null,
    val familyName: String? = null,
    val phones: List<AddressBookValue> = emptyList(),
    val emails: List<AddressBookValue> = emptyList(),
    val addresses: List<AddressBookPostal> = emptyList(),
    val organization: String? = null,
    val jobTitle: String? = null,
    val websites: List<String> = emptyList(),
    val birthday: String? = null,
)

/** Un numéro ou un e-mail et son type codé par le carnet ([AddressBookTypes]). */
data class AddressBookValue(val value: String, val type: Int = AddressBookTypes.CUSTOM)

/** Une adresse postale structurée et son type codé par le carnet. */
data class AddressBookPostal(
    val street: String = "",
    val city: String = "",
    val region: String = "",
    val postalCode: String = "",
    val country: String = "",
    val type: Int = AddressBookTypes.CUSTOM,
)

/**
 * Les codes de type du carnet Android (`ContactsContract.CommonDataKinds.*.TYPE_*`), recopiés ici parce que
 * `:core:model` n'importe rien d'`android.*`. Ce sont des constantes publiques et stables du système.
 */
object AddressBookTypes {
    const val CUSTOM: Int = 0

    const val PHONE_HOME: Int = 1
    const val PHONE_MOBILE: Int = 2
    const val PHONE_WORK: Int = 3
    const val PHONE_FAX_WORK: Int = 4
    const val PHONE_FAX_HOME: Int = 5
    const val PHONE_PAGER: Int = 6
    const val PHONE_OTHER: Int = 7
    const val PHONE_CAR: Int = 9
    const val PHONE_MAIN: Int = 12
    const val PHONE_OTHER_FAX: Int = 13

    const val EMAIL_HOME: Int = 1
    const val EMAIL_WORK: Int = 2
    const val EMAIL_OTHER: Int = 3
    const val EMAIL_MOBILE: Int = 4

    const val POSTAL_HOME: Int = 1
    const val POSTAL_WORK: Int = 2
    const val POSTAL_OTHER: Int = 3
}
