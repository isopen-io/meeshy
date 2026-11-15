package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ComposerFieldAfterSendTest {

    @Test fun `l'hote a vide la source le champ se vide`() {
        assertThat(ComposerFieldAfterSend.resolve("Bonjour", "", ComposerFieldAfterSend.Sender.HOST)).isEmpty()
    }

    @Test fun `l'hote a refuse le champ garde ce qu'il portait`() {
        assertThat(ComposerFieldAfterSend.resolve("Bonjour", "Bonjour", ComposerFieldAfterSend.Sender.HOST)).isEqualTo("Bonjour")
    }

    @Test fun `sans source d'hote le champ local fait foi`() {
        assertThat(ComposerFieldAfterSend.resolve("Bonjour", null, ComposerFieldAfterSend.Sender.HOST)).isEqualTo("Bonjour")
    }

    @Test fun `la barre a envoye la source de l'hote ne ressuscite rien`() {
        assertThat(ComposerFieldAfterSend.resolve("", "ancien", ComposerFieldAfterSend.Sender.COMPOSER)).isEmpty()
        assertThat(ComposerFieldAfterSend.resolve("garde", "", ComposerFieldAfterSend.Sender.COMPOSER)).isEqualTo("garde")
    }

    @Test fun `le sender se lit de la presence d'un envoi d'hote`() {
        assertThat(ComposerFieldAfterSend.Sender.of(hasCustomSend = true)).isEqualTo(ComposerFieldAfterSend.Sender.HOST)
        assertThat(ComposerFieldAfterSend.Sender.of(hasCustomSend = false)).isEqualTo(ComposerFieldAfterSend.Sender.COMPOSER)
    }

    @Test fun `l'alignement n'efface que si l'hote a vide et que le local porte du texte`() {
        assertThat(ComposerSendAlignment.shouldClearLocalText("", "Bonjour")).isTrue()
        assertThat(ComposerSendAlignment.shouldClearLocalText("Bonjour", "Bonjour")).isFalse()
        assertThat(ComposerSendAlignment.shouldClearLocalText(null, "Bonjour")).isFalse()
        assertThat(ComposerSendAlignment.shouldClearLocalText("", "")).isFalse()
    }
}
