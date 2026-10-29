package me.meeshy.sdk.model.piece

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class PieceBadgeTest {

    private fun badge(
        isSealed: Boolean = false,
        hasUrl: Boolean = true,
        isOnDevice: Boolean = false,
        transfer: PieceTransfer? = null,
        isReady: Boolean = false,
        sizeBytes: Int? = 2048,
    ) = PieceBadge.of(isSealed, hasUrl, isOnDevice, transfer, isReady, sizeBytes)

    @Test
    fun `un fichier a distance propose de le telecharger avec sa taille`() {
        assertThat(badge()).isEqualTo(PieceBadge.Idle(2048))
    }

    @Test
    fun `un telechargement en cours dit sa progression, indeterminee tant que la taille est inconnue`() {
        assertThat(badge(transfer = PieceTransfer.InProgress(40))).isEqualTo(PieceBadge.Downloading(40))
        assertThat(badge(transfer = PieceTransfer.InProgress(null))).isEqualTo(PieceBadge.Downloading(null))
    }

    @Test
    fun `la progression reste dans zero a cent`() {
        assertThat(badge(transfer = PieceTransfer.InProgress(140))).isEqualTo(PieceBadge.Downloading(100))
        assertThat(badge(transfer = PieceTransfer.InProgress(-3))).isEqualTo(PieceBadge.Downloading(0))
    }

    @Test
    fun `un fichier deja recu cette session est pret`() {
        assertThat(badge(isReady = true)).isEqualTo(PieceBadge.Ready)
    }

    @Test
    fun `un telechargement refuse se dit et se retente`() {
        assertThat(badge(transfer = PieceTransfer.Failed)).isEqualTo(PieceBadge.Failed)
    }

    @Test
    fun `une piece chiffree de bout en bout est scellee quoi que dise le reste`() {
        assertThat(badge(isSealed = true, transfer = PieceTransfer.InProgress(10), isReady = true)).isEqualTo(PieceBadge.Sealed)
        assertThat(badge(isSealed = true, hasUrl = false)).isEqualTo(PieceBadge.Sealed)
    }

    @Test
    fun `sans adresse ou deja sur l'appareil il n'y a pas de badge`() {
        assertThat(badge(hasUrl = false)).isEqualTo(PieceBadge.None)
        assertThat(badge(isOnDevice = true)).isEqualTo(PieceBadge.None)
    }

    @Test
    fun `une taille nulle ou inconnue ne s'affiche pas`() {
        assertThat(badge(sizeBytes = 0)).isEqualTo(PieceBadge.Idle(null))
        assertThat(badge(sizeBytes = null)).isEqualTo(PieceBadge.Idle(null))
    }
}

class PieceBadgeProtectedTest {
    @Test
    fun `une piece retenue n'affiche aucun badge de telechargement, quoi que disent l'adresse et le transfert`() {
        val badge = PieceBadge.of(
            isSealed = false, hasUrl = true, isOnDevice = false, transfer = PieceTransfer.Failed, isReady = false, sizeBytes = 10, isProtected = true,
        )
        org.junit.Assert.assertEquals(PieceBadge.None, badge)
    }
}
