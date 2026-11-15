package me.meeshy.sdk.model.game

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class GameMintTest {

    @Test
    fun `le prix aux bornes 1 10 11 et 100`() {
        assertThat(GameMint.price(1)).isEqualTo(1221)
        assertThat(GameMint.price(10)).isEqualTo(1221)
        assertThat(GameMint.price(11)).isEqualTo(1587)
        assertThat(GameMint.price(100)).isEqualTo(12948)
    }

    @Test
    fun `le prix est plafonne a 16556 des la 101e et pour un numero demesure`() {
        assertThat(GameMint.price(101)).isEqualTo(16_556)
        assertThat(GameMint.price(Int.MAX_VALUE)).isEqualTo(16_556)
    }

    @Test
    fun `un numero illisible vaut le premier`() {
        assertThat(GameMint.price(0)).isEqualTo(1221)
        assertThat(GameMint.price(-5)).isEqualTo(1221)
    }

    @Test
    fun `l'edition est or a chaque centieme et prisme a chaque millieme`() {
        assertThat(GameMint.edition(99)).isEqualTo(MeeshEdition.Silver)
        assertThat(GameMint.edition(100)).isEqualTo(MeeshEdition.Gold)
        assertThat(GameMint.edition(200)).isEqualTo(MeeshEdition.Gold)
        assertThat(GameMint.edition(1000)).isEqualTo(MeeshEdition.Prism)
        assertThat(GameMint.edition(2000)).isEqualTo(MeeshEdition.Prism)
        assertThat(GameMint.edition(0)).isEqualTo(MeeshEdition.Silver)
    }

    @Test
    fun `le dessin monte a l'or des la 100e et au prisme des la 1000e`() {
        assertThat(GameMint.displayEdition(99)).isEqualTo(MeeshEdition.Silver)
        assertThat(GameMint.displayEdition(247)).isEqualTo(MeeshEdition.Gold)
        assertThat(GameMint.displayEdition(1001)).isEqualTo(MeeshEdition.Prism)
        assertThat(GameMint.edition(247)).isEqualTo(MeeshEdition.Silver)
    }

    @Test
    fun `le facteur de cout va de 50 a 100 pour cent au niveau 100`() {
        assertThat(GameMint.costFactorPermille(0)).isEqualTo(500)
        assertThat(GameMint.costFactorPermille(50)).isEqualTo(750)
        assertThat(GameMint.costFactorPermille(100)).isEqualTo(1000)
        assertThat(GameMint.costFactorPermille(500)).isEqualTo(1000)
    }

    @Test
    fun `le prix effectif applique le facteur du niveau actuel`() {
        assertThat(GameMint.effectivePrice(1, 1)).isEqualTo(617)
        assertThat(GameMint.effectivePrice(1, 100)).isEqualTo(1221)
    }
}
