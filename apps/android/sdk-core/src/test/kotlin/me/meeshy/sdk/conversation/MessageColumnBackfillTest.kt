package me.meeshy.sdk.conversation

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.encodeToString
import me.meeshy.core.database.entity.MessageEntity
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.net.MeeshyApi
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class MessageColumnBackfillTest {

    private fun legacyRow(message: ApiMessage, sendState: String? = null) = MessageEntity(
        id = message.id,
        conversationId = message.conversationId,
        seq = null,
        payload = MeeshyApi.json.encodeToString(message),
        createdAt = 10L,
        cachedAt = 20L,
        sendState = sendState,
    )

    private fun message(id: String) = ApiMessage(
        id = id,
        conversationId = "c1",
        senderId = "u1",
        content = "salut",
        messageType = "image",
        pinnedAt = "2026-06-01T11:00:00Z",
        readCount = 2,
    )

    @Test
    fun `les lignes anterieures a la migration recoivent leurs colonnes depuis le payload`() = runHarnessTest { harness ->
        val dao = harness.database.messageDao()
        dao.upsertAll(listOf(legacyRow(message("m1")), legacyRow(message("m2"))))

        val processed = MessageColumnBackfill(harness.database, dao).run(batchSize = 1)

        assertThat(processed).isEqualTo(2)
        val row = dao.find("m1")!!
        assertThat(row.senderId).isEqualTo("u1")
        assertThat(row.messageType).isEqualTo("image")
        assertThat(row.pinnedAt).isNotNull()
        assertThat(row.readCount).isEqualTo(2)
        assertThat(row.contentText).isEqualTo("salut")
        assertThat(row.serverId).isEqualTo("m1")
        assertThat(dao.countUnbackfilled()).isEqualTo(0)
    }

    @Test
    fun `le rattrapage est idempotent`() = runHarnessTest { harness ->
        val dao = harness.database.messageDao()
        dao.upsertAll(listOf(legacyRow(message("m1"))))
        val backfill = MessageColumnBackfill(harness.database, dao)
        backfill.run()
        val afterFirst = dao.find("m1")

        val second = backfill.run()

        assertThat(second).isEqualTo(0)
        assertThat(dao.find("m1")).isEqualTo(afterFirst)
    }

    @Test
    fun `une ligne optimiste n'a pas d'identifiant serveur`() = runHarnessTest { harness ->
        val dao = harness.database.messageDao()
        dao.upsertAll(listOf(legacyRow(message("cid_x"), sendState = "SENDING")))

        MessageColumnBackfill(harness.database, dao).run()

        assertThat(dao.find("cid_x")!!.serverId).isNull()
    }

    @Test
    fun `un payload illisible est marque traite sans boucler`() = runHarnessTest { harness ->
        val dao = harness.database.messageDao()
        dao.upsertAll(listOf(legacyRow(message("m1")).copy(payload = "not json")))

        val processed = MessageColumnBackfill(harness.database, dao).run()

        assertThat(processed).isEqualTo(1)
        assertThat(dao.countUnbackfilled()).isEqualTo(0)
    }

    @Test
    fun `le rattrapage garde les colonnes locales`() = runHarnessTest { harness ->
        val dao = harness.database.messageDao()
        dao.upsertAll(listOf(legacyRow(message("m1")).copy(retryCount = 4, lastError = "boom", viewOnceOpenedAt = 5L)))

        MessageColumnBackfill(harness.database, dao).run()

        val row = dao.find("m1")!!
        assertThat(row.retryCount).isEqualTo(4)
        assertThat(row.lastError).isEqualTo("boom")
        assertThat(row.viewOnceOpenedAt).isEqualTo(5L)
    }

    private fun openedViewOnce(id: String) = message(id).copy(
        content = "secret",
        isViewOnce = true,
        consumedByMe = true,
        attachments = listOf(me.meeshy.sdk.model.ApiMessageAttachment(id = "a1", fileUrl = "https://cdn/a1.jpg", originalName = "passeport.jpg")),
        encryptedContent = "ciphertext==",
    )

    private suspend fun MessageCollaboratorHarness.decoded(id: String): ApiMessage =
        MeeshyApi.json.decodeFromString(ApiMessage.serializer(), database.messageDao().find(id)!!.payload)

    @Test
    fun `une vue unique heritee ouverte par soi mais jamais scellee est scellee au demarrage`() = runHarnessTest { harness ->
        val dao = harness.database.messageDao()
        dao.upsertAll(listOf(legacyRow(openedViewOnce("m1")).copy(columnsBackfilled = true)))

        val sealed = MessageColumnBackfill(harness.database, dao).sealOpenedViewOnces()

        assertThat(sealed).isEqualTo(1)
        val row = dao.find("m1")!!
        assertThat(row.contentText).isNull()
        assertThat(row.encryptedPayload).isNull()
        assertThat(row.viewOnceOpenedAt).isNotNull()
        val message = harness.decoded("m1")
        assertThat(message.content).isEmpty()
        assertThat(message.encryptedContent).isNull()
        assertThat(message.attachments.single().fileUrl).isNull()
        assertThat(message.attachments.single().originalName).isNull()
    }

    @Test
    fun `une vue unique dont seule la colonne d'ouverture est posee est scellee aussi`() = runHarnessTest { harness ->
        val dao = harness.database.messageDao()
        dao.upsertAll(listOf(legacyRow(openedViewOnce("m1").copy(consumedByMe = null)).copy(columnsBackfilled = true, viewOnceOpenedAt = 5L)))

        MessageColumnBackfill(harness.database, dao).sealOpenedViewOnces()

        assertThat(harness.decoded("m1").content).isEmpty()
        assertThat(dao.find("m1")!!.viewOnceOpenedAt).isEqualTo(5L)
    }

    @Test
    fun `le scellement au demarrage est idempotent et epargne les messages ordinaires`() = runHarnessTest { harness ->
        val dao = harness.database.messageDao()
        dao.upsertAll(
            listOf(
                legacyRow(openedViewOnce("m1")).copy(columnsBackfilled = true),
                legacyRow(message("m2").copy(consumedByMe = true)).copy(columnsBackfilled = true, viewOnceOpenedAt = 5L),
                legacyRow(message("m3")).copy(columnsBackfilled = true),
            ),
        )
        val backfill = MessageColumnBackfill(harness.database, dao)
        backfill.sealOpenedViewOnces()
        val afterFirst = dao.find("m1")

        val second = backfill.sealOpenedViewOnces()

        assertThat(second).isEqualTo(0)
        assertThat(dao.find("m1")).isEqualTo(afterFirst)
        assertThat(harness.decoded("m2").content).isEqualTo("salut")
        assertThat(harness.decoded("m3").content).isEqualTo("salut")
    }

    @Test
    fun `le passage de demarrage rattrape les colonnes puis scelle`() = runHarnessTest { harness ->
        val dao = harness.database.messageDao()
        dao.upsertAll(listOf(legacyRow(openedViewOnce("m1"))))
        val backfill = MessageColumnBackfill(harness.database, dao)

        kotlinx.coroutines.coroutineScope { backfill.launchIn(this).join() }

        assertThat(dao.countUnbackfilled()).isEqualTo(0)
        assertThat(harness.decoded("m1").content).isEmpty()
    }
}
