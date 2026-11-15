package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.BubbleSendProgress.Piece
import me.meeshy.sdk.model.media.MediaUploadProgress
import org.junit.Test

class BubbleSendProgressTest {

    private fun uploading(sent: Long, total: Long) = MediaUploadProgress.Uploading(sent, total)

    private val nothingLanded: (String) -> Boolean = { false }

    private fun landedAmong(vararg ids: String): (String) -> Boolean = { it in ids }

    @Test
    fun `deux envois en vol montrent chacun la progression de leur propre piece`() {
        val ledger = mapOf("cmid-a" to uploading(10, 100), "cmid-b" to uploading(90, 100))

        assertThat(BubbleSendProgress.percent(listOf(Piece("cmid-a", 100)), ledger, nothingLanded)).isEqualTo(10)
        assertThat(BubbleSendProgress.percent(listOf(Piece("cmid-b", 100)), ledger, nothingLanded)).isEqualTo(90)
    }

    @Test
    fun `une bulle sans piece en vol ni atterrie ne montre aucune progression`() {
        val ledger = mapOf("cmid-a" to uploading(10, 100))

        assertThat(BubbleSendProgress.percent(listOf(Piece("cmid-z", 100)), ledger, nothingLanded)).isNull()
        assertThat(BubbleSendProgress.percent(emptyList(), ledger, nothingLanded)).isNull()
        assertThat(BubbleSendProgress.percent(listOf(Piece("cmid-a", 100)), emptyMap(), nothingLanded)).isNull()
    }

    @Test
    fun `une taille inconnue ne fabrique pas de pourcentage`() {
        val ledger = mapOf("cmid-a" to uploading(10, 0))

        assertThat(BubbleSendProgress.percent(listOf(Piece("cmid-a", null)), ledger, nothingLanded)).isNull()
    }

    @Test
    fun `le pourcentage est arrondi vers le bas et ne depasse jamais cent`() {
        assertThat(BubbleSendProgress.percent(listOf(Piece("a", 1000)), mapOf("a" to uploading(199, 1000)), nothingLanded)).isEqualTo(19)
        assertThat(BubbleSendProgress.percent(listOf(Piece("a", 1000)), mapOf("a" to uploading(2000, 1000)), nothingLanded)).isEqualTo(100)
        assertThat(BubbleSendProgress.percent(listOf(Piece("a", 100)), mapOf("a" to uploading(29, 100)), nothingLanded)).isEqualTo(29)
    }

    @Test
    fun `une bulle de plusieurs pieces ne repart pas de zero quand la premiere atterrit`() {
        val pieces = listOf(Piece("a", 100), Piece("b", 100), Piece("c", 100))

        val firstAlmostDone = BubbleSendProgress.percent(pieces, mapOf("a" to uploading(99, 100)), nothingLanded)
        val betweenTwoPieces = BubbleSendProgress.percent(pieces, emptyMap(), landedAmong("a"))
        val secondStarting = BubbleSendProgress.percent(pieces, mapOf("b" to uploading(1, 100)), landedAmong("a"))

        assertThat(firstAlmostDone).isEqualTo(33)
        assertThat(betweenTwoPieces).isEqualTo(33)
        assertThat(secondStarting).isEqualTo(33)
        assertThat(BubbleSendProgress.percent(pieces, mapOf("c" to uploading(50, 100)), landedAmong("a", "b"))).isEqualTo(83)
    }

    @Test
    fun `les pieces pesent leurs octets, une petite photo ne vaut pas une longue video`() {
        val pieces = listOf(Piece("photo", 1_000), Piece("video", 99_000))

        assertThat(BubbleSendProgress.percent(pieces, mapOf("video" to uploading(0, 99_000)), landedAmong("photo"))).isEqualTo(1)
    }

    @Test
    fun `sans le poids de chaque piece, chacune compte pour une part egale`() {
        val pieces = listOf(Piece("a", null), Piece("b", 100))

        assertThat(BubbleSendProgress.percent(pieces, mapOf("b" to uploading(50, 100)), landedAmong("a"))).isEqualTo(75)
    }

    @Test
    fun `une piece citee deux fois par la bulle ne pese qu'une fois`() {
        val pieces = listOf(Piece("video", 100), Piece("video", 100), Piece("photo", 100))

        assertThat(BubbleSendProgress.percent(pieces, mapOf("video" to uploading(100, 100)), nothingLanded)).isEqualTo(50)
    }

    @Test
    fun `une piece en echec qui attend sa reprise ne compte pas comme envoyee`() {
        val pieces = listOf(Piece("a", 100), Piece("b", 100))

        assertThat(BubbleSendProgress.percent(pieces, mapOf("a" to MediaUploadProgress.Failed), landedAmong("b"))).isEqualTo(50)
    }

    @Test
    fun `toutes les pieces atterries, la bulle dit cent tant que son message part`() {
        val pieces = listOf(Piece("a", 100), Piece("b", 300))

        assertThat(BubbleSendProgress.percent(pieces, emptyMap(), landedAmong("a", "b"))).isEqualTo(100)
    }
}
