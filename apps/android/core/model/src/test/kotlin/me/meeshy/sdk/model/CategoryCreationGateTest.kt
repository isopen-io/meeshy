package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CategoryCreationGateTest {

    @Test
    fun `une creation demarre avec le nom nettoye`() {
        assertThat(CategoryCreationGate.begin("  Travail ", isCreating = false)).isEqualTo("Travail")
    }

    @Test
    fun `une creation deja en cours ne repart pas`() {
        assertThat(CategoryCreationGate.begin("Travail", isCreating = true)).isNull()
    }

    @Test
    fun `un nom vide ne cree rien`() {
        assertThat(CategoryCreationGate.begin("   ", isCreating = false)).isNull()
    }
}
