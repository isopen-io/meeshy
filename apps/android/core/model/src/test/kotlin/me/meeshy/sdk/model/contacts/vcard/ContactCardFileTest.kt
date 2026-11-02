package me.meeshy.sdk.model.contacts.vcard

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ContactCardFileTest {

    @Test
    fun `nomme le fichier par le contact`() {
        assertThat(ContactCardFile.fileName("Zoé Dupont")).isEqualTo("Zoé Dupont.vcf")
    }

    @Test
    fun `retire les caracteres interdits`() {
        assertThat(ContactCardFile.fileName("a/b\\c:d?e%f*g|h\"i<j>k")).isEqualTo("a b c d e f g h i j k.vcf")
        assertThat(ContactCardFile.fileName("  Zoé\n")).isEqualTo("Zoé.vcf")
    }

    @Test
    fun `limite a 60 caracteres`() {
        assertThat(ContactCardFile.fileName("x".repeat(80))).isEqualTo("x".repeat(60) + ".vcf")
    }

    @Test
    fun `retombe sur contact quand il ne reste rien`() {
        assertThat(ContactCardFile.fileName("")).isEqualTo("contact.vcf")
        assertThat(ContactCardFile.fileName("///")).isEqualTo("contact.vcf")
    }

    @Test
    fun `detecte une carte par type mime`() {
        assertThat(ContactCardFile.isContactCard("text/vcard", "x")).isTrue()
        assertThat(ContactCardFile.isContactCard("text/x-vcard; charset=utf-8", "x")).isTrue()
        assertThat(ContactCardFile.isContactCard("TEXT/VCARD", "x")).isTrue()
    }

    @Test
    fun `detecte une carte par extension sur un type generique`() {
        assertThat(ContactCardFile.isContactCard("application/octet-stream", "Zoé.VCF")).isTrue()
        assertThat(ContactCardFile.isContactCard("", "z.vcard")).isTrue()
        assertThat(ContactCardFile.isContactCard("application/pdf", "z.vcf")).isFalse()
        assertThat(ContactCardFile.isContactCard("text/plain", "z.txt")).isFalse()
    }

    @Test
    fun `lit le nom humain en retirant extension et prefixe technique`() {
        assertThat(ContactCardFile.displayName("Zoé.vcf")).isEqualTo("Zoé")
        assertThat(ContactCardFile.displayName("contact_123e4567-e89b-12d3-a456-426614174000_Zoé.vcf")).isEqualTo("Zoé")
        assertThat(ContactCardFile.displayName(".vcf")).isNull()
    }

    @Test
    fun `l etiquette de media dit le contact ou le repli`() {
        assertThat(ContactCardFile.mediaLabel("text/vcard", "Zoé.vcf")).isEqualTo("👤 Zoé")
        assertThat(ContactCardFile.mediaLabel("text/vcard", ".vcf")).isEqualTo("👤 Contact partagé")
        assertThat(ContactCardFile.mediaLabel("image/png", "a.png")).isNull()
    }
}
