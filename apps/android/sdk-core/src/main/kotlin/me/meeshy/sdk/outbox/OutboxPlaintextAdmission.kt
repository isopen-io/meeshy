package me.meeshy.sdk.outbox

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import kotlinx.serialization.decodeFromString
import me.meeshy.core.database.dao.ConversationDao
import me.meeshy.core.database.dao.MessageDao
import me.meeshy.core.database.entity.OutboxEntity
import me.meeshy.sdk.e2ee.EndToEndRegimeLedger
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.EndToEndRegime
import me.meeshy.sdk.net.MeeshyApi
import javax.inject.Inject

/**
 * **LA GARDE UNIQUE DU CLAIR DANS L'OUTBOX** (#12956) — lue par le drainer AVANT tout envoi et
 * avant tout téléversement. L'Android natif ne sait pas chiffrer de bout en bout (#13015) : un
 * message mis en file avant l'activation, un vocal, une photo ou une modification ne repartent
 * jamais en clair vers une conversation que cet appareil sait chiffrée de bout en bout.
 */
public interface OutboxPlaintextAdmission {
    /** `false` ⇒ la ligne ne part pas : elle est épuisée, et sa bulle passe en échec. */
    public suspend fun admits(row: OutboxEntity): Boolean

    public companion object {
        public const val REASON_END_TO_END: String = "E2EE_PLAINTEXT_WITHHELD: end-to-end encrypted conversation"

        public val AdmitAll: OutboxPlaintextAdmission = object : OutboxPlaintextAdmission {
            override suspend fun admits(row: OutboxEntity): Boolean = true
        }
    }
}

/**
 * Le régime lu pour chaque ligne qui porte du contenu vers une conversation : le registre du
 * compte, puis le mode de la ligne Room (que `ConversationCacheSource` ne rétrograde jamais).
 * `SEND_MESSAGE` vise sa conversation, `EDIT_MESSAGE` le message dont on lit la conversation, et
 * `UPLOAD_MEDIA` les messages qui l'attendent. Une conversation introuvable n'est pas scellée :
 * la passerelle refuse le clair de toute façon (#11216), cette garde ne fait que l'empêcher de
 * quitter l'appareil.
 */
public class EndToEndOutboxAdmission @Inject constructor(
    private val ledger: EndToEndRegimeLedger,
    private val conversationDao: ConversationDao,
    private val messageDao: MessageDao,
    private val outbox: OutboxRepository,
) : OutboxPlaintextAdmission {

    override suspend fun admits(row: OutboxEntity): Boolean =
        conversationsOf(row).none { sealed(it) }

    private suspend fun conversationsOf(row: OutboxEntity): List<String> = when (row.kindEnum) {
        OutboxKind.SEND_MESSAGE -> listOf(row.targetId)
        OutboxKind.EDIT_MESSAGE -> listOfNotNull(messageDao.find(row.targetId)?.conversationId)
        OutboxKind.UPLOAD_MEDIA -> outbox.dependentsOf(row.cmid)
            .filter { it.kindEnum == OutboxKind.SEND_MESSAGE }
            .map { it.targetId }
        else -> emptyList()
    }

    private suspend fun sealed(conversationId: String): Boolean {
        if (ledger.isSealed(conversationId)) return true
        val payload = conversationDao.find(conversationId)?.payload ?: return false
        val cached = runCatching { MeeshyApi.json.decodeFromString<ApiConversation>(payload) }.getOrNull() ?: return false
        return EndToEndRegime.isEndToEnd(cached.encryptionMode)
    }
}

@Module
@InstallIn(SingletonComponent::class)
public interface OutboxPlaintextAdmissionModule {
    @Binds
    public fun admission(impl: EndToEndOutboxAdmission): OutboxPlaintextAdmission
}
