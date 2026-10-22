package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ShareLinkDetailEditStateTest {

    private val origin = "https://meeshy.me"
    private val now = 1_000L

    private fun link(name: String? = "Launch", maxUses: Int? = 5, isActive: Boolean = true) =
        MyShareLink(id = "i", linkId = "mshy_1", identifier = "party", name = name, maxUses = maxUses, isActive = isActive)

    private fun opened() = ShareLinkDetailState().fromRow(link(), origin, now)

    @Test
    fun `la fiche est peinte depuis la ligne de liste sans reseau`() {
        val state = opened()
        assertThat(state.phase).isEqualTo(ShareLinkDetailPhase.Loaded)
        assertThat(state.showColdSpinner).isFalse()
        assertThat(state.draft.name).isEqualTo("Launch")
        assertThat(state.presentation?.address).isEqualTo("https://meeshy.me/chat/mshy_1")
        assertThat(state.presentation?.displayAddress).isEqualTo("meeshy.me/chat/mshy_1")
    }

    @Test
    fun `enregistrer n est propose que pour un brouillon modifie et valide`() {
        assertThat(opened().canSave).isFalse()
        assertThat(opened().withDraft(opened().draft.copy(name = "New")).canSave).isTrue()
        assertThat(opened().withDraft(opened().draft.copy(maxUses = 0)).canSave).isFalse()
    }

    @Test
    fun `l enregistrement applique le brouillon avant le reseau`() {
        val editing = opened().let { it.withDraft(it.draft.copy(name = "New")) }.saving(origin, now)
        assertThat(editing.isSaving).isTrue()
        assertThat(editing.link?.name).isEqualTo("New")
        assertThat(editing.presentation?.displayName).isEqualTo("New")
        assertThat(editing.canSave).isFalse()
    }

    @Test
    fun `un echec restaure le lien et garde le brouillon`() {
        val before = opened()
        val draft = before.draft.copy(name = "New")
        val failed = before.withDraft(draft).saving(origin, now).saveFailed(before.link!!, origin, now)
        assertThat(failed.link?.name).isEqualTo("Launch")
        assertThat(failed.draft).isEqualTo(draft)
        assertThat(failed.isSaving).isFalse()
        assertThat(failed.feedback).isEqualTo(ShareLinkDetailFeedback.SaveFailed)
        assertThat(failed.canSave).isTrue()
    }

    @Test
    fun `un succes acquitte puis efface le retour`() {
        val saved = opened().let { it.withDraft(it.draft.copy(name = "New")) }.saving(origin, now).saved()
        assertThat(saved.feedback).isEqualTo(ShareLinkDetailFeedback.Saved)
        assertThat(saved.hasChanges).isFalse()
        assertThat(saved.feedbackShown().feedback).isNull()
    }

    @Test
    fun `le corps du patch ne porte que ce qui change`() {
        val state = opened().let { it.withDraft(it.draft.withMaxUsesInput("")) }
        assertThat(state.patch()!!.keys).containsExactly("maxUses")
    }

    @Test
    fun `annuler une activation garde le brouillon en cours`() {
        val editing = opened().let { it.withDraft(it.draft.copy(name = "New")) }
        val rolled = editing.toggled().toggleFailed(editing.link!!, origin, now)
        assertThat(rolled.link?.isActive).isTrue()
        assertThat(rolled.draft.name).isEqualTo("New")
    }

    @Test
    fun `la liste gardee sur echec affiche un bandeau`() {
        val state = MyShareLinksState().loaded(listOf(link()), null).failed("offline")
        assertThat(state.showFailureBanner).isTrue()
        assertThat(state.links).hasSize(1)
        assertThat(MyShareLinksState().failed("x").showFailureBanner).isFalse()
    }
}
