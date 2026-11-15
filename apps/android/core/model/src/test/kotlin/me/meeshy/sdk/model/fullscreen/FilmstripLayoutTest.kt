package me.meeshy.sdk.model.fullscreen

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class FilmstripLayoutTest {
    @Test fun `hauteur reservee = 80`() {
        assertThat(FilmstripLayout.RESERVED_HEIGHT_DP).isEqualTo(80f)
    }

    @Test fun `la marge de tete laisse la tete de lecture a droite`() {
        assertThat(FilmstripLayout.leadingInset(400f)).isEqualTo(400f - 54f - 12f)
        assertThat(FilmstripLayout.leadingInset(10f)).isEqualTo(0f)
    }

    @Test fun `l index sous la tete suit le pas et reste borne`() {
        assertThat(FilmstripLayout.indexAtPlayhead(FilmstripLayout.scrollOffset(3), 5)).isEqualTo(3)
        assertThat(FilmstripLayout.indexAtPlayhead(9999f, 5)).isEqualTo(4)
        assertThat(FilmstripLayout.indexAtPlayhead(-50f, 5)).isEqualTo(0)
        assertThat(FilmstripLayout.indexAtPlayhead(10f, 0)).isEqualTo(0)
    }

    @Test fun `la largeur du contenu compte les espaces`() {
        assertThat(FilmstripLayout.contentWidth(3)).isEqualTo(3 * 54f + 2 * 6f)
        assertThat(FilmstripLayout.contentWidth(0)).isEqualTo(0f)
    }
}
