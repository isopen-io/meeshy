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
import kotlinx.coroutines.withTimeoutOrNull
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

        /**
         * #13820 — le mode d'une conversation à relire ne se relit pas (429, 5xx, 401, 404 d'un proxy, délai) : la ligne attend
         * sans essai, au plus [OutboxDrainer.DEFERRED_MAX_WAIT_MS], puis échoue — bulle et octets gardés pour « Réessayer »,
         * jamais envoyée sur la foi du cache. Une pièce en attente ne retient pas les autres.
         */
        public const val REASON_MODE_UNCONFIRMED: String = "E2EE_MODE_UNCONFIRMED: conversation mode could not be read, plaintext held back"

        /** La raison d'une ligne — ou de celle dont elle dépend — qui a attendu en vain le mode de sa conversation. */
        public fun isModeUnconfirmed(reason: String?): Boolean = reason?.contains(REASON_MODE_UNCONFIRMED) == true

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

        private val PERMANENT_STATUSES: Set<Int> = setOf(403, 410)

        /**
         * #13820 — le code que la PASSERELLE pose sur « conversation introuvable », identique pour une absente et pour un
         * non-membre (#8099). Un 404 sans lui vient d'ailleurs (Traefik pendant un redémarrage) : il se réessaie.
         */
        public const val GATEWAY_NOT_FOUND_CODE: String = "CONVERSATION_NOT_FOUND"

        /** Le refus servi par la passerelle elle-même, jamais le 404 brut d'un proxy. */
        public fun isGatewayNotFound(httpStatus: Int?, code: String?): Boolean = httpStatus == 404 && code == GATEWAY_NOT_FOUND_CODE

        /**
         * Le statut d'une lecture refusée : 403/410 et le 404 de la passerelle ([GATEWAY_NOT_FOUND_CODE]) sont définitifs, tout le
         * reste (réseau, 401, 5xx, 429, 404 d'un proxy) se réessaie.
         */
        public fun refusalOf(httpStatus: Int?, code: String?): ConversationModeRead =
            if (httpStatus in PERMANENT_STATUSES || isGatewayNotFound(httpStatus, code)) {
                ConversationModeRead.Inaccessible
            } else {
                ConversationModeRead.Unreadable
            }
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
            is NetworkResult.Failure -> ConversationModeReader.refusalOf(result.error.httpStatus, result.error.code)
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
 * Le chemin nominal (mode en cache) ne fait aucun appel RÉSEAU de plus ; il relit en Room les [CACHED_THREAD_WINDOW] lignes
 * les plus récentes du fil (#13792). Un envoi hors du fil relit en plus le mode au serveur ([outOfThreadVerdictFor]).
 *
 * **Hors du fil, le mode se relit (#13820)** : un geste né hors du fil relit le mode au serveur avant de mettre en file
 * ([admit], [admitAll]) ; mis en file sans mode relu ([OutOfThreadAdmission.QUEUE_UNTIL_MODE_KNOWN]), il marque sa
 * conversation au registre et la file relit son mode avant le prochain clair — message ou pièce —, puis le cache suffit de
 * nouveau. Une pièce du composeur vers une conversation au mode connu ne relit rien : la passerelle refuse de toute façon de
 * STOCKER la pièce d'une conversation chiffrée (`conversationId`, 400 `E2EE_PLAINTEXT_REFUSED`, définitif). Une relecture
 * qui échoue ou dépasse [DRAIN_MODE_READ_BUDGET_MILLIS] attend ([OutboxAdmissionVerdict.WAIT]), bornée par
 * [OutboxDrainer.DEFERRED_MAX_WAIT_MS].
 */
public class EndToEndOutboxAdmission @Inject constructor(
    private val ledger: EndToEndRegimeLedger,
    private val conversationDao: ConversationDao,
    private val messageDao: MessageDao,
    private val outbox: OutboxRepository,
    private val modeReader: ConversationModeReader = ConversationModeReader.Unavailable,
) : OutboxPlaintextAdmission, ConversationPlaintextVerdict, OutOfThreadSendGate {

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

    /**
     * #13792 — le verdict d'un envoi HORS DU FIL (la réponse d'une bannière) : un registre non scellé ne suffit pas à admettre.
     * Un processus réveillé à froid par FCM n'a appris aucun régime — la donnée du push ne dit pas le bout en bout, et le mode
     * en cache peut être périmé (« server ») —, donc le mode est TOUJOURS relu au serveur avant le clair. Scellée (registre,
     * mode en cache, fil en cache) ⇒ refus sans relecture ; relecture impossible ⇒ [OutboxAdmissionVerdict.WAIT], jamais d'envoi.
     */
    public suspend fun outOfThreadVerdictFor(conversationId: String): OutboxAdmissionVerdict {
        if (clearanceOf(conversationId) == ConversationClearance.END_TO_END) return OutboxAdmissionVerdict.WITHHOLD
        return readVerdict(conversationId)
    }

    /**
     * #13820 — la porte d'un envoi HORS DU FIL : la loi de [outOfThreadVerdictFor], la relecture au serveur bornée dans le temps
     * du geste ([GESTURE_MODE_READ_BUDGET_MILLIS]) ; ce que l'appareil sait déjà (registre, cache, fil) se lit sans borne.
     * Un mode illisible maintenant ne refuse pas le geste et ne l'admet pas sur la foi du cache : la conversation est marquée
     * au registre ([EndToEndRegimeLedger.markModeUnconfirmed]) AVANT que la bulle n'entre en file, et [judge] relira son mode.
     */
    override suspend fun admit(conversationId: String): OutOfThreadAdmission {
        if (clearanceOf(conversationId) == ConversationClearance.END_TO_END) return OutOfThreadAdmission.END_TO_END
        val verdict = withTimeoutOrNull(GESTURE_MODE_READ_BUDGET_MILLIS) { readVerdict(conversationId) }
        return when (verdict ?: OutboxAdmissionVerdict.WAIT) {
            OutboxAdmissionVerdict.ADMIT -> OutOfThreadAdmission.SEND
            OutboxAdmissionVerdict.WITHHOLD -> OutOfThreadAdmission.END_TO_END
            OutboxAdmissionVerdict.UNREACHABLE -> OutOfThreadAdmission.UNREACHABLE
            OutboxAdmissionVerdict.WAIT -> {
                ledger.markModeUnconfirmed(conversationId)
                OutOfThreadAdmission.QUEUE_UNTIL_MODE_KNOWN
            }
        }
    }

    /** Le mode relu au serveur : servi, il redevient connu (le registre oublie qu'il était à relire). */
    private suspend fun readVerdict(conversationId: String): OutboxAdmissionVerdict =
        when (val read = modeReader.read(conversationId)) {
            is ConversationModeRead.Served -> {
                ledger.confirmMode(conversationId)
                if (ConversationClearance.ofServed(read.conversation.encryptionMode) == ConversationClearance.END_TO_END) {
                    OutboxAdmissionVerdict.WITHHOLD
                } else {
                    OutboxAdmissionVerdict.ADMIT
                }
            }
            ConversationModeRead.Unreadable -> OutboxAdmissionVerdict.WAIT
            ConversationModeRead.Inaccessible -> OutboxAdmissionVerdict.UNREACHABLE
        }

    private suspend fun judgeConversations(conversations: List<String>): OutboxAdmissionVerdict {
        val clearances = conversations.distinct().associateWith { clearanceOf(it) }
        if (clearances.values.any { it == ConversationClearance.END_TO_END }) return OutboxAdmissionVerdict.WITHHOLD
        for ((id, clearance) in clearances) {
            if (clearance != ConversationClearance.UNKNOWN) continue
            val verdict = withTimeoutOrNull(DRAIN_MODE_READ_BUDGET_MILLIS) { readVerdict(id) } ?: OutboxAdmissionVerdict.WAIT
            if (verdict != OutboxAdmissionVerdict.ADMIT) return verdict
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
        if (cachedThreadSeals(conversationId)) return ConversationClearance.END_TO_END
        // #13820 — un envoi hors du fil est parti en file sans mode relu : le cache ne suffit plus, il faut relire.
        return if (known == ConversationClearance.CLEAR && ledger.isModeUnconfirmed(conversationId)) ConversationClearance.UNKNOWN else known
    }

    /**
     * #13792 — le fil en cache retient le clair comme le fil ouvert retient son composeur : un message scellé reçu (groupe
     * compris, que le registre n'apprend pas) ou un avis d'activation ferme la conversation, quoi que dise le mode de la liste.
     * Seules les [CACHED_THREAD_WINDOW] lignes les plus récentes sont relues : depuis #12949 une conversation chiffrée ne reçoit
     * plus de clair, donc son fil récent porte sa trace ; une trace plus ancienne relève du registre, appris à l'ingestion.
     */
    private suspend fun cachedThreadSeals(conversationId: String): Boolean =
        EndToEndRegimeMemory.cachedThreadSeals(
            messageDao.endToEndCandidates(conversationId, CACHED_THREAD_WINDOW).mapNotNull { row ->
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
        // message ne soit mis en file n'a pas encore de dépendant. La passerelle refuse elle aussi
        // de stocker la pièce d'une conversation chiffrée qu'elle déclare (`conversationId`, #13820) ;
        // cette garde retient la pièce AVANT que ses octets ne partent.
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

    internal companion object {
        /** #13792 — les lignes récentes du fil que la garde relit (une lecture Room bornée, sans réseau). */
        internal const val CACHED_THREAD_WINDOW: Int = 200

        /** #13820 — la relecture du mode dans le temps d'un geste hors du fil : au-delà, l'envoi attend un mode connu. */
        internal const val GESTURE_MODE_READ_BUDGET_MILLIS: Long = 2_500L

        /** #13820 — la relecture d'un mode inconnu ou à relire, au drainage : au-delà, la ligne attend le prochain passage. */
        internal const val DRAIN_MODE_READ_BUDGET_MILLIS: Long = 10_000L

        private val MESSAGE_LANE_PREFIX: String = OutboxLanes.forMessage("")

        private val PLAIN_SIGNAL_KINDS: Set<OutboxKind> = setOf(
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

    @Binds
    public fun outOfThreadSendGate(impl: EndToEndOutboxAdmission): OutOfThreadSendGate
}
