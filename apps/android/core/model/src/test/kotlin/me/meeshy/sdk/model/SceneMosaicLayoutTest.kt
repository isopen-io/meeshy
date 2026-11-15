package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class SceneMosaicLayoutTest {

    @Test
    fun `la page courante d'une carte elue qui bouge joue`() {
        assertThat(SceneMosaicLayout.plays(elected = true, page = 1, currentPage = 1, moves = true)).isTrue()
    }

    @Test
    fun `une scene fixe ne joue jamais, meme elue et courante`() {
        assertThat(SceneMosaicLayout.plays(elected = true, page = 0, currentPage = 0, moves = false)).isFalse()
    }

    @Test
    fun `une page qui n'est pas la courante ne joue pas`() {
        assertThat(SceneMosaicLayout.plays(elected = true, page = 2, currentPage = 1, moves = true)).isFalse()
    }

    @Test
    fun `une carte non elue ne joue pas`() {
        assertThat(SceneMosaicLayout.plays(elected = false, page = 0, currentPage = 0, moves = true)).isFalse()
    }

    @Test
    fun `le signe du son coupe suit la page lue, qu'elle bouge ou non`() {
        assertThat(SceneMosaicLayout.isReadPage(elected = true, page = 0, currentPage = 0)).isTrue()
        assertThat(SceneMosaicLayout.isReadPage(elected = false, page = 0, currentPage = 0)).isFalse()
    }

    @Test
    fun `les tuiles d'une mosaique sont des scenes arretees`() {
        assertThat(SceneMosaicLayout.tilePlays()).isFalse()
    }

    @Test
    fun `le compteur dit n sur N et se tait pour une scene seule`() {
        assertThat(SceneMosaicLayout.counterLabel(currentPage = 1, count = 5)).isEqualTo("2 / 5")
        assertThat(SceneMosaicLayout.counterLabel(currentPage = 0, count = 1)).isNull()
        assertThat(SceneMosaicLayout.counterLabel(currentPage = 9, count = 3)).isEqualTo("3 / 3")
    }

    @Test
    fun `aucune fleche precedente sur la premiere page, aucune suivante sur la derniere`() {
        assertThat(SceneMosaicLayout.hasPrevious(0)).isFalse()
        assertThat(SceneMosaicLayout.hasPrevious(1)).isTrue()
        assertThat(SceneMosaicLayout.hasNext(currentPage = 2, count = 3)).isFalse()
        assertThat(SceneMosaicLayout.hasNext(currentPage = 1, count = 3)).isTrue()
    }
}
