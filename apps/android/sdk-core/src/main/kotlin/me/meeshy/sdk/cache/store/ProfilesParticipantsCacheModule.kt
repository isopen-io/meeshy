package me.meeshy.sdk.cache.store

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton
import me.meeshy.core.database.dao.CacheEntryDao
import me.meeshy.sdk.cache.CachePolicy
import me.meeshy.sdk.conversation.ParticipantsCacheSource
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.PaginatedParticipant
import me.meeshy.sdk.net.api.UserSearchResult
import me.meeshy.sdk.search.UserSearchCacheSource
import me.meeshy.sdk.session.AccountFence
import me.meeshy.sdk.user.ProfileCacheSource

/**
 * Inscrit a l'inventaire ([CacheStoreRegistry.roomStore]) les stores des profils, des participants pagines et de la
 * recherche d'utilisateurs : la deconnexion les vide, le passage en arriere-plan les ecrit, la pression memoire
 * lache leur L1. Aucun de ces stores n'existe hors de l'inventaire.
 */
@Module
@InstallIn(SingletonComponent::class)
internal object ProfilesParticipantsCacheModule {

    @Provides
    @Singleton
    fun profileCacheSource(registry: CacheStoreRegistry, dao: CacheEntryDao, fence: AccountFence): ProfileCacheSource =
        ProfileCacheSource(
            registry.roomStore(
                dao, ProfileCacheSource.NAMESPACE, CachePolicy.Profiles, MeeshyUser.serializer(), { it.id },
            ),
            fence,
        )

    @Provides
    @Singleton
    fun participantsCacheSource(
        registry: CacheStoreRegistry,
        dao: CacheEntryDao,
        fence: AccountFence,
    ): ParticipantsCacheSource = ParticipantsCacheSource(
        registry.roomStore(
            dao, ParticipantsCacheSource.NAMESPACE, CachePolicy.Participants,
            PaginatedParticipant.serializer(), { it.id },
        ),
        CacheCursorStore(dao, ParticipantsCacheSource.NAMESPACE),
        fence,
    )

    @Provides
    @Singleton
    fun userSearchCacheSource(registry: CacheStoreRegistry, dao: CacheEntryDao, fence: AccountFence): UserSearchCacheSource =
        UserSearchCacheSource(
            registry.roomStore(
                dao, UserSearchCacheSource.NAMESPACE, CachePolicy.UserSearch, UserSearchResult.serializer(), { it.id },
            ),
            fence,
        )
}
