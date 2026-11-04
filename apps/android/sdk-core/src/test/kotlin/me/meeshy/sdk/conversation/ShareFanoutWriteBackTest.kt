package me.meeshy.sdk.conversation

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import me.meeshy.sdk.model.SendMessageRequest
import me.meeshy.sdk.net.MeeshyApi
import org.junit.Test

class ShareFanoutWriteBackTest {

    private fun payload(copyFrom: String?, attachments: List<String>? = null) = MeeshyApi.json.encodeToString(
        SendMessageRequest(
            content = "x",
            originalLanguage = "fr",
            clientMessageId = "cid_target",
            copyAttachmentsFromMessageId = copyFrom,
            attachmentIds = attachments,
        ),
    )

    @Test
    fun `la greffe remplace le cmid de l'origine par l'id reel`() {
        val grafted = ShareFanoutWriteBack.graft(payload("cid_origin"), "cid_origin", "srv-42")!!
        assertThat(MeeshyApi.json.decodeFromString<SendMessageRequest>(grafted).copyAttachmentsFromMessageId).isEqualTo("srv-42")
    }

    @Test
    fun `un autre placeholder, une charge illisible ou l'identite ne changent rien`() {
        assertThat(ShareFanoutWriteBack.graft(payload("cid_origin"), "cid_other", "srv")).isNull()
        assertThat(ShareFanoutWriteBack.graft(payload(null), "cid_origin", "srv")).isNull()
        assertThat(ShareFanoutWriteBack.graft("not json", "cid_origin", "srv")).isNull()
        assertThat(ShareFanoutWriteBack.graft(payload("same"), "same", "same")).isNull()
    }

    @Test
    fun `la greffe de medias laisse le champ de copie intact`() {
        assertThat(MessageMediaWriteBack.graft(payload("cid_origin"), "cid_origin", "srv")).isNull()
    }
}
