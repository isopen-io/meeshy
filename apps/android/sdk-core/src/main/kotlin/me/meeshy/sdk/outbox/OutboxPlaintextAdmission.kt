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
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ConversationClearance
import me.meeshy.sdk.model.EndToEndRegime
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.net.NetworkResult
import javax.inject.Inject

/**
 * **LA GARDE UNIQUE DU CLAIR DANS L'OUTBOX** (#12956) — lue par le drainer AVANT tout envoi et
 * avant tout téléversement. L'Android natif ne sait pas chiffrer de bout en bout (#13015) : un
 * message mis en file avant l'activation, un vocal, une photo ou une modification ne repartent
 * jamais en clair vers une conversation que cet appareil sait chiffrée de bout en bout.
 */
public interface OutboxPlaintextAdmission {
    /** Ce que la ligne a le droit de faire maintenant : partir, être épuisée (bulle en échec), ou attendre qu'on sache. */
    public suspend fun judge(row: OutboxEntity): OutboxAdmissionVerdict

    public companion object {
        public const val REASON_END_TO_END: String = "E2EE_PLAINTEXT_WITHHELD: end-to-end encrypted conversation"

        public val AdmitAll: OutboxPlaintextAdmission = object : OutboxPlaintextAdmission {
            override suspend fun judge(row: OutboxEntity): OutboxAdmissionVerdict = OutboxAdmissionVerdict.ADMIT
        }
    }
}

/** Le verdict de la garde du clair (#13628) : le mode inconnu n'est ni un feu vert ni un refus définitif, c'est une attente. */
public enum class OutboxAdmissionVerdict {
    ADMIT,

    /** Conversation chiffrée de bout en bout : la ligne est épuisée, jamais envoyée en clair. */
    WITHHOLD,

    /** Mode inconnu et relecture impossible (hors ligne, erreur) : la ligne reste en attente, sans coûter d'essai. */
    WAIT,
}

/**
 * La relecture du mode d'une conversation au serveur (#13628) : une lecture qui ne transporte aucun contenu, dont le résultat est
 * mis en cache (et le mode appris au registre). `null` ⇒ illisible maintenant (hors ligne, erreur, session fermée).
 */
public fun interface ConversationModeReader {
    public suspend fun read(conversationId: String): ApiConversation?

    public companion object {
        public val Unavailable: ConversationModeReader = ConversationModeReader { null }
    }
}

public class RepositoryConversationModeReader @Inject constructor(
    private val conversations: ConversationRepository,
) : ConversationModeReader {
    override suspend fun read(conversationId: String): ApiConversation? {
        val fresh = (conversations.getById(conversationId) as? NetworkResult.Success)?.data ?: return null
        conversations.remember(fresh)
        return fresh
    }
}

/**
 * Le régime lu pour chaque ligne qui porte du contenu vers une conversation : le registre du
 * compte, puis le mode de la ligne Room (que `ConversationCacheSource` ne rétrograde jamais).
 * `SEND_MESSAGE` vise sa conversation, `EDIT_MESSAGE` le message dont on lit la conversation, et
 * `UPLOAD_MEDIA` les messages qui l'attendent. Une conversation introuvable ou jamais servie est INCONNUE
 * (#13628), et le clair n'en part pas avant qu'on l'ait relue.
 *
 * **Fail-closed sur l'INCONNU (#13628)** : un mode nul n'est « clair » que si la passerelle l'a SERVI nul
 * ([EndToEndRegimeLedger.isClearConfirmed]). Une conversation jamais servie (cache périmé, hors ligne) est relue au serveur
 * par [ConversationModeReader] AVANT tout clair ; toujours inconnue ⇒ [OutboxAdmissionVerdict.WAIT], la ligne reste en file.
 * Le chemin nominal (mode en cache) ne fait aucun appel de plus.
 */
public class EndToEndOutboxAdmission @Inject constructor(
    private val ledger: EndToEndRegimeLedger,
    private val conversationDao: ConversationDao,
    private val messageDao: MessageDao,
    private val outbox: OutboxRepository,
    private val modeReader: ConversationModeReader = ConversationModeReader.Unavailable,
) : OutboxPlaintextAdmission {

    override suspend fun judge(row: OutboxEntity): OutboxAdmissionVerdict {
        val clearances = conversationsOf(row).distinct().associateWith { clearanceOf(it) }
        if (clearances.values.any { it == ConversationClearance.END_TO_END }) return OutboxAdmissionVerdict.WITHHOLD
        for ((id, clearance) in clearances) {
            if (clearance != ConversationClearance.UNKNOWN) continue
            val served = modeReader.read(id) ?: return OutboxAdmissionVerdict.WAIT
            if (ConversationClearance.ofServed(served.encryptionMode) == ConversationClearance.END_TO_END) {
                return OutboxAdmissionVerdict.WITHHOLD
            }
        }
        return OutboxAdmissionVerdict.ADMIT
    }

    private suspend fun clearanceOf(conversationId: String): ConversationClearance =
        ConversationClearance.of(
            sealedInLedger = ledger.isSealed(conversationId),
            cachedMode = cachedMode(conversationId),
            servedClearConfirmed = ledger.isClearConfirmed(conversationId),
        )

    private suspend fun cachedMode(conversationId: String): String? =
        conversationDao.find(conversationId)?.payload
            ?.let { runCatching { MeeshyApi.json.decodeFromString<ApiConversation>(it) }.getOrNull() }
            ?.encryptionMode

    private suspend fun conversationsOf(row: OutboxEntity): List<String> = when (row.kindEnum) {
        OutboxKind.SEND_MESSAGE -> listOf(row.targetId)
        // La file du message porte sa conversation : une modification dont le message a quitté
        // Room reste gardée.
        OutboxKind.EDIT_MESSAGE -> listOfNotNull(messageDao.find(row.targetId)?.conversationId, laneConversation(row.lane))
        // La destination inscrite à la mise en file d'abord : un téléversement vidé AVANT que son
        // message ne soit mis en file n'a pas encore de dépendant, et `attachments/upload` ne
        // connaît pas la conversation — cette garde est la seule barrière.
        OutboxKind.UPLOAD_MEDIA -> listOfNotNull(uploadDestination(row)) +
            outbox.dependentsOf(row.cmid)
                .filter { it.kindEnum == OutboxKind.SEND_MESSAGE }
                .map { it.targetId }
        else -> emptyList()
    }

    private fun laneConversation(lane: String): String? =
        lane.takeIf { it.startsWith(MESSAGE_LANE_PREFIX) }?.removePrefix(MESSAGE_LANE_PREFIX)?.takeIf { it.isNotBlank() }

    private fun uploadDestination(row: OutboxEntity): String? =
        row.payload.takeIf { it.isNotBlank() }
            ?.let { runCatching { MeeshyApi.json.decodeFromString<MediaUploadPayload>(it) }.getOrNull() }
            ?.conversationId
            ?.takeIf { it.isNotBlank() }

    /** Cette conversation est-elle chiffrée de bout en bout pour CET appareil ? Inconnue ⇒ non scellée ICI : l'attente de l'inconnu est dans [judge]. */
    public suspend fun isConversationSealed(conversationId: String): Boolean {
        if (ledger.isSealed(conversationId)) return true
        val payload = conversationDao.find(conversationId)?.payload ?: return false
        val cached = runCatching { MeeshyApi.json.decodeFromString<ApiConversation>(payload) }.getOrNull() ?: return false
        return EndToEndRegime.isEndToEnd(cached.encryptionMode)
    }

    private companion object {
        val MESSAGE_LANE_PREFIX: String = OutboxLanes.forMessage("")
    }
}

@Module
@InstallIn(SingletonComponent::class)
public interface OutboxPlaintextAdmissionModule {
    @Binds
    public fun admission(impl: EndToEndOutboxAdmission): OutboxPlaintextAdmission

    @Binds
    public fun modeReader(impl: RepositoryConversationModeReader): ConversationModeReader
}
