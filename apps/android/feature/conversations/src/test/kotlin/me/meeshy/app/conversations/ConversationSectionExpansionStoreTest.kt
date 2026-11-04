package me.meeshy.app.conversations

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.CategoryOption
import org.junit.Test

class ConversationSectionExpansionStoreTest {

    private fun cat(id: String, expanded: Boolean? = null) = CategoryOption(id = id, name = id, isExpanded = expanded)

    @Test
    fun `premiere ouverture deplie epinglees, mes conversations et les categories serveur depliees`() {
        val store = ConversationSectionExpansionStore()

        assertThat(store.effective(listOf(cat("work", true), cat("family", false), cat("misc"))))
            .containsExactly("pinned", "other", "work")
    }

    @Test
    fun `un repli est retenu et fige l'ensemble`() {
        val store = ConversationSectionExpansionStore()
        val categories = listOf(cat("work", true))

        store.set("pinned", expanded = false, categories = categories)

        assertThat(store.effective(categories)).containsExactly("other", "work")
    }

    @Test
    fun `la memoire survit a la recreation du ViewModel parce qu'elle est un singleton qu'on relit`() {
        val store = ConversationSectionExpansionStore()
        store.set("work", expanded = true, categories = emptyList())

        val reread = store.rememberedSections.value

        assertThat(ConversationSectionExpansionStore.effective(reread, emptyList()))
            .containsExactly("pinned", "other", "work")
    }

    @Test
    fun `un dedit fige ne rouvre pas une categorie que le serveur dit repliee ensuite`() {
        val store = ConversationSectionExpansionStore()
        store.set("other", expanded = true, categories = emptyList())

        assertThat(store.effective(listOf(cat("late", false)))).doesNotContain("late")
    }

    @Test
    fun `le dedit recu d'un autre appareil est applique a la memoire figee`() {
        val store = ConversationSectionExpansionStore()
        store.set("other", expanded = true, categories = emptyList())

        store.applyRemote("work", expanded = true)

        assertThat(store.effective(emptyList())).contains("work")
    }

    @Test
    fun `un pli distant sans memoire figee laisse les defauts suivre le serveur`() {
        val store = ConversationSectionExpansionStore()

        store.applyRemote("work", expanded = true)

        assertThat(store.rememberedSections.value).isNull()
    }

    @Test
    fun `remoteChanges ne rend que les categories connues dont le pli a change`() {
        val before = listOf(cat("a", false), cat("b", true), cat("c", null))
        val after = listOf(cat("a", true), cat("b", true), cat("c", true), cat("d", true))

        assertThat(ConversationSectionExpansionStore.remoteChanges(before, after)).containsExactly("a", true)
    }
}
