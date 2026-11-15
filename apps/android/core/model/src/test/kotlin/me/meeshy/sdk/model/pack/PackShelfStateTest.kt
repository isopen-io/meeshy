package me.meeshy.sdk.model.pack

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class PackShelfStateTest {
    private data class FakePack(
        override val slug: String,
        override val installed: Boolean = false,
        override val installCount: Int = 0,
        override val isBundled: Boolean = false,
    ) : InstallablePack<FakePack> {
        override fun withInstall(installed: Boolean, installCount: Int) = copy(installed = installed, installCount = installCount)
    }

    private fun shelf(installed: List<FakePack>? = null, catalogue: List<FakePack>? = null) =
        PackShelfState(installed = installed, catalogue = catalogue)

    @Test
    fun `installer bascule la boutique et l'etagere a l'instant`() {
        val chats = FakePack("chats", installCount = 4)
        val next = shelf(installed = listOf(), catalogue = listOf(chats)).togglingInstall(chats)!!

        assertThat(next.catalogue!!.single().installed).isTrue()
        assertThat(next.catalogue!!.single().installCount).isEqualTo(5)
        assertThat(next.installed!!.map { it.slug }).containsExactly("chats")
        assertThat(next.pending).containsExactly("chats")
    }

    @Test
    fun `une etagere inconnue reste inconnue apres une bascule optimiste`() {
        val chats = FakePack("chats")
        val next = shelf(installed = null, catalogue = listOf(chats)).togglingInstall(chats)!!

        assertThat(next.installed).isNull()
        assertThat(next.served(listOf(FakePack("mee", isBundled = true))).map { it.slug }).containsExactly("mee")
    }

    @Test
    fun `retirer decompte sans passer sous zero`() {
        val chats = FakePack("chats", installed = true, installCount = 0)
        val next = shelf(installed = listOf(chats), catalogue = listOf(chats)).togglingInstall(chats)!!

        assertThat(next.installed).isEmpty()
        assertThat(next.catalogue!!.single().installCount).isEqualTo(0)
    }

    @Test
    fun `un second geste sur un pack en vol est refuse`() {
        val chats = FakePack("chats")
        val first = shelf(catalogue = listOf(chats)).togglingInstall(chats)!!

        assertThat(first.togglingInstall(chats)).isNull()
    }

    @Test
    fun `settled reprend le compte confirme et libere le pack`() {
        val chats = FakePack("chats")
        val begun = shelf(catalogue = listOf(chats)).togglingInstall(chats)!!
        val settled = begun.settled("chats", FakePack("chats", installed = true, installCount = 12))

        assertThat(settled.pending).isEmpty()
        assertThat(settled.catalogue!!.single().installCount).isEqualTo(12)
    }

    @Test
    fun `le retour en arriere ne defait que le pack refuse`() {
        val chats = FakePack("chats")
        val fruits = FakePack("fruits")
        val before = shelf(installed = listOf(), catalogue = listOf(chats, fruits))
        val afterChats = before.togglingInstall(chats)!!
        val afterBoth = afterChats.togglingInstall(fruits)!!

        val rolled = afterBoth.rolledBack("chats", previous = before)

        assertThat(rolled.failed).isTrue()
        assertThat(rolled.pending).containsExactly("fruits")
        assertThat(rolled.catalogue!!.first { it.slug == "chats" }.installed).isFalse()
        assertThat(rolled.catalogue!!.first { it.slug == "fruits" }.installed).isTrue()
        assertThat(rolled.installed!!.map { it.slug }).containsExactly("fruits")
    }

    @Test
    fun `refuser un retrait remet le pack sur l'etagere`() {
        val chats = FakePack("chats", installed = true)
        val before = shelf(installed = listOf(chats), catalogue = listOf(chats))
        val begun = before.togglingInstall(chats)!!

        assertThat(begun.rolledBack("chats", before).installed!!.map { it.slug }).containsExactly("chats")
    }

    @Test
    fun `un nouvel essai efface l'echec precedent`() {
        val chats = FakePack("chats")
        val failed = shelf(catalogue = listOf(chats)).copy(failed = true)

        assertThat(failed.togglingInstall(chats)!!.failed).isFalse()
        assertThat(failed.clearFailure().failed).isFalse()
    }
}
