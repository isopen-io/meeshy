package me.meeshy.app.auth

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.flow.first
import me.meeshy.sdk.auth.AuthRepository
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.session.AnonymousSessionRepository
import me.meeshy.sdk.session.AnonymousSessionStore
import me.meeshy.sdk.sharelink.ShareLinkJoinRepository

/**
 * Binds the collaborators of [ShareLinkEntryViewModel] — the resolver plus the
 * three `fun interface` seams — to their concrete SDK sources. Boilerplate DI: the
 * decidable logic lives in the ViewModel and is covered there; these are opaque
 * passthroughs to already-tested repositories.
 */
@Module
@InstallIn(SingletonComponent::class)
public object ShareLinkEntryModule {

    @Provides
    public fun previewProvider(
        repository: AnonymousSessionRepository,
    ): ShareLinkPreviewProviding = ShareLinkPreviewProviding(repository::preview)

    @Provides
    public fun resolver(
        previewProvider: ShareLinkPreviewProviding,
        sessionStore: AnonymousSessionStore,
    ): ShareLinkEntryResolver = ShareLinkEntryResolver(previewProvider, sessionStore)

    @Provides
    public fun authState(
        authRepository: AuthRepository,
    ): ShareLinkAuthStateProviding = ShareLinkAuthStateProviding { authRepository.isAuthenticated }

    @Provides
    public fun authenticatedJoin(
        joinRepository: ShareLinkJoinRepository,
    ): AuthenticatedShareLinkJoining = AuthenticatedShareLinkJoining(joinRepository::joinAuthenticated)

    @Provides
    public fun knownConversationIds(
        conversationRepository: ConversationRepository,
    ): KnownConversationIdsProviding = KnownConversationIdsProviding {
        conversationRepository.cachedConversations().first().map { it.id }.toSet()
    }
}
