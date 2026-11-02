package me.meeshy.sdk.model.contacts.vcard

import java.util.Locale

/** Ce que le composeur téléverse : le texte de la carte, son nom de fichier, le nom qu'elle porte. */
class ContactCardExport(val text: String, val fileName: String, val displayName: String) {
    val bytes: ByteArray get() = text.toByteArray(Charsets.UTF_8)
}

/**
 * Transforme la fiche CHOISIE dans le carnet en vCard 3.0 (#13703), miroir de `ContactCardExporter.swift` :
 * mêmes champs (nom affiché, nom structuré, numéros, e-mails, adresses, organisation, fonction, sites,
 * anniversaire), mêmes types (`cell`, `home`, `work`, `main`, `fax`, `pager`, `other`), ni photo ni note,
 * écrite par [VCardWriter] — le rédacteur de référence d'iOS — et nommée par [ContactCardFile.fileName].
 *
 * Écart assumé : iOS confie d'abord la fiche à `CNContactVCardSerialization` et ne retombe sur le rédacteur
 * qu'en cas d'échec ; Android n'a pas de sérialiseur système et écrit toujours la forme de référence, que
 * le lecteur des deux plateformes relit à l'identique. Une valeur vide du carnet ne produit aucune ligne, et
 * une valeur répétée (fiche réunie de plusieurs comptes, que `CNContact` unifie déjà sur iOS) n'en produit qu'une.
 */
object ContactCardExporter {
    const val MIME_TYPE: String = ContactCardFile.MIME_TYPE

    fun export(contact: AddressBookContact): ContactCardExport? {
        val card = vCard(contact)
        val text = VCardWriter.write(card) ?: return null
        return ContactCardExport(text, ContactCardFile.fileName(card.displayName), card.displayName)
    }

    fun vCard(contact: AddressBookContact): VCard {
        val name = VCardName(family = contact.familyName.orEmpty(), given = contact.givenName.orEmpty())
        return VCard(
            formattedName = contact.displayName?.takeIf { it.isNotBlank() },
            name = name.takeIf { it.composed.isNotEmpty() },
            phones = contact.phones.filter { it.value.isNotBlank() }.map { VCardEntry(it.value, phoneTypes(it.type)) }.distinct(),
            emails = contact.emails.filter { it.value.isNotBlank() }.map { VCardEntry(it.value, emailTypes(it.type)) }.distinct(),
            addresses = contact.addresses.filter(::hasContent).map(::address).distinct(),
            organization = nonEmpty(contact.organization),
            title = nonEmpty(contact.jobTitle),
            urls = contact.websites.filter { it.isNotBlank() }.distinct().map { VCardEntry(it) },
            birthday = contact.birthday?.let(::birthdayString),
            note = null,
        )
    }

    private fun phoneTypes(type: Int): List<String> = when (type) {
        AddressBookTypes.PHONE_MOBILE -> listOf("cell")
        AddressBookTypes.PHONE_MAIN -> listOf("main")
        AddressBookTypes.PHONE_FAX_WORK, AddressBookTypes.PHONE_FAX_HOME, AddressBookTypes.PHONE_OTHER_FAX -> listOf("fax")
        AddressBookTypes.PHONE_PAGER -> listOf("pager")
        AddressBookTypes.PHONE_HOME -> listOf("home")
        AddressBookTypes.PHONE_WORK -> listOf("work")
        AddressBookTypes.PHONE_OTHER -> listOf("other")
        else -> emptyList()
    }

    private fun emailTypes(type: Int): List<String> = when (type) {
        AddressBookTypes.EMAIL_HOME -> listOf("home")
        AddressBookTypes.EMAIL_WORK -> listOf("work")
        AddressBookTypes.EMAIL_OTHER -> listOf("other")
        else -> emptyList()
    }

    private fun postalTypes(type: Int): List<String> = when (type) {
        AddressBookTypes.POSTAL_HOME -> listOf("home")
        AddressBookTypes.POSTAL_WORK -> listOf("work")
        AddressBookTypes.POSTAL_OTHER -> listOf("other")
        else -> emptyList()
    }

    private fun hasContent(postal: AddressBookPostal): Boolean =
        listOf(postal.street, postal.city, postal.region, postal.postalCode, postal.country).any { it.isNotBlank() }

    private fun address(postal: AddressBookPostal) = VCardAddress(
        street = postal.street,
        locality = postal.city,
        region = postal.region,
        postalCode = postal.postalCode,
        country = postal.country,
        types = postalTypes(postal.type),
    )

    /** `AAAA-MM-JJ`, ou `--MM-JJ` sans année, comme `birthdayString` d'iOS ; une date illisible ne part pas ; chiffres latins quelle que soit la langue de l'appareil. */
    private fun birthdayString(raw: String): String? {
        val parts = VCard(birthday = raw).birthdayComponents ?: return null
        val monthDay = String.format(Locale.ROOT, "%02d-%02d", parts.month, parts.day)
        return parts.year?.let { String.format(Locale.ROOT, "%04d-%s", it, monthDay) } ?: "--$monthDay"
    }

    private fun nonEmpty(value: String?): String? = value?.trim()?.takeIf { it.isNotEmpty() }
}
