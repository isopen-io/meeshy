package me.meeshy.sdk.conversation

import androidx.room.withTransaction
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.sdk.e2ee.EndToEndRegimeLedger
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.EndToEndRegime
import me.meeshy.sdk.model.EndToEndRegimeMemory
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.socket.MessageSocketManager
import me.meeshy.sdk.socket.RealtimeBinding
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

/**
 * **APPRENDRE QU'UNE CONVERSATION EST CHIFFRÉE DE BOUT EN BOUT** (#12956) — le registre du compte
 * l'inscrit, et la ligne Room passe aussitôt au mode e2ee : le fil ouvert ferme son composeur, le
 * transfert, le partage et les stories l'excluent (`mayCurrentUserWrite`), sans attendre le
 * prochain balayage. Rien ne la rouvre au clair.
 */
@Singleton
class EndToEndRegimeKeeper @Inject constructor(
    private val ledger: EndToEndRegimeLedger,
    private val database: MeeshyDatabase,
) {
    fun isSealed(conversationId: String): Boolean = ledger.isSealed(conversationId)

    suspend fun learn(conversationId: String) {
        if (conversationId.isBlank()) return
        ledger.learn(conversationId)
        // Lue et réécrite dans UNE transaction : une synchronisation concurrente (non-lus,
        // dernier message, préférences) n'est jamais écrasée par une copie périmée de la ligne.
        database.withTransaction {
            val conversations = database.conversationDao()
            val row = conversations.find(conversationId) ?: return@withTransaction
            val cached = runCatching { MeeshyApi.json.decodeFromString<ApiConversation>(row.payload) }.getOrNull()
                ?: return@withTransaction
            val kept = EndToEndRegimeMemory.kept(cached, seenEndToEnd = true)
            if (kept === cached) return@withTransaction
            conversations.upsertAll(listOf(row.copy(payload = MeeshyApi.json.encodeToString(kept))))
        }
    }
}

/**
 * `conversation:encryption-changed` (#12522) appliqué même sans écran ouvert : une activation du
 * bout en bout faite depuis un autre appareil ferme le fil Android ouvert à l'instant. Une
 * rétrogradation annoncée est ignorée (#12949).
 */
@Singleton
class EndToEndRegimeBinding @Inject constructor(
    private val socket: MessageSocketManager,
    private val keeper: EndToEndRegimeKeeper,
) : RealtimeBinding {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var job: Job? = null

    override fun attach() {
        job?.cancel()
        job = scope.launch {
            socket.encryptionChanged.collect { event ->
                if (!EndToEndRegime.isEndToEnd(event.mode)) return@collect
                try {
                    keeper.learn(event.conversationId)
                } catch (cancelled: CancellationException) {
                    throw cancelled
                } catch (failure: Exception) {
                    Timber.w(failure, "conversation:encryption-changed : régime e2ee non retenu")
                }
            }
        }
    }

    override fun detach() {
        job?.cancel()
        job = null
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal interface EndToEndRegimeModule {
    @Binds
    @IntoSet
    fun bindRealtime(binding: EndToEndRegimeBinding): RealtimeBinding
}
