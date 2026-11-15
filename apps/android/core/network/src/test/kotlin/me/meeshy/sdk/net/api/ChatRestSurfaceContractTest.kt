package me.meeshy.sdk.net.api

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.BulkHideForMeRequest
import me.meeshy.sdk.model.ClearHistoryRequest
import me.meeshy.sdk.model.ContentCaptureRequest
import me.meeshy.sdk.model.InviteConversationMemberRequest
import me.meeshy.sdk.model.NewShareLinkRequest
import me.meeshy.sdk.model.ReceiptWriteRequest
import org.junit.Test

/** Contrat des routes REST du chat, capturé au dernier maillon avant le réseau (verbe, chemin, requête, corps). */
class ChatRestSurfaceContractTest {

    private fun messages(reply: String = """{"success":true,"data":{}}""") =
        RouteProbe(reply).let { it to it.api(MessageChatRestApi::class.java) }

    private fun conversations(reply: String = """{"success":true,"data":{}}""") =
        RouteProbe(reply).let { it to it.api(ConversationChatRestApi::class.java) }

    @Test
    fun `a page carries the Prisme filters and the around mode`() = runTest {
        val (probe, api) = messages("""{"success":true,"data":[],"hasNewer":true}""")

        val page = api.page("c1", around = "m9", limit = 30, includeReplies = true, includeTranslations = true, languages = "fr,en")

        assertThat(probe.call.method).isEqualTo("GET")
        assertThat(probe.call.path).isEqualTo("/api/v1/conversations/c1/messages")
        assertThat(probe.call.query).isEqualTo("limit=30&around=m9&include_replies=true&include_translations=true&languages=fr%2Cen")
        assertThat(page.hasNewer).isTrue()
    }

    @Test
    fun `the translations of a message are read from its address and nested under translations`() = runTest {
        val (probe, api) = messages(
            """{"success":true,"data":{"messageId":"m1","translations":[{"targetLanguage":"fr","translatedContent":"Bonjour"}]}}""",
        )

        val payload = api.translations("m1").data

        assertThat(probe.call.method).isEqualTo("GET")
        assertThat(probe.call.path).isEqualTo("/api/v1/messages/m1/translations")
        assertThat(payload?.usable()).containsExactly("fr" to "Bonjour")
    }

    @Test
    fun `hiding a message for me is a DELETE on its address and restoring it a POST`() = runTest {
        val (probe, api) = messages()

        api.hideForMe("m1")
        assertThat(probe.call.method).isEqualTo("DELETE")
        assertThat(probe.call.path).isEqualTo("/api/v1/messages/m1/delete-for-me")

        api.restoreForMe("m1")
        assertThat(probe.call.method).isEqualTo("POST")
        assertThat(probe.call.path).isEqualTo("/api/v1/messages/m1/restore-for-me")
    }

    @Test
    fun `hiding many sends the ids in the body of a DELETE`() = runTest {
        val (probe, api) = messages()

        api.hideManyForMe(BulkHideForMeRequest(listOf("m1", "m2")))

        assertThat(probe.call.method).isEqualTo("DELETE")
        assertThat(probe.call.path).isEqualTo("/api/v1/messages/bulk/delete-for-me")
        assertThat(probe.call.body).isEqualTo("""{"messageIds":["m1","m2"]}""")
    }

    @Test
    fun `pinned messages and a thread are read from their conversation`() = runTest {
        val (probe, api) = messages("""{"success":true,"data":[]}""")

        api.pinned("c1", limit = 20)
        assertThat(probe.call.path).isEqualTo("/api/v1/conversations/c1/pinned-messages")
        assertThat(probe.call.query).isEqualTo("limit=20")

        val (threadProbe, threadApi) = messages("""{"success":true,"data":{"parent":{"id":"m1","conversationId":"c1"},"replies":[],"totalCount":0}}""")
        threadApi.thread("c1", "m1")
        assertThat(threadProbe.call.path).isEqualTo("/api/v1/conversations/c1/threads/m1")
    }

    @Test
    fun `writing a receipt names its type and bounds nothing else`() = runTest {
        val (probe, api) = conversations("""{"success":true,"data":{"type":"received","markedCount":2,"unreadCount":5}}""")

        val result = api.writeReceipt("c1", ReceiptWriteRequest(ReceiptWriteRequest.RECEIVED))

        assertThat(probe.call.method).isEqualTo("POST")
        assertThat(probe.call.path).isEqualTo("/api/v1/conversations/c1/receipts")
        assertThat(probe.call.body).isEqualTo("""{"type":"received"}""")
        assertThat(result.data?.unreadCount).isEqualTo(5)
    }

    @Test
    fun `reading the receipts summary and the legacy read-statuses`() = runTest {
        val (probe, api) = conversations("""{"success":true,"data":{"detail":"summary","summary":{"m1":{"totalMembers":2,"readCount":1}}}}""")

        val receipts = api.receipts("c1", messageIds = "m1,m2", detail = "summary")
        assertThat(probe.call.path).isEqualTo("/api/v1/conversations/c1/receipts")
        assertThat(probe.call.query).isEqualTo("messageIds=m1%2Cm2&detail=summary")
        assertThat(receipts.data?.summary?.getValue("m1")?.readCount).isEqualTo(1)

        val (legacyProbe, legacy) = conversations("""{"success":true,"data":{"m1":{"totalMembers":2}}}""")
        legacy.readStatuses("c1", "m1")
        assertThat(legacyProbe.call.path).isEqualTo("/api/v1/conversations/c1/read-statuses")
    }

    @Test
    fun `a delivery receipt addresses one message of the conversation`() = runTest {
        val (probe, api) = conversations()

        api.deliveryReceipt("c1", "m1")

        assertThat(probe.call.method).isEqualTo("POST")
        assertThat(probe.call.path).isEqualTo("/api/v1/conversations/c1/messages/m1/delivery-receipt")
    }

    @Test
    fun `clearing the history and restoring the conversation for me`() = runTest {
        val (probe, api) = conversations()

        api.clearHistory("c1", ClearHistoryRequest("2026-01-01T00:00:00.000Z"))
        assertThat(probe.call.path).isEqualTo("/api/v1/conversations/c1/clear-history")
        assertThat(probe.call.body).isEqualTo("""{"beforeDate":"2026-01-01T00:00:00.000Z"}""")

        api.restoreForMe("c1")
        assertThat(probe.call.path).isEqualTo("/api/v1/conversations/c1/restore-for-me")
    }

    @Test
    fun `inviting, creating a link, capturing and unbanning use their own verbs`() = runTest {
        val (probe, api) = conversations("""{"success":true,"data":{"noticedMessageIds":["m1"]}}""")

        api.invite("c1", InviteConversationMemberRequest("u1"))
        assertThat(probe.call.path).isEqualTo("/api/v1/conversations/c1/invite")
        assertThat(probe.call.body).isEqualTo("""{"userId":"u1"}""")

        api.newLink("c1", NewShareLinkRequest(name = "Équipe", maxUses = 5))
        assertThat(probe.call.path).isEqualTo("/api/v1/conversations/c1/new-link")
        assertThat(probe.call.body).isEqualTo("""{"name":"Équipe","maxUses":5}""")

        val captured = api.capture("c1", ContentCaptureRequest(listOf("m1"), "screenshot"))
        assertThat(probe.call.path).isEqualTo("/api/v1/conversations/c1/messages/capture")
        assertThat(captured.data?.noticedMessageIds).containsExactly("m1")

        api.unban("c1", "u1")
        assertThat(probe.call.method).isEqualTo("PATCH")
        assertThat(probe.call.path).isEqualTo("/api/v1/conversations/c1/participants/u1/unban")
    }

    @Test
    fun `the conversation status is read at its own address`() = runTest {
        val (probe, api) = conversations()

        api.status("c1")

        assertThat(probe.call.method).isEqualTo("GET")
        assertThat(probe.call.path).isEqualTo("/api/v1/conversations/c1/status")
    }
}
