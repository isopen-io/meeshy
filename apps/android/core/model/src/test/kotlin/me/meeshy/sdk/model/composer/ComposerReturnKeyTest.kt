package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ComposerReturnKeyTest {

    @Test fun `la touche Retour envoie jusqu'a sept mots puis passe a la ligne`() {
        assertThat(ComposerReturnKey.imeSends("un deux trois quatre cinq six sept")).isTrue()
        assertThat(ComposerReturnKey.imeSends("un deux trois quatre cinq six sept huit")).isFalse()
    }

    @Test fun `un texte qui grandit d'un seul saut de ligne final envoie`() {
        assertThat(ComposerReturnKey.submits("Bonjour", "Bonjour\n")).isTrue()
    }

    @Test fun `un collage multi-lignes n'envoie jamais`() {
        assertThat(ComposerReturnKey.submits("Bonjour", "Bonjour\nle monde\n")).isFalse()
    }

    @Test fun `un caractere ordinaire n'envoie pas`() {
        assertThat(ComposerReturnKey.submits("Bonjou", "Bonjour")).isFalse()
    }

    @Test fun `un saut de ligne litteral du clavier materiel n'envoie pas`() {
        assertThat(ComposerReturnKey.submits("Bonjour", "Bonjour\n", literalNewline = true)).isFalse()
    }

    @Test fun `une lettre accentuee decomposee compte pour un seul caractere`() {
        assertThat(ComposerReturnKey.submits("e\u0301", "e\u0301\n")).isTrue()
    }

    @Test fun `Maj ou Alt font de Entree un saut de ligne`() {
        assertThat(ComposerReturnKey.isLiteralNewline(shift = true, alt = false)).isTrue()
        assertThat(ComposerReturnKey.isLiteralNewline(shift = false, alt = true)).isTrue()
        assertThat(ComposerReturnKey.isLiteralNewline(shift = false, alt = false)).isFalse()
    }

    @Test fun `stripped retire le seul saut de ligne final`() {
        assertThat(ComposerReturnKey.stripped("Bonjour\n")).isEqualTo("Bonjour")
        assertThat(ComposerReturnKey.stripped("Bonjour")).isEqualTo("Bonjour")
    }
}
