package me.meeshy.sdk.model.contacts

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class KeypadInputTest {

    @Test
    fun `un numero avec indicatif et separateurs est classe telephone avec ses seuls chiffres`() {
        assertThat(KeypadInput.classify("+33 6 12")).isEqualTo(KeypadQuery.Phone("33612"))
    }

    @Test
    fun `trois chiffres suffisent pour une recherche par telephone`() {
        assertThat(KeypadInput.classify("123")).isEqualTo(KeypadQuery.Phone("123"))
        assertThat(KeypadInput.classify("(1)-2.3")).isEqualTo(KeypadQuery.Phone("123"))
    }

    @Test
    fun `moins de trois chiffres reste a l'etat initial sans requete`() {
        assertThat(KeypadInput.classify("12")).isEqualTo(KeypadQuery.Idle)
        assertThat(KeypadInput.classify("+1 2")).isEqualTo(KeypadQuery.Idle)
        assertThat(KeypadInput.classify("+++")).isEqualTo(KeypadQuery.Idle)
    }

    @Test
    fun `deux caracteres non telephoniques declenchent une recherche par nom`() {
        assertThat(KeypadInput.classify("ab")).isEqualTo(KeypadQuery.Name("ab"))
        assertThat(KeypadInput.classify("  alice ")).isEqualTo(KeypadQuery.Name("alice"))
    }

    @Test
    fun `un seul caractere de nom reste a l'etat initial`() {
        assertThat(KeypadInput.classify("a")).isEqualTo(KeypadQuery.Idle)
    }

    @Test
    fun `un melange chiffres et lettres est un nom`() {
        assertThat(KeypadInput.classify("bob12")).isEqualTo(KeypadQuery.Name("bob12"))
        assertThat(KeypadInput.classify("12#")).isEqualTo(KeypadQuery.Name("12#"))
    }

    @Test
    fun `une saisie vide ou blanche est initiale`() {
        assertThat(KeypadInput.classify("")).isEqualTo(KeypadQuery.Idle)
        assertThat(KeypadInput.classify("   ")).isEqualTo(KeypadQuery.Idle)
    }

    @Test
    fun `append ajoute la touche a la fin`() {
        assertThat(KeypadInput.append("12", "3")).isEqualTo("123")
    }

    @Test
    fun `deleteLast retire le dernier caractere et tolere le vide`() {
        assertThat(KeypadInput.deleteLast("123")).isEqualTo("12")
        assertThat(KeypadInput.deleteLast("")).isEqualTo("")
    }

    @Test
    fun `clear efface tout`() {
        assertThat(KeypadInput.clear()).isEqualTo("")
    }
}
