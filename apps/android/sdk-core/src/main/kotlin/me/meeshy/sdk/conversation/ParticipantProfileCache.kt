package me.meeshy.sdk.conversation

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import java.util.concurrent.ConcurrentHashMap
import javax.inject.Inject
import javax.inject.Singleton
import me.meeshy.sdk.model.ApiParticipantProfile
import me.meeshy.sdk.session.PerAccountCache

/** Qui lit : la fiche servie dépend du lecteur ET de son rôle dans la conversation. */
data class ParticipantProfileKey(
    val readerId: String,
    val conversationId: String,
    val participantId: String,
)

/**
 * La dernière fiche de participant servie, clé = lecteur + conversation + participant (ADR-032). Mémoire seule :
 * la fiche porte des faits que le gateway gate PAR LECTEUR (`email`, `entryLink`, `historyVisibleFrom`,
 * `canGrantHistory`) et rien ne doit survivre à la session. Garde-fous : jamais lue pour un autre lecteur (clé),
 * jetée quand le rôle du lecteur change ([get] compare le rôle de la copie à celui d'aujourd'hui), effacée par un
 * 404 ([evict]) et à la déconnexion ([clear]).
 */
@Singleton
class ParticipantProfileCache @Inject constructor() : PerAccountCache {

    private data class Entry(val profile: ApiParticipantProfile, val readerRole: String?)

    private val entries = ConcurrentHashMap<ParticipantProfileKey, Entry>()

    fun get(key: ParticipantProfileKey, readerRole: String?): ApiParticipantProfile? {
        val entry = entries[key] ?: return null
        if (entry.readerRole == readerRole) return entry.profile
        entries.remove(key)
        return null
    }

    fun put(key: ParticipantProfileKey, readerRole: String?, profile: ApiParticipantProfile) {
        entries[key] = Entry(profile, readerRole)
    }

    fun evict(key: ParticipantProfileKey) {
        entries.remove(key)
    }

    override suspend fun clear() {
        entries.clear()
    }
}

@Module
@InstallIn(SingletonComponent::class)
abstract class ParticipantProfileCacheModule {
    @Binds
    @IntoSet
    abstract fun bind(impl: ParticipantProfileCache): PerAccountCache
}
