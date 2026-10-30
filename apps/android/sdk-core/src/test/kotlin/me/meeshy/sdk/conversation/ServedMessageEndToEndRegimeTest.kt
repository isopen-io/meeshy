package me.meeshy.sdk.conversation

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.first
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import me.meeshy.core.database.entity.ConversationEntity
import me.meeshy.sdk.e2ee.InMemoryEndToEndRegimeLedger
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.mayCurrentUserWrite
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.outbox.ConversationModeRead
import me.meeshy.sdk.outbox.ConversationModeReader
import me.meeshy.sdk.outbox.EndToEndOutboxAdmission
import me.meeshy.sdk.outbox.MutationSender
import me.meeshy.sdk.outbox.OutboxAdmissionVerdict
import me.meeshy.sdk.outbox.OutboxDrainer
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxLanes
import me.meeshy.sdk.outbox.OutboxMutation
import me.meeshy.sdk.outbox.SendResult
import me.meeshy.sdk.socket.MessageSocketManager
import me.meeshy.sdk.sync.SyncAccountProvider
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * #13792 — UN MESSAGE CHIFFRÉ DE BOUT EN BOUT REÇU SCELLE SA CONVERSATION POUR TOUT ENVOI HORS DU FIL. Le registre des régimes
 * apprend de chaque message servi (socket, page REST, accusé d'envoi), fil ouvert ou non, et la garde de l'outbox — que lisent la
 * réponse d'une bannière, le partage, l'humeur et le refus d'appel — relit en plus le fil en cache : un mode de liste périmé
 * (« server ») et une bascule manquée ne laissent partir aucun clair.
 */
@RunWith(RobolectricTestRunner::class)
class ServedMessageEndToEndRegimeTest {

    private class Account(var id: String? = "u-a") : SyncAccountProvider {
        override fun activeAccountId(): String? = id
    }

    private fun sealed(id: String = "m-sealed", conversationId: String = DIRECT) = ApiMessage(
        id = id,
        conversationId = conversationId,
        senderId = "u-peer",
        content = "[Encrypted]",
        createdAt = IngestFixtures.CREATED_AT,
        isEncrypted = true,
        encryptionMode = "e2ee",
    )

    private fun clear(id: String = "m-clear", conversationId: String = DIRECT, mode: String? = null) = ApiMessage(
        id = id,
        conversationId = conversationId,
        senderId = "u-peer",
        content = "salut",
        createdAt = IngestFixtures.CREATED_AT,
        isEncrypted = mode != null,
        encryptionMode = mode,
    )

    private suspend fun MessageCollaboratorHarness.cacheConversation(id: String, type: String, mode: String? = "server") {
        database.conversationDao().upsertAll(
            listOf(
                ConversationEntity(
                    id = id,
                    payload = MeeshyApi.json.encodeToString(ApiConversation(id = id, type = type, encryptionMode = mode)),
                    updatedAt = 0,
                    cachedAt = 0,
                ),
            ),
        )
    }

    private suspend fun MessageCollaboratorHarness.cachedConversation(id: String): ApiConversation =
        MeeshyApi.json.decodeFromString(database.conversationDao().find(id)!!.payload)

    private fun MessageCollaboratorHarness.admission(
        ledger: InMemoryEndToEndRegimeLedger,
        reader: ConversationModeReader = ConversationModeReader.Unavailable,
    ) = EndToEndOutboxAdmission(ledger, database.conversationDao(), database.messageDao(), outbox, reader)

    private fun servedAs(mode: String?, type: String = "direct", reads: MutableList<String>? = null) = ConversationModeReader { id ->
        reads?.add(id)
        ConversationModeRead.Served(ApiConversation(id = id, type = type, encryptionMode = mode))
    }

    private fun at(message: ApiMessage, iso: String) = message.copy(createdAt = iso)

    private fun activation(id: String = "n-on", conversationId: String = DIRECT, iso: String = T1) = ApiMessage(
        id = id,
        conversationId = conversationId,
        content = "chiffrement active",
        messageType = "system",
        createdAt = iso,
        metadata = buildJsonObject { put("kind", JsonPrimitive("encryption-enabled")); put("mode", JsonPrimitive("e2ee")) },
    )

    private fun deactivation(id: String = "n-off", conversationId: String = DIRECT, iso: String = T3) = ApiMessage(
        id = id,
        conversationId = conversationId,
        content = "chiffrement desactive",
        messageType = "system",
        createdAt = iso,
        metadata = buildJsonObject { put("kind", JsonPrimitive("encryption-disabled")); put("previousMode", JsonPrimitive("e2ee")) },
    )

    private fun MessageCollaboratorHarness.pipeline(ledger: InMemoryEndToEndRegimeLedger) =
        MessageIngestPipeline(database, regime = EndToEndRegimeKeeper(ledger, database))

    @Test
    fun `un message scelle recu par la socket scelle son tete-a-tete en cache server, et rien ne part en clair`() = runHarnessTest { harness ->
        val ledger = InMemoryEndToEndRegimeLedger(Account())
        harness.cacheConversation(DIRECT, type = "direct")
        val received = MutableSharedFlow<ApiMessage>()
        val socket: MessageSocketManager = mockk { every { messageReceived } returns received }
        val signal = ConversationRefreshSignal()
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
        val binding = IncomingMessageIngestBinding(
            socket = socket,
            pipeline = harness.pipeline(ledger),
            clock = harness.clock,
            signal = signal,
            scope = scope,
            windowMillis = 50L,
        )
        try {
            signal.changes.test {
                binding.attach()
                received.subscriptionCount.first { it > 0 }
                received.emit(sealed())
                assertThat(awaitItem()).containsExactly(DIRECT)
                cancelAndIgnoreRemainingEvents()
            }
        } finally {
            binding.detach()
            scope.cancel()
        }

        assertThat(ledger.isSealed(DIRECT)).isTrue()
        assertThat(harness.cachedConversation(DIRECT).mayCurrentUserWrite()).isFalse()
        // Le REGISTRE seul ferme le clair : ni la ligne reçue (effacée), ni la liste (servie de nouveau « server »).
        harness.database.messageDao().deleteByIds(listOf("m-sealed"))
        harness.cacheConversation(DIRECT, type = "direct", mode = "server")
        assertThat(harness.admission(ledger).verdictFor(DIRECT)).isEqualTo(OutboxAdmissionVerdict.WITHHOLD)

        harness.outbox.enqueue(OutboxMutation(OutboxKind.SEND_MESSAGE, OutboxLanes.forMessage(DIRECT), targetId = DIRECT, payload = "{}", cmid = "cid_reply"))
        val sent = mutableListOf<String>()
        OutboxDrainer(
            outbox = harness.outbox,
            senders = OutboxKind.entries.associateWith { MutationSender { row -> sent += row.cmid; SendResult.Success } },
            plaintextAdmission = harness.admission(ledger),
        ).drainLane(OutboxLanes.forMessage(DIRECT))
        assertThat(sent).isEmpty()
    }

    @Test
    fun `une page REST servie scelle la conversation ou elle est rangee`() = runHarnessTest { harness ->
        val ledger = InMemoryEndToEndRegimeLedger(Account())
        harness.cacheConversation(DIRECT, type = "direct")
        val store = RoomMessagePrefetchStore(harness.database, harness.database.messageDao(), harness.clock, regime = EndToEndRegimeKeeper(ledger, harness.database))

        store.persist(listOf(clear(), sealed()), DIRECT)

        assertThat(ledger.isSealed(DIRECT)).isTrue()
    }

    @Test
    fun `l accuse d envoi chiffre de bout en bout scelle la conversation`() = runHarnessTest { harness ->
        val ledger = InMemoryEndToEndRegimeLedger(Account())
        harness.cacheConversation(DIRECT, type = "direct")
        val sends = MessageSendCoordinator(harness.database, harness.database.messageDao(), harness.outbox, harness.clock, EndToEndRegimeKeeper(ledger, harness.database))

        sends.reconcileSent("cid_1", sealed(id = "srv1").copy(clientMessageId = "cid_1", senderId = "u-a"))

        assertThat(ledger.isSealed(DIRECT)).isTrue()
    }

    @Test
    fun `un message en clair ou chiffre au repos par le serveur n apprend rien et laisse partir le clair`() = runHarnessTest { harness ->
        val ledger = InMemoryEndToEndRegimeLedger(Account())
        harness.cacheConversation(DIRECT, type = "direct")

        harness.pipeline(ledger).ingest(listOf(clear(id = "m1"), clear(id = "m2", mode = "server"), clear(id = "m3", mode = "hybrid")), harness.clock.now)

        assertThat(ledger.isSealed(DIRECT)).isFalse()
        assertThat(harness.cachedConversation(DIRECT).encryptionMode).isEqualTo("server")
        assertThat(harness.admission(ledger).verdictFor(DIRECT)).isEqualTo(OutboxAdmissionVerdict.ADMIT)
    }

    @Test
    fun `le registre ne retrograde jamais, ni par un clair recu ensuite ni par une liste servie server`() = runHarnessTest { harness ->
        val ledger = InMemoryEndToEndRegimeLedger(Account())
        harness.cacheConversation(DIRECT, type = "direct")
        harness.pipeline(ledger).ingest(listOf(sealed()), harness.clock.now)

        harness.database.messageDao().deleteByIds(listOf("m-sealed"))
        harness.pipeline(ledger).ingest(listOf(clear(mode = "server")), harness.clock.now)
        harness.cacheConversation(DIRECT, type = "direct", mode = "server")

        assertThat(ledger.isSealed(DIRECT)).isTrue()
        assertThat(harness.admission(ledger).verdictFor(DIRECT)).isEqualTo(OutboxAdmissionVerdict.WITHHOLD)
    }

    @Test
    fun `l apprentissage est par compte, un message recu pour A ne scelle rien pour B`() = runHarnessTest { harness ->
        val account = Account("u-a")
        val ledger = InMemoryEndToEndRegimeLedger(account)
        harness.cacheConversation(DIRECT, type = "direct")

        harness.pipeline(ledger).ingest(listOf(sealed()), harness.clock.now)

        account.id = "u-b"
        assertThat(ledger.isSealed(DIRECT)).isFalse()
        account.id = "u-a"
        assertThat(ledger.isSealed(DIRECT)).isTrue()
    }

    @Test
    fun `sans compte actif, rien ne s apprend`() = runHarnessTest { harness ->
        val account = Account(null)
        val ledger = InMemoryEndToEndRegimeLedger(account)
        harness.cacheConversation(DIRECT, type = "direct")

        harness.pipeline(ledger).ingest(listOf(sealed()), harness.clock.now)

        account.id = "u-a"
        assertThat(ledger.isSealed(DIRECT)).isFalse()
    }

    @Test
    fun `un e2ee de groupe ne scelle pas le registre a vie, mais son fil en cache retient tout clair hors du fil`() = runHarnessTest { harness ->
        val ledger = InMemoryEndToEndRegimeLedger(Account())
        harness.cacheConversation(GROUP, type = "group")

        harness.pipeline(ledger).ingest(listOf(sealed(conversationId = GROUP)), harness.clock.now)

        assertThat(ledger.isSealed(GROUP)).isFalse()
        assertThat(harness.admission(ledger).verdictFor(GROUP)).isEqualTo(OutboxAdmissionVerdict.WITHHOLD)
    }

    @Test
    fun `un message scelle deja en cache avant la mise a jour retient le clair hors du fil`() = runHarnessTest { harness ->
        val ledger = InMemoryEndToEndRegimeLedger(Account())
        harness.cacheConversation(DIRECT, type = "direct")
        harness.seedSynced(sealed())

        assertThat(harness.admission(ledger).verdictFor(DIRECT)).isEqualTo(OutboxAdmissionVerdict.WITHHOLD)
    }

    @Test
    fun `un message scelle supprime ne retient plus rien`() = runHarnessTest { harness ->
        val ledger = InMemoryEndToEndRegimeLedger(Account())
        harness.cacheConversation(GROUP, type = "group")
        harness.seedSynced(sealed(conversationId = GROUP).copy(deletedAt = "2026-10-25T00:00:00Z"))

        assertThat(harness.admission(ledger).verdictFor(GROUP)).isEqualTo(OutboxAdmissionVerdict.ADMIT)
    }

    @Test
    fun `heritage d avant #12949 - une page d historique e2ee anterieure a la desactivation deja en cache ne scelle rien`() = runHarnessTest { harness ->
        val ledger = InMemoryEndToEndRegimeLedger(Account())
        harness.cacheConversation(DIRECT, type = "direct")
        harness.pipeline(ledger).ingest(listOf(deactivation(), at(clear(id = "m-after"), T4)), harness.clock.now)

        harness.pipeline(ledger).ingest(listOf(activation(), at(sealed(), T2), at(clear(id = "m-amb", mode = "").copy(isEncrypted = true), T2)), harness.clock.now)

        assertThat(ledger.isSealed(DIRECT)).isFalse()
        assertThat(harness.cachedConversation(DIRECT).encryptionMode).isEqualTo("server")
        assertThat(harness.admission(ledger).verdictFor(DIRECT)).isEqualTo(OutboxAdmissionVerdict.ADMIT)
    }

    @Test
    fun `heritage d avant #12949 - une trace e2ee posterieure a la derniere desactivation scelle toujours`() = runHarnessTest { harness ->
        val ledger = InMemoryEndToEndRegimeLedger(Account())
        harness.cacheConversation(DIRECT, type = "direct")
        harness.pipeline(ledger).ingest(listOf(activation(iso = T1), deactivation(iso = T2)), harness.clock.now)
        assertThat(ledger.isSealed(DIRECT)).isFalse()

        harness.pipeline(ledger).ingest(listOf(activation(id = "n-on-2", iso = T3), at(sealed(), T4)), harness.clock.now)

        assertThat(ledger.isSealed(DIRECT)).isTrue()
        assertThat(harness.admission(ledger).verdictFor(DIRECT)).isEqualTo(OutboxAdmissionVerdict.WITHHOLD)
    }

    @Test
    fun `heritage d avant #12949 - un chiffre ambigu de groupe ne retient que s il suit la derniere desactivation`() = runHarnessTest { harness ->
        val ledger = InMemoryEndToEndRegimeLedger(Account())
        harness.cacheConversation(GROUP, type = "group")
        val ambiguous = at(clear(id = "m-amb", conversationId = GROUP, mode = "").copy(isEncrypted = true), T2)
        harness.seedSynced(ambiguous)
        harness.seedSynced(deactivation(conversationId = GROUP, iso = T3))
        assertThat(harness.admission(ledger).verdictFor(GROUP)).isEqualTo(OutboxAdmissionVerdict.ADMIT)

        harness.seedSynced(ambiguous.copy(id = "m-amb-2", createdAt = T4))
        assertThat(harness.admission(ledger).verdictFor(GROUP)).isEqualTo(OutboxAdmissionVerdict.WITHHOLD)
    }

    @Test
    fun `le fil en cache n est lu que sur ses lignes recentes - une trace au-dela de la fenetre ne coute ni ne compte`() = runHarnessTest { harness ->
        val ledger = InMemoryEndToEndRegimeLedger(Account())
        harness.cacheConversation(GROUP, type = "group")
        harness.seedSynced(at(sealed(id = "m-old", conversationId = GROUP), "2026-01-01T00:00:00Z"))
        val newer = (1..EndToEndOutboxAdmission.CACHED_THREAD_WINDOW).map { i ->
            MessageEntityFactory.cached(
                at(clear(id = "m-$i", conversationId = GROUP), java.time.Instant.parse("2026-02-01T00:00:00Z").plusSeconds(i.toLong()).toString()),
                harness.clock.now,
            )
        }
        harness.database.messageDao().upsertAll(newer)

        assertThat(harness.admission(ledger).verdictFor(GROUP)).isEqualTo(OutboxAdmissionVerdict.ADMIT)

        harness.database.messageDao().deleteByIds(listOf("m-1"))
        assertThat(harness.admission(ledger).verdictFor(GROUP)).isEqualTo(OutboxAdmissionVerdict.WITHHOLD)
    }

    @Test
    fun `un tete-a-tete absent de Room ne s inscrit pas au registre, mais son fil en cache retient le clair`() = runHarnessTest { harness ->
        val ledger = InMemoryEndToEndRegimeLedger(Account())

        harness.pipeline(ledger).ingest(listOf(sealed(conversationId = ABSENT)), harness.clock.now)

        assertThat(ledger.isSealed(ABSENT)).isFalse()
        assertThat(harness.admission(ledger).verdictFor(ABSENT)).isEqualTo(OutboxAdmissionVerdict.WITHHOLD)
        assertThat(harness.admission(ledger, servedAs(null)).outOfThreadVerdictFor(ABSENT)).isEqualTo(OutboxAdmissionVerdict.WITHHOLD)
    }

    @Test
    fun `hors du fil, un registre non scelle relit le mode au serveur avant d admettre, meme en cache server`() = runHarnessTest { harness ->
        val ledger = InMemoryEndToEndRegimeLedger(Account())
        harness.cacheConversation(DIRECT, type = "direct")
        val reads = mutableListOf<String>()

        assertThat(harness.admission(ledger, servedAs("e2ee", reads = reads)).outOfThreadVerdictFor(DIRECT)).isEqualTo(OutboxAdmissionVerdict.WITHHOLD)
        assertThat(harness.admission(ledger, servedAs("server", reads = reads)).outOfThreadVerdictFor(DIRECT)).isEqualTo(OutboxAdmissionVerdict.ADMIT)
        assertThat(harness.admission(ledger, ConversationModeReader.Unavailable).outOfThreadVerdictFor(DIRECT)).isEqualTo(OutboxAdmissionVerdict.WAIT)
        assertThat(harness.admission(ledger) { ConversationModeRead.Inaccessible }.outOfThreadVerdictFor(DIRECT)).isEqualTo(OutboxAdmissionVerdict.UNREACHABLE)
        assertThat(reads).containsExactly(DIRECT, DIRECT)
    }

    @Test
    fun `hors du fil, un registre scelle refuse sans relire`() = runHarnessTest { harness ->
        val ledger = InMemoryEndToEndRegimeLedger(Account()).also { it.learn(DIRECT) }
        harness.cacheConversation(DIRECT, type = "direct")
        val reads = mutableListOf<String>()

        assertThat(harness.admission(ledger, servedAs("server", reads = reads)).outOfThreadVerdictFor(DIRECT)).isEqualTo(OutboxAdmissionVerdict.WITHHOLD)
        assertThat(reads).isEmpty()
    }

    private companion object {
        const val DIRECT = "c-direct"
        const val GROUP = "c-group"
        const val ABSENT = "c-absent"
        const val T1 = "2026-01-01T10:00:00.000Z"
        const val T2 = "2026-01-02T10:00:00.000Z"
        const val T3 = "2026-01-03T10:00:00.000Z"
        const val T4 = "2026-01-04T10:00:00.000Z"
    }
}
