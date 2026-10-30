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
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.EndToEndRegime
import me.meeshy.sdk.model.EndToEndRegimeMemory
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

        /** #13790 — la passerelle a refusé un geste en clair (réaction, épingle, suppression pour tous) : il voyage en signal chiffré. */
        public const val REASON_SIGNAL_CHANNEL_REQUIRED: String = "E2EE_SIGNAL_CHANNEL_REQUIRED: plaintext gesture refused in an end-to-end conversation"

        /** #13628 — la passerelle refuse de servir la conversation (404, 403, 410) : son mode ne sera jamais connu, la ligne est épuisée. */
        public const val REASON_CONVERSATION_UNREACHABLE: String = "CONVERSATION_UNREACHABLE: mode cannot be learned, plaintext withheld"

        public val AdmitAll: OutboxPlaintextAdmission = object : OutboxPlaintextAdmission {
            override suspend fun judge(row: OutboxEntity): OutboxAdmissionVerdict = OutboxAdmissionVerdict.ADMIT
        }
    }
}

/**
 * **Le verdict du clair pour UNE conversation, lu par un geste qui part HORS de l'outbox** (#13803) : réagir à une pièce (socket
 * `attachment:reaction-add|remove`), supprimer une pièce (`DELETE /attachments/:id`). La même loi que la file
 * ([EndToEndOutboxAdmission.verdictFor]) : registre, mode en cache, puis relecture au serveur d'un mode inconnu. Seul
 * [OutboxAdmissionVerdict.ADMIT] laisse partir un geste qui ÉCRIT du clair ; ce qu'un geste qui efface en fait, son appelant
 * le dit.
 */
public fun interface ConversationPlaintextVerdict {
    public suspend fun verdictFor(conversationId: String): OutboxAdmissionVerdict
}

/** Le verdict de la garde du clair (#13628) : le mode inconnu n'est ni un feu vert ni un refus définitif, c'est une attente. */
public enum class OutboxAdmissionVerdict {
    ADMIT,

    /** Conversation chiffrée de bout en bout : la ligne est épuisée, jamais envoyée en clair. */
    WITHHOLD,

    /** Mode inconnu et relecture impossible (hors ligne, erreur) : la ligne reste en attente, sans coûter d'essai. */
    WAIT,

    /** Mode inconnu et la passerelle refuse définitivement de servir la conversation : la ligne est épuisée, sans clair. */
    UNREACHABLE,
}

/** Ce que la relecture du mode a appris (#13628). */
public sealed interface ConversationModeRead {
    public data class Served(val conversation: ApiConversation) : ConversationModeRead

    /** Illisible maintenant (hors ligne, 5xx, délai, session non prête) : on réessaiera. */
    public data object Unreadable : ConversationModeRead

    /** La passerelle refuse définitivement de la servir (introuvable, plus membre) : son mode ne sera jamais connu. */
    public data object Inaccessible : ConversationModeRead
}

/**
 * La relecture du mode d'une conversation au serveur (#13628) : une lecture qui ne transporte aucun contenu, dont le résultat est
 * mis en cache (et le mode appris au registre) ; sinon [ConversationModeRead.Unreadable] (on réessaiera) ou
 * [ConversationModeRead.Inaccessible] (la passerelle ne la servira jamais).
 */
public fun interface ConversationModeReader {
    public suspend fun read(conversationId: String): ConversationModeRead

    public companion object {
        public val Unavailable: ConversationModeReader = ConversationModeReader { ConversationModeRead.Unreadable }

        private val PERMANENT_STATUSES: Set<Int> = setOf(403, 404, 410)

        /** Le statut d'une lecture refusée : 403/404/410 sont définitifs, tout le reste (réseau, 401, 5xx, 429) se réessaie. */
        public fun refusalOf(httpStatus: Int?): ConversationModeRead =
            if (httpStatus in PERMANENT_STATUSES) ConversationModeRead.Inaccessible else ConversationModeRead.Unreadable
    }
}

public class RepositoryConversationModeReader @Inject constructor(
    private val conversations: ConversationRepository,
) : ConversationModeReader {
    override suspend fun read(conversationId: String): ConversationModeRead =
        when (val result = conversations.getById(conversationId)) {
            is NetworkResult.Success -> {
                conversations.rememberServed(result.data)
                ConversationModeRead.Served(result.data)
            }
            is NetworkResult.Failure -> ConversationModeReader.refusalOf(result.error.httpStatus)
        }
}

/**
 * Le régime lu pour chaque ligne qui porte du contenu vers une conversation : le registre du
 * compte, puis le mode de la ligne Room (que `ConversationCacheSource` ne rétrograde jamais).
 * `SEND_MESSAGE` vise sa conversation, `EDIT_MESSAGE` le message dont on lit la conversation,
 * `UPLOAD_MEDIA` les messages qui l'attendent, et réagir, épingler ou supprimer pour tous la conversation du message visé
 * (#13790) — introuvable, le geste ne part pas. Une conversation introuvable ou jamais servie est INCONNUE
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
) : OutboxPlaintextAdmission, ConversationPlaintextVerdict {

    override suspend fun judge(row: OutboxEntity): OutboxAdmissionVerdict {
        val conversations = conversationsOf(row)
        // #13790 — un geste en clair dont la conversation ne se retrouve pas ne part pas : rien ne dit qu'elle est claire.
        if (conversations.isEmpty() && row.kindEnum in PLAIN_SIGNAL_KINDS) return OutboxAdmissionVerdict.UNREACHABLE
        return judgeConversations(conversations)
    }

    /**
     * Le verdict du clair pour UNE conversation, AVANT qu'une bulle n'y naisse (la réponse d'une bannière, #13678) : la même
     * loi que [judge] — registre, mode en cache, puis relecture au serveur d'un mode inconnu —, de sorte que ni une
     * conversation chiffrée ni une conversation dont le mode est encore inconnu ne reçoit une bulle condamnée à ne jamais partir.
     */
    override suspend fun verdictFor(conversationId: String): OutboxAdmissionVerdict = judgeConversations(listOf(conversationId))

    private suspend fun judgeConversations(conversations: List<String>): OutboxAdmissionVerdict {
        val clearances = conversations.distinct().associateWith { clearanceOf(it) }
        if (clearances.values.any { it == ConversationClearance.END_TO_END }) return OutboxAdmissionVerdict.WITHHOLD
        for ((id, clearance) in clearances) {
            if (clearance != ConversationClearance.UNKNOWN) continue
            val served = when (val read = modeReader.read(id)) {
                is ConversationModeRead.Served -> read.conversation
                ConversationModeRead.Unreadable -> return OutboxAdmissionVerdict.WAIT
                ConversationModeRead.Inaccessible -> return OutboxAdmissionVerdict.UNREACHABLE
            }
            if (ConversationClearance.ofServed(served.encryptionMode) == ConversationClearance.END_TO_END) {
                return OutboxAdmissionVerdict.WITHHOLD
            }
        }
        return OutboxAdmissionVerdict.ADMIT
    }

    private suspend fun clearanceOf(conversationId: String): ConversationClearance {
        val known = ConversationClearance.of(
            sealedInLedger = ledger.isSealed(conversationId),
            cachedMode = cachedMode(conversationId),
            servedClearConfirmed = ledger.isClearConfirmed(conversationId),
        )
        if (known == ConversationClearance.END_TO_END) return known
        return if (cachedThreadSeals(conversationId)) ConversationClearance.END_TO_END else known
    }

    /**
     * #13792 — le fil en cache retient le clair comme le fil ouvert retient son composeur : un message scellé reçu (groupe
     * compris, que le registre n'apprend pas) ou un avis d'activation ferme la conversation, quoi que dise le mode de la liste.
     */
    private suspend fun cachedThreadSeals(conversationId: String): Boolean =
        EndToEndRegimeMemory.cachedThreadSeals(
            messageDao.endToEndCandidates(conversationId).mapNotNull { row ->
                runCatching { MeeshyApi.json.decodeFromString<ApiMessage>(row.payload) }.getOrNull()
            },
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
        // #13790 — réagir, épingler, supprimer pour tous : des gestes en clair que le bout en bout refuse (canal des signaux).
        // La conversation inscrite par la ligne d'abord (file du message, charge), puis celle du message en cache.
        OutboxKind.DELETE_MESSAGE -> listOfNotNull(laneConversation(row.lane), messageConversation(row.targetId)).distinct()
        OutboxKind.ADD_REACTION, OutboxKind.REMOVE_REACTION ->
            listOfNotNull(payloadOf<ReactionPayload>(row)?.conversationId, messageConversation(row.targetId)).distinct()
        OutboxKind.PIN_MESSAGE, OutboxKind.UNPIN_MESSAGE ->
            listOfNotNull(payloadOf<PinPayload>(row)?.conversationId, messageConversation(row.targetId)).distinct()
        else -> emptyList()
    }

    private suspend fun messageConversation(messageId: String): String? =
        messageDao.find(messageId)?.conversationId?.takeIf { it.isNotBlank() }

    private inline fun <reified P> payloadOf(row: OutboxEntity): P? =
        row.payload.takeIf { it.isNotBlank() }?.let { runCatching { MeeshyApi.json.decodeFromString<P>(it) }.getOrNull() }

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

        val PLAIN_SIGNAL_KINDS: Set<OutboxKind> = setOf(
            OutboxKind.DELETE_MESSAGE,
            OutboxKind.ADD_REACTION,
            OutboxKind.REMOVE_REACTION,
            OutboxKind.PIN_MESSAGE,
            OutboxKind.UNPIN_MESSAGE,
        )
    }
}

@Module
@InstallIn(SingletonComponent::class)
public interface OutboxPlaintextAdmissionModule {
    @Binds
    public fun admission(impl: EndToEndOutboxAdmission): OutboxPlaintextAdmission

    @Binds
    public fun modeReader(impl: RepositoryConversationModeReader): ConversationModeReader

    @Binds
    public fun conversationVerdict(impl: EndToEndOutboxAdmission): ConversationPlaintextVerdict
}
