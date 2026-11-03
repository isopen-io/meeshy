package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class StoryCommentsReducerTest {

    private fun base() = StoryCommentsReducer.rootsPage(
        StoryCommentsState(),
        storyPage(storyComment("r1", replyCount = 1), storyComment("r2"), next = "r2"),
        serverCount = 3,
    )

    private fun withThread(): StoryCommentsState {
        val opened = base().copy(thread = StoryCommentThreadState().toggled("r1"))
        return StoryCommentsReducer.repliesPage(opened, "r1", storyPage(storyComment("p1", parentId = "r1")), firstPage = true)
    }

    @Test
    fun `une page de racines s'ajoute sans doublon et garde le curseur`() {
        val next = StoryCommentsReducer.rootsPage(base(), storyPage(storyComment("r2"), storyComment("r3")))
        assertThat(next.roots.map { it.id }).containsExactly("r1", "r2", "r3").inOrder()
        assertThat(next.count).isEqualTo(3)
        assertThat(next.canLoadMoreRoots).isFalse()
    }

    @Test
    fun `une reponse arrivee dans un fil ouvert le rejoint et monte le compteur du parent`() {
        val next = StoryCommentsReducer.added(withThread(), storyComment("p2", parentId = "r1"), serverCount = 4)
        assertThat(next.repliesOf("r1").map { it.id }).containsExactly("p1", "p2").inOrder()
        assertThat(next.roots.first { it.id == "r1" }.replyCount).isEqualTo(2)
        assertThat(next.count).isEqualTo(4)
    }

    @Test
    fun `une reponse arrivee dans un fil jamais ouvert ne fabrique pas de fil partiel`() {
        val next = StoryCommentsReducer.added(base(), storyComment("p9", parentId = "r2"), serverCount = null)
        assertThat(next.replies).isEmpty()
        assertThat(next.roots.first { it.id == "r2" }.replyCount).isEqualTo(1)
        assertThat(next.count).isEqualTo(4)
    }

    @Test
    fun `un commentaire deja present est ignore`() {
        val state = base()
        assertThat(StoryCommentsReducer.added(state, storyComment("r1"), 9)).isSameInstanceAs(state)
    }

    @Test
    fun `supprimer une racine emporte son fil et ajuste le compteur`() {
        val next = StoryCommentsReducer.removed(withThread(), "r1")
        assertThat(next.roots.map { it.id }).containsExactly("r2")
        assertThat(next.replies).doesNotContainKey("r1")
        assertThat(next.thread.isExpanded("r1")).isFalse()
        assertThat(next.count).isEqualTo(1)
    }

    @Test
    fun `supprimer une reponse decremente le parent`() {
        val next = StoryCommentsReducer.removed(withThread(), "p1")
        assertThat(next.repliesOf("r1")).isEmpty()
        assertThat(next.roots.first { it.id == "r1" }.replyCount).isEqualTo(0)
        assertThat(next.count).isEqualTo(2)
    }

    @Test
    fun `une edition remplace la ligne en place sans perdre le coeur`() {
        val liked = StoryCommentsReducer.beginLike(withThread(), "p1")!!
        val next = StoryCommentsReducer.replaced(liked, storyComment("p1", parentId = "r1", content = "corrige"))
        val row = next.repliesOf("r1").single()
        assertThat(row.content).isEqualTo("corrige")
        assertThat(row.likedByMe).isTrue()
    }

    @Test
    fun `une edition d'un commentaire inconnu est inerte`() {
        val state = base()
        assertThat(StoryCommentsReducer.replaced(state, storyComment("zz"))).isSameInstanceAs(state)
    }

    @Test
    fun `le coeur optimiste change le compte et refuse le double tap`() {
        val liked = StoryCommentsReducer.beginLike(base(), "r2")!!
        assertThat(liked.find("r2")!!.likedByMe).isTrue()
        assertThat(liked.find("r2")!!.likeCount).isEqualTo(1)
        assertThat(StoryCommentsReducer.beginLike(liked, "r2")).isNull()
        assertThat(StoryCommentsReducer.rollbackLike(liked, "r2").find("r2")!!.likeCount).isEqualTo(0)
        assertThat(StoryCommentsReducer.settleLike(liked, "r2").likesInFlight).isEmpty()
    }

    @Test
    fun `l'agregat du socket fait foi pour le compte sans toucher mon coeur`() {
        val next = StoryCommentsReducer.reaction(base(), "r2", absoluteCount = 7, actorId = "autre", myId = "moi", added = true)
        assertThat(next.find("r2")!!.likeCount).isEqualTo(7)
        assertThat(next.find("r2")!!.likedByMe).isFalse()
    }

    @Test
    fun `ma propre reaction retiree par un autre appareil eteint mon coeur`() {
        val liked = StoryCommentsReducer.settleLike(StoryCommentsReducer.beginLike(base(), "r2")!!, "r2")
        val next = StoryCommentsReducer.reaction(liked, "r2", absoluteCount = 0, actorId = "moi", myId = "moi", added = false)
        assertThat(next.find("r2")!!.likedByMe).isFalse()
        assertThat(next.find("r2")!!.likeCount).isEqualTo(0)
    }

    @Test
    fun `une traduction arrivee par socket se resout par le prisme du lecteur`() {
        val next = StoryCommentsReducer.translated(
            base(), "r1", "en", ApiPostTranslationEntry(text = "hello"), StoryPrefs(systemLanguage = "en"),
        )
        val row = next.find("r1")!!
        assertThat(row.content).isEqualTo("hello")
        assertThat(row.isTranslated).isTrue()
        assertThat(row.canShowOriginal).isTrue()
        assertThat(row.displayedText(showOriginal = true)).isEqualTo("texte r1")
    }

    @Test
    fun `une traduction vers une langue hors prisme laisse l'original`() {
        val next = StoryCommentsReducer.translated(
            base(), "r1", "es", ApiPostTranslationEntry(text = "hola"), StoryPrefs(systemLanguage = "en"),
        )
        assertThat(next.find("r1")!!.content).isEqualTo("texte r1")
        assertThat(next.find("r1")!!.isTranslated).isFalse()
    }
}
