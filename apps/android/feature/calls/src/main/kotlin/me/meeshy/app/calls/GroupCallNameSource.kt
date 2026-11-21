package me.meeshy.app.calls

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Inject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flow
import me.meeshy.sdk.call.ActiveCallRepository
import me.meeshy.sdk.call.CallSessionReader
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.conversation.ParticipantCacheRepository
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.call.group.GroupCallDirectory
import me.meeshy.sdk.model.call.group.GroupCallEvidence
import me.meeshy.sdk.model.isDirect

/** Où le maillage d'un appel de groupe lit les noms de ses membres et le titre du groupe (#13754). */
fun interface GroupCallNameSource {
    /** Une suite d'annuaires, du plus rapide au plus complet ; chacun contient ce que le précédent savait. */
    fun directoryFor(conversationId: String, callId: String): Flow<GroupCallDirectory>

    /**
     * La conversation de l'appel est connue pour ne pas être un direct (#13769) : ses noms se lisent dès la liaison
     * de l'appel, comme iOS les lit dès la sonnerie (#9092). Inconnue, elle ne dit rien.
     */
    suspend fun isGroupConversation(conversationId: String): Boolean = false

    companion object {
        val NONE = GroupCallNameSource { _, _ -> emptyFlow() }
    }
}

/**
 * Cache d'abord, comme iOS (`GroupCallMeshCoordinator.enrichNamesIfNeeded`) :
 *
 * 1. la conversation et son trombinoscope en cache (Room, sans réseau) nomment les membres et donnent le titre d'un
 *    groupe — avant tout aller-retour ;
 * 2. la session de l'appel, lue une fois par appel PAR SON IDENTIFIANT (`GET /calls/:id`, iOS `CallsEndpoint.byCallId`,
 *    #19650) — elle sert un invité qui n'est pas encore membre comme un membre, et dit la caméra et le micro de
 *    chacun ; à défaut, l'appel actif de la conversation (`GET /conversations/:id/active-call`). Elle complète les
 *    noms et dit qui la passerelle tient pour présent.
 *
 * Un échec garde l'annuaire déjà émis : le maillage n'a jamais moins que ce que le cache savait.
 */
class GroupCallNameResolver @Inject constructor(
    private val conversations: ConversationRepository,
    private val participants: ParticipantCacheRepository,
    private val activeCalls: ActiveCallRepository,
    private val sessions: CallSessionReader,
) : GroupCallNameSource {

    override fun directoryFor(conversationId: String, callId: String): Flow<GroupCallDirectory> = flow {
        if (conversationId.isBlank() && callId.isBlank()) return@flow
        val cached = cachedDirectory(conversationId)
        if (cached != GroupCallDirectory.EMPTY) emit(cached)
        val session = attempt { sessions.session(callId) }
            ?: conversationId.takeIf { it.isNotBlank() }?.let { attempt { activeCalls.activeCallFor(it) } }
            ?: return@flow
        emit(cached.merging(GroupCallDirectory.fromActiveCall(session, callId)))
    }

    private suspend fun cachedDirectory(conversationId: String): GroupCallDirectory {
        if (conversationId.isBlank()) return GroupCallDirectory.EMPTY
        val conversation = conversationOf(conversationId)
        val roster = attempt { participants.observe(conversationId).first() }
        return GroupCallDirectory.fromConversation(
            groupTitle = conversation?.takeUnless { it.isDirect }?.title,
            members = roster?.members.orEmpty(),
        )
    }

    override suspend fun isGroupConversation(conversationId: String): Boolean {
        if (conversationId.isBlank()) return false
        return GroupCallEvidence.fromConversationType(conversationOf(conversationId)?.type)
    }

    private suspend fun conversationOf(conversationId: String): ApiConversation? =
        attempt { conversations.cachedById(conversationId) }
            ?: attempt { conversations.getById(conversationId).getOrNull() }

    private suspend fun <T> attempt(block: suspend () -> T?): T? =
        try {
            block()
        } catch (cancel: CancellationException) {
            throw cancel
        } catch (_: Exception) {
            null
        }
}

@Module
@InstallIn(SingletonComponent::class)
interface GroupCallNameModule {
    @Binds
    fun bindGroupCallNameSource(impl: GroupCallNameResolver): GroupCallNameSource
}
