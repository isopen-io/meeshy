package me.meeshy.app.navigation

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.share.ShareSubject
import org.junit.Test

class ShareSheetHostStateTest {
    private val link = ShareSubject.Link("https://meeshy.me/u/bob")
    private val text = ShareSubject.Text("bonjour")

    @Test
    fun `poser un contenu ouvre la feuille`() {
        val host = ShareSheetHostState()

        host.present(link)

        assertThat(host.pending.value?.subject).isEqualTo(link)
    }

    @Test
    fun `le meme contenu pose deux fois ne double pas la feuille`() {
        val host = ShareSheetHostState()
        var dismissed = 0
        host.present(link) { dismissed++ }

        host.present(link) { dismissed++ }
        host.dismiss()

        assertThat(dismissed).isEqualTo(1)
        assertThat(host.pending.value).isNull()
    }

    @Test
    fun `un autre contenu remplace le premier et avertit sa porte`() {
        val host = ShareSheetHostState()
        val told = mutableListOf<String>()
        host.present(link) { told += "link" }

        host.present(text) { told += "text" }

        assertThat(host.pending.value?.subject).isEqualTo(text)
        assertThat(told).containsExactly("link")
    }

    @Test
    fun `fermer sans feuille ne fait rien`() {
        val host = ShareSheetHostState()

        host.dismiss()

        assertThat(host.pending.value).isNull()
    }
}
