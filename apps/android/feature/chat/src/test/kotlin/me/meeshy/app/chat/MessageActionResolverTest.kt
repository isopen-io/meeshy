package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class MessageActionResolverTest {
    private val everything = listOf(
        MessageAction.Reply, MessageAction.OpenLink, MessageAction.CopyLink, MessageAction.Forward,
        MessageAction.Translate, MessageAction.Copy, MessageAction.SaveMedia, MessageAction.Select,
        MessageAction.ExportCard, MessageAction.Pin, MessageAction.Star, MessageAction.Edit,
        MessageAction.DeleteForEveryone, MessageAction.DeleteForMe, MessageAction.Views, MessageAction.Report,
    )

    @Test
    fun `le menu montre au plus six entrees de contenu puis la suppression`() {
        val tiers = MessageActionResolver.split(everything)
        val content = tiers.primary.filterNot { it == MessageAction.DeleteForEveryone }
        assertThat(content).hasSize(6)
        assertThat(tiers.primary.last()).isEqualTo(MessageAction.DeleteForEveryone)
    }

    @Test
    fun `les jumeaux de Plus debordent d abord dans l ordre fixe`() {
        val tiers = MessageActionResolver.split(everything)
        assertThat(tiers.more).containsAtLeast(MessageAction.ExportCard, MessageAction.Copy)
        assertThat(tiers.primary).containsAtLeast(MessageAction.Reply, MessageAction.Select)
        assertThat(tiers.primary).doesNotContain(MessageAction.ExportCard)
    }

    @Test
    fun `un menu court n a rien a deborder`() {
        val tiers = MessageActionResolver.split(listOf(MessageAction.Reply, MessageAction.Copy, MessageAction.DeleteForMe))
        assertThat(tiers.primary).containsExactly(MessageAction.Reply, MessageAction.Copy, MessageAction.DeleteForMe).inOrder()
        assertThat(tiers.more).isEmpty()
    }

    @Test
    fun `rien n est fabrique, une entree absente du jugement reste absente`() {
        val tiers = MessageActionResolver.split(listOf(MessageAction.Reply))
        assertThat(tiers.primary + tiers.more).containsExactly(MessageAction.Reply)
    }

    @Test
    fun `contenu masque, seule la suppression est principale`() {
        val tiers = MessageActionResolver.split(
            listOf(MessageAction.DeleteForMe, MessageAction.Views),
            contentHidden = true,
        )
        assertThat(tiers.primary).containsExactly(MessageAction.DeleteForMe)
        assertThat(tiers.more).containsExactly(MessageAction.Views)
    }

    @Test
    fun `toute entree offerte se retrouve dans un des deux niveaux`() {
        val tiers = MessageActionResolver.split(everything)
        assertThat((tiers.primary + tiers.more).toSet()).isEqualTo(everything.toSet())
        assertThat(tiers.primary.intersect(tiers.more.toSet())).isEmpty()
    }
}
