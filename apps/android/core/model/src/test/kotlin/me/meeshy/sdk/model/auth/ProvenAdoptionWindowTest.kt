package me.meeshy.sdk.model.auth

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ProvenAdoptionWindowTest {

    private val session = ProvenAdoptionKind.SESSION
    private val secondFactor = ProvenAdoptionKind.SECOND_FACTOR

    @Test
    fun `le delai servi est suivi moins la marge de 60 secondes`() {
        assertThat(ProvenAdoptionWindow.clientWindowMs(session, 300)).isEqualTo(240_000L)
    }

    @Test
    fun `la fenetre est bornee a 30 minutes`() {
        assertThat(ProvenAdoptionWindow.clientWindowMs(session, 86_400)).isEqualTo(30 * 60_000L)
    }

    @Test
    fun `un delai inferieur a la marge ou nul ferme la fenetre`() {
        assertThat(ProvenAdoptionWindow.clientWindowMs(session, 30)).isEqualTo(0L)
        assertThat(ProvenAdoptionWindow.clientWindowMs(secondFactor, 0)).isEqualTo(0L)
    }

    @Test
    fun `un delai absent ou illisible vaut le repli propre a chaque nature`() {
        assertThat(ProvenAdoptionWindow.clientWindowMs(session, null)).isEqualTo(9 * 60_000L)
        assertThat(ProvenAdoptionWindow.clientWindowMs(secondFactor, null)).isEqualTo(4 * 60_000L)
        assertThat(ProvenAdoptionWindow.clientWindowMs(session, -1)).isEqualTo(9 * 60_000L)
        assertThat(ProvenAdoptionWindow.clientWindowMs(secondFactor, ProvenAdoptionWindow.MAX_READABLE_SECONDS + 1))
            .isEqualTo(4 * 60_000L)
    }

    @Test
    fun `le plus grand delai lisible reste borne sans deborder`() {
        assertThat(ProvenAdoptionWindow.clientWindowMs(session, ProvenAdoptionWindow.MAX_READABLE_SECONDS))
            .isEqualTo(ProvenAdoptionWindow.CLIENT_MAX_MS)
    }

    @Test
    fun `la fenetre expire apres sa duree et jamais avant`() {
        assertThat(ProvenAdoptionWindow.hasLapsed(1_000, 60_000, 61_000)).isFalse()
        assertThat(ProvenAdoptionWindow.hasLapsed(1_000, 60_000, 61_001)).isTrue()
    }

    @Test
    fun `une fenetre nulle ou une horloge revenue en arriere est fermee`() {
        assertThat(ProvenAdoptionWindow.hasLapsed(1_000, 0, 1_000)).isTrue()
        assertThat(ProvenAdoptionWindow.hasLapsed(5_000, 60_000, 4_000)).isTrue()
    }
}
