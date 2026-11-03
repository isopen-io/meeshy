package me.meeshy.sdk.model.mediacache

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class MediaTransferProfileTest {
    private val immediate = MediaTransferProfile.STANDARD
    private val deferredUnmetered = MediaTransferProfile.prefetch(meteredAllowed = false)
    private val deferredMetered = MediaTransferProfile.prefetch(meteredAllowed = true)

    @Test
    fun `un prechargement differe interdit de reseau facture ne couvre pas une lecture`() {
        assertThat(deferredUnmetered.covers(immediate)).isFalse()
        assertThat(deferredUnmetered.covers(deferredMetered)).isFalse()
    }

    @Test
    fun `un profil immediat couvre un prechargement`() {
        assertThat(immediate.covers(deferredUnmetered)).isTrue()
        assertThat(immediate.covers(immediate)).isTrue()
    }

    @Test
    fun `la fusion donne le plus petit profil qui couvre les deux`() {
        val merged = deferredUnmetered.merged(immediate)
        assertThat(merged).isEqualTo(immediate)
        assertThat(deferredUnmetered.merged(deferredMetered)).isEqualTo(deferredMetered)
        assertThat(merged.covers(deferredUnmetered)).isTrue()
    }

    @Test
    fun `seul un prechargement est differable`() {
        assertThat(deferredUnmetered.isDeferrable).isTrue()
        assertThat(immediate.isDeferrable).isFalse()
    }
}
