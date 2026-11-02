package me.meeshy.sdk.model.search

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class FtsQuerySanitizerTest {

    @Test
    fun `une requete vide ou faite de blancs ne produit aucune requete`() {
        assertThat(FtsQuerySanitizer.match("")).isNull()
        assertThat(FtsQuerySanitizer.match("   \t ")).isNull()
    }

    @Test
    fun `chaque mot devient un prefixe replie en minuscules sans accents`() {
        assertThat(FtsQuerySanitizer.match("Café ÉCOLE")).isEqualTo("\"cafe*\" \"ecole*\"")
    }

    @Test
    fun `les guillemets de l'utilisateur sont retires et ne referment jamais une phrase`() {
        assertThat(FtsQuerySanitizer.match("sa\"lut\" \"")).isEqualTo("\"salut*\"")
    }

    @Test
    fun `les operateurs FTS bruts deviennent de simples termes`() {
        assertThat(FtsQuerySanitizer.match("chat OR NOT chien NEAR/2 -x"))
            .isEqualTo("\"chat*\" \"or*\" \"not*\" \"chien*\" \"near/2*\" \"-x*\"")
    }

    @Test
    fun `une requete sans lettre ni chiffre ne produit aucune requete`() {
        assertThat(FtsQuerySanitizer.match("* ( ) ^ :")).isNull()
    }

    @Test
    fun `l'accent est replie de la meme facon que le texte indexe par le repli commun`() {
        assertThat(FtsQuerySanitizer.match("été")).isEqualTo("\"ete*\"")
    }
}
