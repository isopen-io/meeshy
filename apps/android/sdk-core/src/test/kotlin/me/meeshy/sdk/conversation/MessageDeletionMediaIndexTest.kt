package me.meeshy.sdk.conversation

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.mediahub.ConversationMediaHubIndex
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.mediahub.ConversationMediaKind
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** Un message supprimé par le serveur quitte l'index des médias de TOUS les genres. */
@RunWith(RobolectricTestRunner::class)
class MessageDeletionMediaIndexTest {

    private val doc = ApiMessage(
        id = "m1",
        conversationId = "c1",
        senderId = "u1",
        content = "",
        createdAt = "2026-06-01T10:00:00Z",
        attachments = listOf(ApiMessageAttachment(id = "d", mimeType = "application/pdf", fileUrl = "https://cdn/d.pdf")),
    )

    @Test
    fun `la suppression annoncee retire le message de l onglet Documents`() = runHarnessTest { harness ->
        harness.seedSynced(doc)
        val index = ConversationMediaHubIndex(null)
        index.merge("c1", ConversationMediaKind.DOCUMENT, listOf(doc), complete = true, ticket = null)

        MessageTombstoneWriter(harness.updater, null, null, index).markDeleted("m1", "2026-06-01T11:00:00Z")

        assertThat(index.read("c1", ConversationMediaKind.DOCUMENT)!!.carriers).isEmpty()
    }
}
