package me.meeshy.sdk.model.contacts.vcard

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class VCardWriterTest {

    private fun fullCard() = VCard(
        formattedName = "Zoé Dupont",
        name = VCardName(family = "Dupont", given = "Zoé"),
        phones = listOf(VCardEntry("+33 6 12", listOf("cell", "pref"))),
        emails = listOf(VCardEntry("zoe@example.com", listOf("work"))),
        addresses = listOf(VCardAddress(street = "1 rue, de Paris", locality = "Lyon", postalCode = "69001", country = "France", types = listOf("home"))),
        organization = "Acme; Labo",
        title = "Ingénieure",
        urls = listOf(VCardEntry("https://zoe.example")),
        birthday = "1990-05-12",
        note = "ligne 1\nligne 2",
    )

    @Test
    fun `aller-retour parse write rend la meme carte`() {
        val card = fullCard()
        assertThat(VCardParser.parse(VCardWriter.write(card)!!)).isEqualTo(card)
    }

    @Test
    fun `n ecrit aucune photo et une vCard 3_0 en CRLF`() {
        val out = VCardWriter.write(fullCard())!!
        assertThat(out).startsWith("BEGIN:VCARD\r\nVERSION:3.0\r\n")
        assertThat(out).endsWith("END:VCARD\r\n")
        assertThat(out).doesNotContain("PHOTO")
    }

    @Test
    fun `une fiche vide est refusee`() {
        assertThat(VCardWriter.write(VCard())).isNull()
    }

    @Test
    fun `plie les longues lignes a 75 octets sans couper un caractere`() {
        val note = "é".repeat(100)
        val out = VCardWriter.write(VCard(formattedName = "Z", note = note))!!
        out.split("\r\n").forEach { assertThat(it.toByteArray(Charsets.UTF_8).size).isAtMost(75) }
        assertThat(VCardParser.parse(out)!!.note).isEqualTo(note)
    }
}
