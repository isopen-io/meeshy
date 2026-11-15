package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class KeptReplyDraftTest {

    private val now = "2026-10-29T10:00:00Z"

    @Test
    fun `une reponse gardee sans brouillon devient le brouillon de la conversation, citation armee`() {
        val draft = KeptReplyDraft.keep(null, "c1", "  Je suis en route ", "m42", now)

        assertThat(draft.conversationId).isEqualTo("c1")
        assertThat(draft.text).isEqualTo("Je suis en route")
        assertThat(draft.replyToId).isEqualTo("m42")
        assertThat(draft.updatedAt).isEqualTo(now)
        assertThat(draft.isMeaningful).isTrue()
    }

    @Test
    fun `un brouillon commence n est jamais ecrase, la reponse s ajoute apres lui`() {
        val previous = ConversationDraft("c1", text = "Salut,", replyToId = "m1", selectedLanguage = "fr")

        val draft = KeptReplyDraft.keep(previous, "c1", "Je suis en route", "m42", now)

        assertThat(draft.text).isEqualTo("Salut,\nJe suis en route")
        assertThat(draft.replyToId).isEqualTo("m1")
        assertThat(draft.selectedLanguage).isEqualTo("fr")
    }

    @Test
    fun `la meme reponse gardee deux fois ne se duplique pas`() {
        val once = KeptReplyDraft.keep(null, "c1", "ok", null, now)

        assertThat(KeptReplyDraft.keep(once, "c1", "ok", null, now).text).isEqualTo("ok")
    }

    @Test
    fun `une citation blanche n arme aucune reponse`() {
        assertThat(KeptReplyDraft.keep(null, "c1", "ok", "  ", now).replyToId).isNull()
    }
}
