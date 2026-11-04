package me.meeshy.sdk.model.game

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class GameQrCodeTest {

    private fun rows(matrix: GameQrMatrix?): List<String> =
        matrix?.modules.orEmpty().map { row -> row.joinToString("") { if (it) "1" else "0" } }

    @Test
    fun `la matrice est celle d'une implementation independante module pour module`() {
        GameQrVectors.all.forEach { reference ->
            val matrix = GameQrCode.encode(reference.text)
            assertThat(matrix?.version).isEqualTo(reference.version)
            assertThat(matrix?.size).isEqualTo(reference.rows.size)
            assertThat(rows(matrix)).isEqualTo(reference.rows)
        }
    }

    @Test
    fun `la plus petite version qui porte le texte en correction M`() {
        assertThat(GameQrCode.encode("x".repeat(14))?.version).isEqualTo(1)
        assertThat(GameQrCode.encode("x".repeat(15))?.version).isEqualTo(2)
        assertThat(GameQrCode.encode("x".repeat(26))?.version).isEqualTo(2)
        assertThat(GameQrCode.encode("x".repeat(27))?.version).isEqualTo(3)
        assertThat(GameQrCode.encode("x".repeat(27))?.size).isEqualTo(29)
    }

    @Test
    fun `les octets UTF-8 comptent, pas les caracteres`() {
        assertThat(GameQrCode.encode("é".repeat(7))?.version).isEqualTo(1)
        assertThat(GameQrCode.encode("é".repeat(8))?.version).isEqualTo(2)
    }

    @Test
    fun `un plafond de version rend null plutot qu'une matrice illisible`() {
        val text = "x".repeat(27)
        assertThat(GameQrCode.encode(text, maxVersion = 3)?.version).isEqualTo(3)
        assertThat(GameQrCode.encode(text, maxVersion = 2)).isNull()
        assertThat(GameQrCode.encode(text, maxVersion = 0)).isNull()
        assertThat(GameQrCode.encode(text, maxVersion = -3)).isNull()
        assertThat(GameQrCode.encode("x".repeat(3000))).isNull()
    }

    @Test
    fun `un carre de size rangees de size modules et un masque entre 0 et 7`() {
        val matrix = GameQrCode.encode("https://meeshy.me/r/Ab3dE9")!!
        assertThat(matrix.modules).hasSize(25)
        assertThat(matrix.modules.all { it.size == 25 }).isTrue()
        assertThat(matrix.mask).isIn(0..7)
    }

    @Test
    fun `le meme texte rend la meme matrice`() {
        assertThat(GameQrCode.encode("https://meeshy.me/r/Ab3dE9")).isEqualTo(GameQrCode.encode("https://meeshy.me/r/Ab3dE9"))
    }
}
