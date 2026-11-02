package me.meeshy.sdk.conversation

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import me.meeshy.core.database.dao.upsertKeepingLocal
import me.meeshy.sdk.model.ApiForwardedFrom
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageReplyPreview
import me.meeshy.sdk.model.ApiMessageSender
import me.meeshy.sdk.model.ApiPostReplyTarget
import me.meeshy.sdk.model.MessageSticker
import me.meeshy.sdk.model.ServedProfileDecor
import me.meeshy.sdk.model.ServedProfileDecorItem
import me.meeshy.sdk.model.SharedPlace
import me.meeshy.sdk.model.TrackedLink
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class MessageRoundTripTest {

    private fun rich() = ApiMessage(
        id = "m1",
        conversationId = "c1",
        senderId = "u1",
        content = "voir https://meeshy.me/x",
        messageType = "text",
        createdAt = "2026-06-01T10:00:00Z",
        replyToId = "m0",
        replyTo = ApiMessageReplyPreview(id = "m0", content = "avant", senderDisplayName = "Ana"),
        postReplyTo = ApiPostReplyTarget(id = "p1", previewText = "story", reactionCount = 2),
        forwardedFromId = "m-src",
        forwardedFrom = ApiForwardedFrom(id = "m-src"),
        location = SharedPlace(latitude = 48.85, longitude = 2.35, name = "Paris"),
        sticker = MessageSticker(stickerId = "st", emoji = "x"),
        trackingLinks = listOf(TrackedLink(url = "https://meeshy.me/x", token = "tok")),
        metadata = buildJsonObject {
            put("kind", "call-summary")
        },
        sender = ApiMessageSender(
            id = "p-1",
            userId = "u1",
            type = "user",
            profileDecor = ServedProfileDecor(avatarRing = ServedProfileDecorItem("pack", "ring")),
        ),
        deliveredCount = 2,
        readCount = 1,
        recipientCount = 3,
        isEncrypted = true,
        encryptionMode = "e2ee",
        encryptedContent = "AAEC",
    )

    @Test
    fun `chaque bloc grave survit a l'ecriture puis a la relecture`() = runHarnessTest { harness ->
        val source = rich()
        harness.seedSynced(source)

        val reread = harness.database.messageDao().find("m1")!!.toLocalMessage().message

        assertThat(reread.replyTo).isEqualTo(source.replyTo)
        assertThat(reread.postReplyTo).isEqualTo(source.postReplyTo)
        assertThat(reread.forwardedFromId).isEqualTo("m-src")
        assertThat(reread.location).isEqualTo(source.location)
        assertThat(reread.sticker).isEqualTo(source.sticker)
        assertThat(reread.trackingLinks).isEqualTo(source.trackingLinks)
        assertThat(reread.sender?.hasAccount).isTrue()
        assertThat(reread.sender?.profileDecor?.avatarRing?.item).isEqualTo("ring")
        assertThat(reread.recipientCount).isEqualTo(3)
        assertThat(reread.encryptedContent).isEqualTo("AAEC")
        assertThat(reread.encryptionMode).isEqualTo("e2ee")
        assertThat(reread.metadata).isEqualTo(source.metadata)
    }

    @Test
    fun `les colonnes requetables sont derivees du message`() = runHarnessTest { harness ->
        harness.seedSynced(
            rich().copy(deletedAt = "2026-06-02T00:00:00Z", expiresAt = "2026-06-03T00:00:00Z", pinnedAt = "2026-06-01T11:00:00Z"),
        )

        val row = harness.database.messageDao().find("m1")!!

        assertThat(row.serverId).isEqualTo("m1")
        assertThat(row.senderId).isEqualTo("u1")
        assertThat(row.messageType).isEqualTo("text")
        assertThat(row.deletedAt).isEqualTo(java.time.Instant.parse("2026-06-02T00:00:00Z").toEpochMilli())
        assertThat(row.expiresAt).isNotNull()
        assertThat(row.pinnedAt).isNotNull()
        assertThat(row.isEncrypted).isTrue()
        assertThat(row.encryptedPayload).isEqualTo("AAEC")
        assertThat(row.deliveredCount).isEqualTo(2)
        assertThat(row.readCount).isEqualTo(1)
        assertThat(row.recipientCount).isEqualTo(3)
        assertThat(row.columnsBackfilled).isTrue()
    }

    @Test
    fun `un message chiffre n'a aucun texte indexable, un message clair si`() = runHarnessTest { harness ->
        harness.seedSynced(rich())
        harness.seedSynced(rich().copy(id = "m2", isEncrypted = null, encryptedContent = null))

        assertThat(harness.database.messageDao().find("m1")!!.contentText).isNull()
        assertThat(harness.database.messageDao().find("m2")!!.contentText).isEqualTo("voir https://meeshy.me/x")
    }

    @Test
    fun `un fil chiffre refuse d'ecrire un message en clair`() = runHarnessTest { harness ->
        val plain = rich().copy(isEncrypted = null)

        val failure = runCatching { MessageEntityFactory.cached(plain, cachedAt = 1L, threadEncrypted = true) }

        assertThat(failure.exceptionOrNull()).isInstanceOf(PlaintextInEncryptedThreadException::class.java)
        assertThat(harness.database.messageDao().find("m1")).isNull()
    }

    @Test
    fun `un rafraichissement REST n'efface ni le vue unique ouvert ni les tentatives d'envoi`() = runHarnessTest { harness ->
        val dao = harness.database.messageDao()
        harness.seedSynced(rich().copy(isViewOnce = true))
        dao.markViewOnceOpened("m1", openedAt = 77L)
        dao.recordSendAttempt("m1", sendState = null, retryCount = 3, lastError = "timeout")

        dao.upsertKeepingLocal(listOf(MessageEntityFactory.cached(rich().copy(isViewOnce = true), cachedAt = 99L)))

        val row = dao.find("m1")!!
        assertThat(row.viewOnceOpenedAt).isEqualTo(77L)
        assertThat(row.retryCount).isEqualTo(3)
        assertThat(row.lastError).isEqualTo("timeout")
        assertThat(row.changeVersion).isGreaterThan(0L)
        assertThat(row.cachedAt).isEqualTo(99L)
        val mapped = row.toLocalMessage()
        assertThat(mapped.message.isViewOnceOpenedByMe).isTrue()
        assertThat(mapped.retryCount).isEqualTo(3)
        assertThat(mapped.lastError).isEqualTo("timeout")
    }
}
