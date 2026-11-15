package me.meeshy.sdk.model.contacts.vcard

import com.google.common.truth.Truth.assertThat
import java.util.Locale
import org.junit.Test

class ContactCardFieldTest {

    private val card = VCard(
        formattedName = "Zoé",
        phones = listOf(VCardEntry("1", listOf("cell")), VCardEntry("2", label = "Perso")),
        emails = listOf(VCardEntry("z@e.com")),
        addresses = listOf(VCardAddress(street = "1 rue", types = listOf("home"))),
        organization = "Acme",
        title = "CTO",
        urls = listOf(VCardEntry("https://z.e", listOf("work"))),
        birthday = "--05-12",
        note = "ok",
    )

    @Test
    fun `liste les champs dans l ordre du carnet`() {
        val fields = ContactCardField.fields(card, Locale.FRANCE)
        assertThat(fields.map { it.id }).containsExactly(
            "phone-0", "phone-1", "email-0", "address-0", "organization", "title", "url-0", "birthday", "note",
        ).inOrder()
        assertThat(fields.map { it.kind.iconName }.first()).isEqualTo("phone")
    }

    @Test
    fun `compose les libelles connus libres et de repli`() {
        val fields = ContactCardField.fields(card, Locale.FRANCE)
        assertThat(fields[0].label).isEqualTo(ContactCardLabel.Known("mobile"))
        assertThat(fields[1].label).isEqualTo(ContactCardLabel.Custom("Perso"))
        assertThat(fields[2].label).isEqualTo(ContactCardLabel.OfKind(ContactCardField.Kind.EMAIL))
        assertThat(fields[3].label).isEqualTo(ContactCardLabel.Known("home"))
        assertThat(fields[6].label).isEqualTo(ContactCardLabel.Known("work"))
        assertThat(fields[0].labelText({ "Mobile" }, { "?" })).isEqualTo("Mobile")
        assertThat(fields[2].labelText({ "?" }, { "E-mail" })).isEqualTo("E-mail")
    }

    @Test
    fun `anniversaire sans annee ecrit jour et mois`() {
        assertThat(ContactCardField.formatBirthday(BirthdayComponents(null, 5, 12), Locale.FRANCE)).isEqualTo("12 mai")
        assertThat(ContactCardField.formatBirthday(BirthdayComponents(null, 2, 29), Locale.FRANCE)).isEqualTo("29 février")
    }

    @Test
    fun `anniversaire avec annee l ajoute`() {
        assertThat(ContactCardField.formatBirthday(BirthdayComponents(1990, 5, 12), Locale.FRANCE)).isEqualTo("12 mai 1990")
    }

    @Test
    fun `une date impossible garde la valeur brute dans la fiche`() {
        val odd = VCard(formattedName = "Z", birthday = "1990-02-31")
        assertThat(ContactCardField.fields(odd).single { it.id == "birthday" }.value).isEqualTo("1990-02-31")
    }
}
