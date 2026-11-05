package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.media.MediaUploadProgress
import org.junit.Test

class BubbleSendProgressTest {

    private fun uploading(sent: Long, total: Long) = MediaUploadProgress.Uploading(sent, total)

    @Test
    fun `deux envois en vol montrent chacun la progression de leur propre piece`() {
        val ledger = mapOf("cmid-a" to uploading(10, 100), "cmid-b" to uploading(90, 100))

        assertThat(BubbleSendProgress.percent(listOf("cmid-a"), ledger)).isEqualTo(10)
        assertThat(BubbleSendProgress.percent(listOf("cmid-b"), ledger)).isEqualTo(90)
    }

    @Test
    fun `une bulle sans piece en vol ne montre aucune progression`() {
        val ledger = mapOf("cmid-a" to uploading(10, 100))

        assertThat(BubbleSendProgress.percent(listOf("cmid-z"), ledger)).isNull()
        assertThat(BubbleSendProgress.percent(emptyList(), ledger)).isNull()
        assertThat(BubbleSendProgress.percent(listOf("cmid-a"), emptyMap())).isNull()
    }

    @Test
    fun `une taille inconnue ne fabrique pas de pourcentage`() {
        val ledger = mapOf("cmid-a" to uploading(10, 0))

        assertThat(BubbleSendProgress.percent(listOf("cmid-a"), ledger)).isNull()
    }

    @Test
    fun `le pourcentage est arrondi vers le bas et ne depasse jamais cent`() {
        assertThat(BubbleSendProgress.percent(listOf("a"), mapOf("a" to uploading(199, 1000)))).isEqualTo(19)
        assertThat(BubbleSendProgress.percent(listOf("a"), mapOf("a" to uploading(2000, 1000)))).isEqualTo(100)
    }

    @Test
    fun `plusieurs pieces en vol d'un meme message se somment octet pour octet`() {
        val ledger = mapOf("a" to uploading(50, 100), "b" to uploading(0, 100))

        assertThat(BubbleSendProgress.percent(listOf("a", "b"), ledger)).isEqualTo(25)
    }

    @Test
    fun `seul l'etat en vol compte, une piece prete ou echouee n'est pas un pourcentage`() {
        val ledger = mapOf("a" to MediaUploadProgress.Ready("srv"), "b" to MediaUploadProgress.Failed)

        assertThat(BubbleSendProgress.percent(listOf("a", "b"), ledger)).isNull()
    }
}
