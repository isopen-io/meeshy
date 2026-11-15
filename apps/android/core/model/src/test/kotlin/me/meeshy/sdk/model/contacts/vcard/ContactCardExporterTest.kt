package me.meeshy.sdk.model.contacts.vcard

import com.google.common.truth.Truth.assertThat
import java.util.Locale
import org.junit.Test

/**
 * La carte qu'Android envoie depuis le composeur (#13703) doit être celle qu'iOS écrit pour la même fiche
 * (`ContactCardExporter.swift` + `VCardWriter.swift`) : mêmes champs, mêmes types, même nom de fichier.
 * Les attendus sont écrits à la main en suivant la logique Swift, ligne par ligne.
 */
class ContactCardExporterTest {

    private fun zoe() = AddressBookContact(
        displayName = "Zoé Dupont",
        givenName = "Zoé",
        familyName = "Dupont",
        phones = listOf(
            AddressBookValue("+33 6 12 34 56 78", AddressBookTypes.PHONE_MOBILE),
            AddressBookValue("01 23", AddressBookTypes.PHONE_FAX_WORK),
            AddressBookValue("555", AddressBookTypes.CUSTOM),
        ),
        emails = listOf(AddressBookValue("zoe@acme.fr", AddressBookTypes.EMAIL_WORK)),
        addresses = listOf(
            AddressBookPostal(
                street = "12, rue de la Paix",
                city = "Paris",
                postalCode = "75002",
                country = "France",
                type = AddressBookTypes.POSTAL_HOME,
            ),
        ),
        organization = " Acme; Labo ",
        jobTitle = "Ingénieure",
        websites = listOf("https://zoe.example"),
        birthday = "1990-05-12",
    )

    @Test
    fun `la fiche complete s ecrit octet pour octet comme la vCard d iOS`() {
        val expected = listOf(
            "BEGIN:VCARD",
            "VERSION:3.0",
            "N:Dupont;Zoé;;;",
            "FN:Zoé Dupont",
            "ORG:Acme\\; Labo",
            "TITLE:Ingénieure",
            "TEL;TYPE=CELL:+33 6 12 34 56 78",
            "TEL;TYPE=FAX:01 23",
            "TEL:555",
            "EMAIL;TYPE=INTERNET,WORK:zoe@acme.fr",
            "ADR;TYPE=HOME:;;12\\, rue de la Paix;Paris;;75002;France",
            "URL:https://zoe.example",
            "BDAY:1990-05-12",
            "END:VCARD",
        ).joinToString("\r\n") + "\r\n"

        val export = ContactCardExporter.export(zoe())!!

        assertThat(export.text).isEqualTo(expected)
        assertThat(String(export.bytes, Charsets.UTF_8)).isEqualTo(expected)
    }

    @Test
    fun `le fichier porte le nom du contact et le type vcard d iOS`() {
        val export = ContactCardExporter.export(zoe())!!

        assertThat(export.fileName).isEqualTo("Zoé Dupont.vcf")
        assertThat(export.displayName).isEqualTo("Zoé Dupont")
        assertThat(ContactCardExporter.MIME_TYPE).isEqualTo("text/vcard")
    }

    @Test
    fun `les types du carnet se traduisent comme les libelles d iOS`() {
        val card = ContactCardExporter.vCard(
            AddressBookContact(
                displayName = "T",
                phones = listOf(
                    AddressBookValue("1", AddressBookTypes.PHONE_HOME),
                    AddressBookValue("2", AddressBookTypes.PHONE_WORK),
                    AddressBookValue("3", AddressBookTypes.PHONE_MAIN),
                    AddressBookValue("4", AddressBookTypes.PHONE_PAGER),
                    AddressBookValue("5", AddressBookTypes.PHONE_OTHER),
                    AddressBookValue("6", AddressBookTypes.PHONE_FAX_HOME),
                    AddressBookValue("7", AddressBookTypes.PHONE_OTHER_FAX),
                    AddressBookValue("8", AddressBookTypes.PHONE_CAR),
                ),
                emails = listOf(
                    AddressBookValue("a@x", AddressBookTypes.EMAIL_HOME),
                    AddressBookValue("b@x", AddressBookTypes.EMAIL_OTHER),
                    AddressBookValue("c@x", AddressBookTypes.EMAIL_MOBILE),
                ),
                addresses = listOf(
                    AddressBookPostal(street = "w", type = AddressBookTypes.POSTAL_WORK),
                    AddressBookPostal(street = "o", type = AddressBookTypes.POSTAL_OTHER),
                ),
            ),
        )

        assertThat(card.phones.map { it.types }).containsExactly(
            listOf("home"), listOf("work"), listOf("main"), listOf("pager"),
            listOf("other"), listOf("fax"), listOf("fax"), emptyList<String>(),
        ).inOrder()
        assertThat(card.emails.map { it.types }).containsExactly(listOf("home"), listOf("other"), emptyList<String>()).inOrder()
        assertThat(card.addresses.map { it.types }).containsExactly(listOf("work"), listOf("other")).inOrder()
    }

    @Test
    fun `un anniversaire sans annee s ecrit comme iOS et une date compacte est normalisee`() {
        fun bday(raw: String) = ContactCardExporter.vCard(AddressBookContact(displayName = "T", birthday = raw)).birthday

        assertThat(bday("--05-12")).isEqualTo("--05-12")
        assertThat(bday("19900512")).isEqualTo("1990-05-12")
        assertThat(bday("1990-05-12T00:00:00.000Z")).isEqualTo("1990-05-12")
        assertThat(bday("le douze mai")).isNull()
    }

    @Test
    fun `l anniversaire s ecrit en chiffres latins sur un appareil en arabe`() {
        val previous = Locale.getDefault()
        Locale.setDefault(Locale.forLanguageTag("ar-EG"))
        try {
            val card = ContactCardExporter.vCard(AddressBookContact(displayName = "T", birthday = "1990-05-12"))
            assertThat(card.birthday).isEqualTo("1990-05-12")
        } finally {
            Locale.setDefault(previous)
        }
    }

    @Test
    fun `une fiche sans nom se nomme par son premier numero comme iOS`() {
        val export = ContactCardExporter.export(
            AddressBookContact(phones = listOf(AddressBookValue("+33 6 00", AddressBookTypes.PHONE_MOBILE))),
        )!!

        assertThat(export.text).contains("\r\nN:;+33 6 00;;;\r\nFN:+33 6 00\r\n")
        assertThat(export.fileName).isEqualTo("+33 6 00.vcf")
    }

    @Test
    fun `une fiche reunie de plusieurs comptes ne repete pas un numero ni un e-mail`() {
        val card = ContactCardExporter.vCard(
            AddressBookContact(
                displayName = "T",
                phones = List(2) { AddressBookValue("+33 6 00", AddressBookTypes.PHONE_MOBILE) },
                emails = List(2) { AddressBookValue("t@x", AddressBookTypes.EMAIL_HOME) },
                websites = listOf("https://t.x", "https://t.x"),
                addresses = List(2) { AddressBookPostal(city = "Lyon", type = AddressBookTypes.POSTAL_HOME) },
            ),
        )

        assertThat(card.phones).hasSize(1)
        assertThat(card.emails).hasSize(1)
        assertThat(card.urls).hasSize(1)
        assertThat(card.addresses).hasSize(1)
    }

    @Test
    fun `une fiche vide ne produit aucune carte`() {
        assertThat(ContactCardExporter.export(AddressBookContact())).isNull()
        assertThat(ContactCardExporter.export(AddressBookContact(displayName = "  ", organization = " "))).isNull()
    }

    @Test
    fun `seuls les champs de la fiche partent ni photo ni note`() {
        val text = ContactCardExporter.export(zoe())!!.text

        assertThat(text).doesNotContain("PHOTO")
        assertThat(text).doesNotContain("NOTE")
    }

    @Test
    fun `les valeurs vides du carnet ne produisent aucune ligne`() {
        val card = ContactCardExporter.vCard(
            AddressBookContact(
                displayName = "T",
                phones = listOf(AddressBookValue("  ", AddressBookTypes.PHONE_MOBILE)),
                emails = listOf(AddressBookValue("", AddressBookTypes.EMAIL_HOME)),
                websites = listOf(" "),
                addresses = listOf(AddressBookPostal(type = AddressBookTypes.POSTAL_HOME)),
            ),
        )

        assertThat(card.phones).isEmpty()
        assertThat(card.emails).isEmpty()
        assertThat(card.urls).isEmpty()
        assertThat(card.addresses).isEmpty()
    }

    @Test
    fun `un nom long se plie a 75 octets et se relit intact`() {
        val longName = "Zoé-Éléonore " + "Dupont-Martin ".repeat(8)
        val export = ContactCardExporter.export(AddressBookContact(displayName = longName.trim()))!!

        export.text.split("\r\n").forEach { assertThat(it.toByteArray(Charsets.UTF_8).size).isAtMost(75) }
        assertThat(VCardParser.parse(export.text)!!.displayName).isEqualTo(longName.trim())
        assertThat(export.fileName).isEqualTo(longName.trim().take(60) + ".vcf")
    }
}
