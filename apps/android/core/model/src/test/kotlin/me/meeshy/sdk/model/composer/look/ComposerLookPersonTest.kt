package me.meeshy.sdk.model.composer.look

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** L'auteur des cadres de la retouche (#12734) : le nom d'affichage, sinon le pseudo. */
class ComposerLookPersonTest {

    @Test
    fun `le nom d affichage passe avant le pseudo, rogne`() {
        assertThat(ComposerLookPerson.author("u1", "  Ana Lopez ", "ana")).isEqualTo(ComposerLookPerson("u1", "Ana Lopez", "ana"))
    }

    @Test
    fun `sans nom d affichage, le pseudo ; sans rien, un nom vide et l identite de soi`() {
        assertThat(ComposerLookPerson.author("u1", "   ", "ana").name).isEqualTo("ana")
        assertThat(ComposerLookPerson.author(null, null, null)).isEqualTo(ComposerLookPerson(ComposerLookPerson.SELF_ID, "", null))
    }
}
