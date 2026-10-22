package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class MyStoriesTabResolverTest {

    private fun initial(published: Boolean = false, queue: Boolean = false, drafts: Boolean = false) =
        MyStoriesTabResolver.initialTab(published, queue, drafts)

    @Test
    fun `une story active ouvre Publiees meme avec du travail en attente`() {
        assertThat(initial(published = true, queue = true, drafts = true)).isEqualTo(MyStoriesTab.PUBLISHED)
    }

    @Test
    fun `sans story active le travail reseau ouvre File`() {
        assertThat(initial(queue = true, drafts = true)).isEqualTo(MyStoriesTab.QUEUE)
    }

    @Test
    fun `sans travail reseau un brouillon ouvre Brouillons`() {
        assertThat(initial(drafts = true)).isEqualTo(MyStoriesTab.DRAFTS)
    }

    @Test
    fun `rien du tout ouvre Publiees et Archive n'est jamais un atterrissage`() {
        assertThat(initial()).isEqualTo(MyStoriesTab.PUBLISHED)
    }

    @Test
    fun `Publiees et Brouillons sont toujours visibles`() {
        assertThat(MyStoriesTabResolver.visibleTabs(hasQueueWork = false, hasArchivedStories = false))
            .containsExactly(MyStoriesTab.PUBLISHED, MyStoriesTab.DRAFTS).inOrder()
    }

    @Test
    fun `File et Archive apparaissent seulement avec de la matiere et dans l'ordre`() {
        assertThat(MyStoriesTabResolver.visibleTabs(hasQueueWork = true, hasArchivedStories = true))
            .containsExactly(
                MyStoriesTab.PUBLISHED, MyStoriesTab.QUEUE, MyStoriesTab.DRAFTS, MyStoriesTab.ARCHIVE,
            ).inOrder()
        assertThat(MyStoriesTabResolver.visibleTabs(hasQueueWork = false, hasArchivedStories = true))
            .containsExactly(MyStoriesTab.PUBLISHED, MyStoriesTab.DRAFTS, MyStoriesTab.ARCHIVE).inOrder()
    }

    @Test
    fun `un onglet qui perd sa matiere replie sur Publiees`() {
        val visible = MyStoriesTabResolver.visibleTabs(hasQueueWork = false, hasArchivedStories = false)
        assertThat(MyStoriesTabResolver.tabAfterContentChange(MyStoriesTab.ARCHIVE, visible))
            .isEqualTo(MyStoriesTab.PUBLISHED)
        assertThat(MyStoriesTabResolver.tabAfterContentChange(MyStoriesTab.QUEUE, visible))
            .isEqualTo(MyStoriesTab.PUBLISHED)
        assertThat(MyStoriesTabResolver.tabAfterContentChange(MyStoriesTab.DRAFTS, visible))
            .isEqualTo(MyStoriesTab.DRAFTS)
    }

    @Test
    fun `l'etat vide suit la matiere propre a chaque onglet`() {
        fun empty(tab: MyStoriesTab, p: Boolean = false, d: Boolean = false, u: Boolean = false, f: Boolean = false, a: Boolean = false) =
            MyStoriesTabResolver.shouldShowEmptyState(tab, p, d, u, f, a)
        assertThat(empty(MyStoriesTab.PUBLISHED)).isTrue()
        assertThat(empty(MyStoriesTab.PUBLISHED, p = true)).isFalse()
        assertThat(empty(MyStoriesTab.QUEUE, f = true)).isFalse()
        assertThat(empty(MyStoriesTab.QUEUE, u = true)).isFalse()
        assertThat(empty(MyStoriesTab.QUEUE)).isTrue()
        assertThat(empty(MyStoriesTab.DRAFTS, d = true)).isFalse()
        assertThat(empty(MyStoriesTab.ARCHIVE)).isTrue()
        assertThat(empty(MyStoriesTab.ARCHIVE, a = true)).isFalse()
    }
}
