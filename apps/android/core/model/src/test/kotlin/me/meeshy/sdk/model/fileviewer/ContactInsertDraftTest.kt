package me.meeshy.sdk.model.fileviewer

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.contacts.vcard.VCard
import me.meeshy.sdk.model.contacts.vcard.VCardAddress
import me.meeshy.sdk.model.contacts.vcard.VCardEntry
import org.junit.Test

class ContactInsertDraftTest {

    private val card = VCard(
        formattedName = "Zoé Dupont",
        phones = listOf(VCardEntry("+33 6 12 34 56 78", listOf("cell")), VCardEntry("+33 1 00 00 00 00", listOf("work"))),
        emails = listOf(VCardEntry("zoe@example.com", listOf("home"))),
        addresses = listOf(VCardAddress(street = "1 rue X", locality = "Paris", postalCode = "75001")),
        organization = "Meeshy", title = "CEO", note = "Une note",
    )

    @Test
    fun `reprend le nom les deux premiers numeros et le premier e-mail`() {
        val draft = ContactInsertDraft.of(card)
        assertThat(draft.name).isEqualTo("Zoé Dupont")
        assertThat(draft.phones).containsExactly("+33 6 12 34 56 78", "+33 1 00 00 00 00").inOrder()
        assertThat(draft.email).isEqualTo("zoe@example.com")
        assertThat(draft.company).isEqualTo("Meeshy")
        assertThat(draft.jobTitle).isEqualTo("CEO")
        assertThat(draft.notes).isEqualTo("Une note")
        assertThat(draft.postal).isEqualTo("1 rue X\n75001 Paris")
    }

    @Test
    fun `une carte vide ne produit aucun champ`() {
        val draft = ContactInsertDraft.of(VCard())
        assertThat(draft.name).isNull()
        assertThat(draft.phones).isEmpty()
        assertThat(draft.email).isNull()
    }
}
