package me.meeshy.sdk.model.contacts.vcard

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class VCardParserTest {

    private fun card(vararg lines: String): String =
        (listOf("BEGIN:VCARD") + lines + "END:VCARD").joinToString("\r\n")

    @Test
    fun `lit une carte 3_0 avec nom telephone email adresse organisation et poste`() {
        val parsed = VCardParser.parse(
            card(
                "VERSION:3.0", "N:Dupont;Zoé;;;", "FN:Zoé Dupont",
                "TEL;TYPE=CELL,PREF:+33 6 12 34 56 78", "EMAIL;TYPE=INTERNET,WORK:zoe@example.com",
                "ADR;TYPE=HOME:;;1 rue de Paris;Lyon;;69001;France",
                "ORG:Acme;Labo", "TITLE:Ingénieure", "URL:https://zoe.example", "NOTE:Bonjour",
            ),
        )!!
        assertThat(parsed.formattedName).isEqualTo("Zoé Dupont")
        assertThat(parsed.name).isEqualTo(VCardName(family = "Dupont", given = "Zoé"))
        assertThat(parsed.phones.single().types).containsExactly("cell", "pref").inOrder()
        assertThat(parsed.primaryPhone!!.labelKey).isEqualTo("mobile")
        assertThat(parsed.emails.single().types).containsExactly("work")
        assertThat(parsed.addresses.single().formatted).isEqualTo("1 rue de Paris\n69001 Lyon\nFrance")
        assertThat(parsed.organization).isEqualTo("Acme, Labo")
        assertThat(parsed.title).isEqualTo("Ingénieure")
        assertThat(parsed.urls.single().value).isEqualTo("https://zoe.example")
        assertThat(parsed.note).isEqualTo("Bonjour")
    }

    @Test
    fun `lit la version 2_1 avec types nus et quoted-printable en UTF-8`() {
        val parsed = VCardParser.parse(
            card("VERSION:2.1", "FN;ENCODING=QUOTED-PRINTABLE;CHARSET=UTF-8:Zo=C3=A9", "TEL;CELL;PREF:0601"),
        )!!
        assertThat(parsed.formattedName).isEqualTo("Zoé")
        assertThat(parsed.phones.single().types).containsExactly("cell", "pref")
    }

    @Test
    fun `lit la version 4_0 avec URI tel et mailto`() {
        val parsed = VCardParser.parse(
            card("VERSION:4.0", "FN:Zoé", "TEL;VALUE=uri;TYPE=work:tel:+3312345", "EMAIL:mailto:z@e.com"),
        )!!
        assertThat(parsed.phones.single().value).isEqualTo("+3312345")
        assertThat(parsed.phones.single().labelKey).isEqualTo("work")
        assertThat(parsed.emails.single().value).isEqualTo("z@e.com")
    }

    @Test
    fun `deplie les lignes repliees et les coupures douces quoted-printable`() {
        val parsed = VCardParser.parse(
            "BEGIN:VCARD\r\nFN:Zoé\r\nNOTE:une note\r\n  tres longue\r\n" +
                "ADR;ENCODING=QUOTED-PRINTABLE:;;rue =\r\nde Paris;;;;\r\nEND:VCARD",
        )!!
        assertThat(parsed.note).isEqualTo("une note tres longue")
        assertThat(parsed.addresses.single().street).isEqualTo("rue de Paris")
    }

    @Test
    fun `resout les caracteres echappes`() {
        val parsed = VCardParser.parse(card("FN:A\\, B\; C", "NOTE:l1\\nl2\\\\fin"))!!
        assertThat(parsed.formattedName).isEqualTo("A, B; C")
        assertThat(parsed.note).isEqualTo("l1\nl2\\fin")
    }

    @Test
    fun `reconnait les types de telephone et leur priorite`() {
        fun key(type: String) = VCardParser.parse(card("TEL;TYPE=$type:1"))!!.phones.single().labelKey
        assertThat(key("CELL")).isEqualTo("mobile")
        assertThat(key("HOME")).isEqualTo("home")
        assertThat(key("WORK")).isEqualTo("work")
        assertThat(key("MAIN")).isEqualTo("main")
        assertThat(key("IPHONE")).isEqualTo("iphone")
        assertThat(key("FAX")).isEqualTo("fax")
        assertThat(key("PAGER")).isEqualTo("pager")
        assertThat(key("OTHER")).isEqualTo("other")
        assertThat(key("VOICE")).isNull()
        assertThat(key("WORK,FAX")).isEqualTo("fax")
    }

    @Test
    fun `lit les libelles Apple groupes`() {
        val parsed = VCardParser.parse(
            card("item1.TEL:111", "item1.X-ABLabel:_\$!<Mobile>!\$_", "item2.TEL:222", "item2.X-ABLabel:Perso"),
        )!!
        assertThat(parsed.phones.map { it.labelKey }).containsExactly("mobile", "Perso").inOrder()
    }

    @Test
    fun `lit l anniversaire avec et sans annee`() {
        assertThat(VCardParser.parse(card("FN:Z", "BDAY:1990-05-12"))!!.birthdayComponents)
            .isEqualTo(BirthdayComponents(1990, 5, 12))
        assertThat(VCardParser.parse(card("FN:Z", "BDAY:--05-12"))!!.birthdayComponents)
            .isEqualTo(BirthdayComponents(null, 5, 12))
        assertThat(VCardParser.parse(card("FN:Z", "BDAY:19900512T000000Z"))!!.birthdayComponents)
            .isEqualTo(BirthdayComponents(1990, 5, 12))
        assertThat(VCardParser.parse(card("FN:Z", "BDAY:bientot"))!!.birthdayComponents).isNull()
    }

    @Test
    fun `ignore les photos binaires`() {
        val parsed = VCardParser.parse(card("FN:Z", "PHOTO;ENCODING=b;TYPE=JPEG:AAAA", "NOTE:ok"))!!
        assertThat(parsed.note).isEqualTo("ok")
    }

    @Test
    fun `une entree corrompue ou vide rend null`() {
        assertThat(VCardParser.parse("n importe quoi")).isNull()
        assertThat(VCardParser.parse("BEGIN:VCARD\r\nEND:VCARD")).isNull()
        assertThat(VCardParser.parse("")).isNull()
        assertThat(VCardParser.parse(byteArrayOf(0xFF.toByte(), 0x00))).isNull()
    }

    @Test
    fun `des octets non UTF-8 retombent sur latin1`() {
        val bytes = "BEGIN:VCARD\r\nFN:Zoé\r\nEND:VCARD".toByteArray(Charsets.ISO_8859_1)
        assertThat(VCardParser.parse(bytes)!!.formattedName).isEqualTo("Zoé")
    }

    @Test
    fun `le nom affiche retombe sur organisation puis telephone`() {
        assertThat(VCardParser.parse(card("ORG:Acme"))!!.displayName).isEqualTo("Acme")
        assertThat(VCardParser.parse(card("TEL:0601"))!!.displayName).isEqualTo("0601")
    }
}
